import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PostAnalysis } from './post-analysis.entity';
import { TweetCache } from '../sync/tweet-cache.entity';

export interface AnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;        // -1 to +1
  sentimentConfidence: number;   // 0 to 1
  language: string;              // 'ar' | 'en' | 'mixed'
  subtopic: string;
  subtopics: string[];
  emotion: string;
  keyPhrases: string[];
  entities: Array<{ type: string; name: string }>;
  summary: string;
}

@Injectable()
export class AiAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(AiAnalysisService.name);
  private baseUrl: string;
  private model: string;
  private isRunning = false;

  constructor(
    @InjectRepository(PostAnalysis, 'appConnection')
    private analysisRepo: Repository<PostAnalysis>,
    @InjectRepository(TweetCache, 'appConnection')
    private tweetCacheRepo: Repository<TweetCache>,
    private cfg: ConfigService,
  ) {}

  onModuleInit() {
    this.baseUrl = this.cfg.get('AI_BASE_URL') ?? 'http://localhost:1337/v1';
    this.model   = this.cfg.get('AI_MODEL')    ?? 'qwen2.5-7b-instruct';
  }

  /** Current queue / progress status */
  async getStatus() {
    const total     = await this.tweetCacheRepo.count();
    const analyzed  = await this.analysisRepo.count();
    const failed    = await this.analysisRepo.count({ where: { errorMessage: In(['']) } });
    const pending   = total - analyzed;

    return {
      total,
      analyzed,
      pending,
      failed,
      isRunning: this.isRunning,
      modelUrl: this.baseUrl,
      model: this.model,
    };
  }

  /** Analyze a single post text, return structured result */
  async analyzeText(
    text: string,
    theme?: string,
    platform = 'twitter',
  ): Promise<AnalysisResult> {
    const prompt = this.buildPrompt(text, theme, platform);
    const t0 = Date.now();

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a social media analyst specialized in Middle East content. ' +
              'Always respond with valid JSON matching the schema provided.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`AI API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    const ms = Date.now() - t0;
    this.logger.debug(`Analyzed in ${ms}ms`);

    return {
      sentiment:           parsed.sentiment           ?? 'neutral',
      sentimentScore:      parsed.sentiment_score     ?? 0,
      sentimentConfidence: parsed.sentiment_confidence ?? 0.5,
      language:            parsed.language             ?? 'en',
      subtopic:            parsed.subtopic             ?? '',
      subtopics:           parsed.subtopics            ?? [],
      emotion:             parsed.emotion              ?? 'neutral',
      keyPhrases:          parsed.key_phrases          ?? [],
      entities:            parsed.entities             ?? [],
      summary:             parsed.summary              ?? '',
    };
  }

  /** Analyze and persist a single tweet by externalId */
  async analyzeTweet(externalId: string): Promise<PostAnalysis> {
    const tweet = await this.tweetCacheRepo.findOne({ where: { externalId } });
    if (!tweet) throw new Error(`Tweet ${externalId} not found in cache`);

    const existing = await this.analysisRepo.findOne({ where: { externalId } });
    if (existing && !existing.errorMessage) return existing;

    const t0 = Date.now();
    let record = existing ?? this.analysisRepo.create({ externalId, platform: 'twitter' });

    try {
      const result = await this.analyzeText(tweet.postText, tweet.theme);
      record.sentiment           = result.sentiment;
      record.sentimentScore      = result.sentimentScore;
      record.sentimentConfidence = result.sentimentConfidence;
      record.language            = result.language;
      record.subtopic            = result.subtopic;
      record.subtopicsJson       = JSON.stringify(result.subtopics);
      record.emotion             = result.emotion;
      record.keyPhrasesJson      = JSON.stringify(result.keyPhrases);
      record.entitiesJson        = JSON.stringify(result.entities);
      record.summary             = result.summary;
      record.modelUsed           = this.model;
      record.processingMs        = Date.now() - t0;
      record.errorMessage        = null;
    } catch (err: any) {
      record.errorMessage = err.message;
      this.logger.error(`Failed to analyze ${externalId}: ${err.message}`);
    }

    return this.analysisRepo.save(record);
  }

  /**
   * Batch process all unanalyzed tweets from cache.
   * Runs in background, concurrency = 3.
   * Returns immediately — check status via getStatus().
   */
  async startBatchAnalysis(limit = 500): Promise<{ started: boolean; queued: number }> {
    if (this.isRunning) return { started: false, queued: 0 };

    // Find tweets without analysis
    const analyzed = await this.analysisRepo
      .createQueryBuilder('a')
      .select('a.externalId')
      .where('a.errorMessage IS NULL')
      .getMany();

    const analyzedIds = new Set(analyzed.map(a => a.externalId));

    const tweets = await this.tweetCacheRepo.find({
      select: ['externalId', 'postText', 'theme'],
      take: limit,
    });

    const pending = tweets.filter(t => !analyzedIds.has(t.externalId));

    if (pending.length === 0) return { started: false, queued: 0 };

    this.isRunning = true;
    this.logger.log(`Starting batch analysis: ${pending.length} posts`);

    // Run in background without blocking the HTTP response
    this.runBatch(pending).finally(() => {
      this.isRunning = false;
      this.logger.log('Batch analysis complete');
    });

    return { started: true, queued: pending.length };
  }

  /** Re-analyze posts that previously failed */
  async retryFailed(): Promise<{ started: boolean; queued: number }> {
    const allFailed = await this.analysisRepo
      .createQueryBuilder('a')
      .where('a.errorMessage IS NOT NULL')
      .getMany();

    if (!allFailed.length) return { started: false, queued: 0 };

    const tweets = await this.tweetCacheRepo.find({
      where: { externalId: In(allFailed.map(f => f.externalId)) },
      select: ['externalId', 'postText', 'theme'],
    });

    if (!tweets.length) return { started: false, queued: 0 };

    this.isRunning = true;
    this.runBatch(tweets).finally(() => { this.isRunning = false; });
    return { started: true, queued: tweets.length };
  }

  /** Get analysis for specific tweet */
  async getForTweet(externalId: string): Promise<PostAnalysis | null> {
    return this.analysisRepo.findOne({ where: { externalId } });
  }

  /** Get analysis stats grouped by theme */
  async themeStats(limit = 100) {
    return this.analysisRepo
      .createQueryBuilder('a')
      .innerJoin(TweetCache, 't', 't.externalId = a.externalId')
      .select('t.theme', 'theme')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN a.sentiment = 'positive' THEN 1 ELSE 0 END)`, 'positive')
      .addSelect(`SUM(CASE WHEN a.sentiment = 'neutral'  THEN 1 ELSE 0 END)`, 'neutral')
      .addSelect(`SUM(CASE WHEN a.sentiment = 'negative' THEN 1 ELSE 0 END)`, 'negative')
      .addSelect('AVG(a.sentimentScore)', 'avgScore')
      .where('a.errorMessage IS NULL')
      .andWhere('t.theme IS NOT NULL')
      .andWhere("t.theme != ''")
      .groupBy('t.theme')
      .orderBy('total', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  /** Sub-topics with real engagement (views/likes/tweets) from tweet_cache */
  async subtopicEngagement(limit = 20) {
    return this.analysisRepo
      .createQueryBuilder('a')
      .innerJoin(TweetCache, 't', 't.externalId = a.externalId')
      .select('a.subtopic', 'subtopic')
      .addSelect('COUNT(*)', 'tweets')
      .addSelect('SUM(t.viewsCount)', 'views')
      .addSelect('SUM(t.likesCount)', 'likes')
      .addSelect('SUM(t.retweetsCount)', 'retweets')
      .addSelect('AVG(a.sentimentScore)', 'avgScore')
      .where('a.errorMessage IS NULL')
      .andWhere('a.subtopic IS NOT NULL')
      .andWhere("a.subtopic != ''")
      .groupBy('a.subtopic')
      .orderBy('SUM(t.viewsCount)', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  /** Top sub-topics with their sentiment breakdown */
  async subtopicStats(theme?: string) {
    const qb = this.analysisRepo
      .createQueryBuilder('a')
      .innerJoin(TweetCache, 't', 't.externalId = a.externalId')
      .select('a.subtopic', 'subtopic')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN a.sentiment = 'positive' THEN 1 ELSE 0 END)`, 'positive')
      .addSelect(`SUM(CASE WHEN a.sentiment = 'negative' THEN 1 ELSE 0 END)`, 'negative')
      .addSelect('AVG(a.sentimentScore)', 'avgScore')
      .where('a.errorMessage IS NULL')
      .andWhere('a.subtopic IS NOT NULL')
      .andWhere("a.subtopic != ''");

    if (theme) qb.andWhere('t.theme = :theme', { theme });

    return qb
      .groupBy('a.subtopic')
      .orderBy('total', 'DESC')
      .limit(20)
      .getRawMany();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async runBatch(
    tweets: Array<{ externalId: string; postText: string; theme?: string }>,
  ) {
    const CONCURRENCY = 3;
    let i = 0;

    async function worker(self: AiAnalysisService) {
      while (i < tweets.length) {
        const tweet = tweets[i++];
        try {
          await self.analyzeTweet(tweet.externalId);
        } catch (e: any) {
          self.logger.error(`Batch item failed: ${e.message}`);
        }
      }
    }

    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => worker(this)),
    );
  }

  private buildPrompt(text: string, theme?: string, platform = 'twitter'): string {
    const themeCtx = theme ? `\nMain theme context: "${theme}"` : '';
    return `Analyze the following ${platform} post and return a JSON object with exactly these fields:

{
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": number between -1.0 (very negative) and 1.0 (very positive),
  "sentiment_confidence": number between 0.0 and 1.0,
  "language": "ar" | "en" | "mixed" | "other",
  "subtopic": "specific narrow sub-topic (e.g. 'rental prices' not 'housing')",
  "subtopics": ["subtopic1", "subtopic2"],
  "emotion": "neutral" | "anger" | "joy" | "fear" | "surprise" | "disgust" | "sadness",
  "key_phrases": ["phrase1", "phrase2", "phrase3"],
  "entities": [{"type": "person|organization|location|policy", "name": "..."}],
  "summary": "One sentence describing what this post is about"
}
${themeCtx}

Post text:
"""
${text?.slice(0, 1000) ?? ''}
"""

Return only the JSON object, no explanation.`;
  }
}
