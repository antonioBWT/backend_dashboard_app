import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { SentimentCache } from './sentiment-cache.entity';
import { TweetCache } from '../sync/tweet-cache.entity';
import { SettingsService } from '../settings/settings.service';
import OpenAI from 'openai';

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

interface SentimentFilters {
  theme?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private defaultModel: string;

  constructor(
    @InjectRepository(SentimentCache, 'appConnection')
    private cacheRepo: Repository<SentimentCache>,
    @InjectRepository(TweetCache, 'appConnection')
    private tweetCacheRepo: Repository<TweetCache>,
    private cfg: ConfigService,
    private settings: SettingsService,
  ) {
    // CHATGPT_MAX_API_TOKEN takes priority over OPENAI_API_KEY
    const apiKey = this.cfg.get('CHATGPT_MAX_API_TOKEN') ?? this.cfg.get('OPENAI_API_KEY');
    this.defaultModel = this.cfg.get('CHATGPT_MODEL') ?? 'gpt-4o-mini';
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  private getCacheKey(type: string, filters: SentimentFilters): string {
    const str = JSON.stringify({ type, ...filters });
    return createHash('md5').update(str).digest('hex');
  }

  private async complete(systemPrompt: string, userPrompt: string, model: string, maxTokens: number): Promise<string> {
    if (!this.openai) return '';
    const useModel = model === 'n/a' ? this.defaultModel : model;
    try {
      const res = await this.openai.chat.completions.create({
        model: useModel,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      return res.choices[0]?.message?.content ?? '';
    } catch (e: any) {
      const code = e?.code ?? e?.status;
      if (code === 'insufficient_quota' || code === 429) {
        this.logger.warn('AI quota exceeded — returning mock data');
      } else {
        this.logger.error(`AI API error: ${e?.message}`);
      }
      return '';
    }
  }

  async getSentimentDistribution(filters: SentimentFilters) {
    const cacheKey = this.getCacheKey('sentiment_dist', filters);
    const cached = await this.cacheRepo.findOne({ where: { cacheKey } });

    if (cached) {
      const age = Date.now() - cached.createdAt.getTime();
      if (age < 6 * 60 * 60 * 1000) return cached.result;
    }

    // Build query from local tweet_cache (SQLite appConnection)
    const qb = this.tweetCacheRepo.createQueryBuilder('t')
      .select('t.postText', 'post_text')
      .where('LENGTH(t.postText) > 20')
      .orderBy('t.viewsCount', 'DESC')
      .limit(100);

    if (filters.theme)    qb.andWhere('t.theme = :theme',           { theme: filters.theme });
    if (filters.country)  qb.andWhere('t.country = :country',       { country: filters.country });
    if (filters.dateFrom) qb.andWhere('t.datePublished >= :from',   { from: filters.dateFrom });
    if (filters.dateTo)   qb.andWhere('t.datePublished <= :to',     { to: filters.dateTo });

    const tweets = await qb.getRawMany();

    if (!tweets.length) return { positive: 0, neutral: 0, negative: 0, total: 0 };

    if (!this.openai) {
      return { positive: 45, neutral: 35, negative: 20, total: tweets.length, mocked: true };
    }

    const prompt = await this.settings.findByKey('sentiment');
    const texts = tweets.map((t: any, i: number) => `${i + 1}. ${t.post_text?.substring(0, 200)}`).join('\n');
    const userPrompt = this.settings.fill(prompt.userPromptTemplate, { count: tweets.length, tweets: texts });

    const text = await this.complete(prompt.systemPrompt, userPrompt, prompt.model, prompt.maxTokens);
    const match = text.match(/\{[^}]+\}/);
    const counts = match ? JSON.parse(match[0]) : { positive: 0, neutral: 0, negative: 0 };
    const result = { ...counts, total: tweets.length };

    if (cached) await this.cacheRepo.remove(cached);
    await this.cacheRepo.save(this.cacheRepo.create({ cacheKey, result, ...filters }));

    return result;
  }

  async chat(question: string, filters: SentimentFilters) {
    const qb = this.tweetCacheRepo.createQueryBuilder('t')
      .select(['t.postText', 't.viewsCount', 't.likesCount', 't.datePublished', 't.theme']);

    if (filters.theme)    qb.andWhere('t.theme = :theme',         { theme: filters.theme });
    if (filters.country)  qb.andWhere('t.country = :country',     { country: filters.country });
    if (filters.dateFrom) qb.andWhere('t.datePublished >= :from', { from: filters.dateFrom });
    if (filters.dateTo)   qb.andWhere('t.datePublished <= :to',   { to: filters.dateTo });

    const [statsRow, topTweets] = await Promise.all([
      this.tweetCacheRepo.createQueryBuilder('t')
        .select('COUNT(*)', 'total')
        .addSelect('SUM(t.likesCount)', 'likes')
        .addSelect('SUM(t.viewsCount)', 'views')
        .addSelect('MIN(t.datePublished)', 'earliest')
        .addSelect('MAX(t.datePublished)', 'latest')
        .where(filters.theme    ? 't.theme = :theme'         : '1=1', { theme: filters.theme })
        .andWhere(filters.country  ? 't.country = :country'  : '1=1', { country: filters.country })
        .andWhere(filters.dateFrom ? 't.datePublished >= :from' : '1=1', { from: filters.dateFrom })
        .andWhere(filters.dateTo   ? 't.datePublished <= :to'   : '1=1', { to: filters.dateTo })
        .getRawOne(),
      qb.orderBy('t.viewsCount', 'DESC').limit(5).getMany(),
    ]);

    if (!this.openai) {
      return { answer: 'AI Assistant is not configured. Please add CHATGPT_MAX_API_TOKEN to the server settings.', mocked: true };
    }

    const prompt = await this.settings.findByKey('chat_system');
    const stats = statsRow;
    const context = `Dataset context:
- Total tweets: ${stats.total}
- Total likes: ${stats.likes}
- Total views: ${stats.views}
- Date range: ${stats.earliest} to ${stats.latest}
- Active filters: theme=${filters.theme || 'all'}, country=${filters.country || 'all'}

Top 5 most viewed tweets:
${topTweets.map((t: any) => `- [${t.datePublished}] ${t.postText?.substring(0, 150)} (views: ${t.viewsCount})`).join('\n')}`;

    const userPrompt = this.settings.fill(prompt.userPromptTemplate, { context, question });
    const answer = await this.complete(prompt.systemPrompt, userPrompt, prompt.model, prompt.maxTokens);
    return { answer: answer || 'Unable to generate answer' };
  }
}
