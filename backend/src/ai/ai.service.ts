import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { SentimentCache } from './sentiment-cache.entity';
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

  constructor(
    @InjectRepository(SentimentCache, 'appConnection')
    private cacheRepo: Repository<SentimentCache>,
    @Inject('DATA_SOURCE') private dataDs: DataSource,
    private cfg: ConfigService,
    private settings: SettingsService,
  ) {
    const apiKey = this.cfg.get('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  private getCacheKey(type: string, filters: SentimentFilters): string {
    const str = JSON.stringify({ type, ...filters });
    return createHash('md5').update(str).digest('hex');
  }

  private async complete(systemPrompt: string, userPrompt: string, model: string, maxTokens: number): Promise<string> {
    if (!this.openai) return '';
    try {
      const res = await this.openai.chat.completions.create({
        model,
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
        this.logger.warn('OpenAI quota exceeded — returning mock data');
      } else {
        this.logger.error(`OpenAI error: ${e?.message}`);
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

    const conditions: string[] = ['t.date_published IS NOT NULL', 'LENGTH(t.post_text) > 20'];
    const params: any[] = [];
    if (filters.theme) { conditions.push('q.theme = ?'); params.push(filters.theme); }
    if (filters.country) { conditions.push('q.country = ?'); params.push(filters.country); }
    if (filters.dateFrom) { conditions.push('t.date_published >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push('t.date_published <= ?'); params.push(filters.dateTo); }

    const tweets = await this.dataDs.query(
      `SELECT t.post_text FROM x_tweets t
       JOIN x_search_queries q ON t.query_id = q.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.views_count DESC
       LIMIT 100`,
      params,
    );

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
    const conditions: string[] = ['t.date_published IS NOT NULL'];
    const params: any[] = [];
    if (filters.theme) { conditions.push('q.theme = ?'); params.push(filters.theme); }
    if (filters.country) { conditions.push('q.country = ?'); params.push(filters.country); }
    if (filters.dateFrom) { conditions.push('t.date_published >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push('t.date_published <= ?'); params.push(filters.dateTo); }

    const statsRows = await this.dataDs.query(
      `SELECT COUNT(*) as total, SUM(t.likes_count) as likes, SUM(t.views_count) as views,
              MIN(t.date_published) as earliest, MAX(t.date_published) as latest
       FROM x_tweets t JOIN x_search_queries q ON t.query_id = q.id
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    const topTweets = await this.dataDs.query(
      `SELECT t.post_text, t.views_count, t.likes_count, t.date_published, q.theme
       FROM x_tweets t JOIN x_search_queries q ON t.query_id = q.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.views_count DESC
       LIMIT 5`,
      params,
    );

    if (!this.openai) {
      return { answer: 'AI Assistant is not configured. Please add OPENAI_API_KEY to the server settings.', mocked: true };
    }

    const prompt = await this.settings.findByKey('chat_system');
    const stats = statsRows[0];
    const context = `Dataset context:
- Total tweets: ${stats.total}
- Total likes: ${stats.likes}
- Total views: ${stats.views}
- Date range: ${stats.earliest} to ${stats.latest}
- Active filters: theme=${filters.theme || 'all'}, country=${filters.country || 'all'}

Top 5 most viewed tweets:
${topTweets.map((t: any) => `- [${String(t.date_published).split('T')[0]}] ${t.post_text?.substring(0, 150)} (views: ${t.views_count})`).join('\n')}`;

    const userPrompt = this.settings.fill(prompt.userPromptTemplate, { context, question });
    const answer = await this.complete(prompt.systemPrompt, userPrompt, prompt.model, prompt.maxTokens);
    return { answer: answer || 'Unable to generate answer' };
  }
}
