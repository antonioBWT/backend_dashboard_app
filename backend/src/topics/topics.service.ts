import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Topic } from './topic.entity';
import { TopicAssignment } from './topic-assignment.entity';
import { SettingsService } from '../settings/settings.service';

interface DiscoveredTopic {
  name: string;
  description: string;
  keywords: string[];
}

interface ClassifiedTweet {
  externalId: string;
  topicName: string;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

@Injectable()
export class TopicsService {
  private readonly logger = new Logger(TopicsService.name);
  private openai: OpenAI | null = null;

  constructor(
    @InjectRepository(Topic, 'appConnection') private topicRepo: Repository<Topic>,
    @InjectRepository(TopicAssignment, 'appConnection') private assignmentRepo: Repository<TopicAssignment>,
    @Inject('DATA_SOURCE') private dataDs: DataSource,
    private cfg: ConfigService,
    private settings: SettingsService,
  ) {
    const apiKey = this.cfg.get('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
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
        this.logger.warn('OpenAI quota exceeded — falling back to mock data');
      } else {
        this.logger.error(`OpenAI error: ${e?.message}`);
      }
      return '';
    }
  }

  // ─── Main pipeline ────────────────────────────────────────────────────────

  async runWeeklyPipeline(filters: { country?: string; daysBack?: number } = {}) {
    const country = filters.country ?? 'UAE';
    const daysBack = filters.daysBack ?? 7;

    this.logger.log(`Starting topic pipeline: country=${country}, daysBack=${daysBack}`);

    const tweets = await this.sampleTopTweets(country, daysBack);
    if (!tweets.length) return { topics: [], message: 'No tweets found for period' };

    this.logger.log(`Sampled ${tweets.length} tweets for analysis`);

    const weekStart = this.getWeekKey();
    let topics = await this.topicRepo.find({ where: { weekStart, isActive: true } });

    if (!topics.length) {
      this.logger.log('No topics for this week — running discovery...');
      const discovered = await this.discoverTopics(tweets);
      topics = await this.saveTopics(discovered, weekStart);
      this.logger.log(`Discovered ${topics.length} topics`);
    }

    const assignments = await this.classifyTweets(tweets, topics);
    await this.saveAssignments(assignments, topics);

    const result = await this.getHotTopics({ country });
    this.logger.log(`Pipeline done: ${result.length} topics with assignments`);
    return result;
  }

  // ─── Step 1: Sample tweets ────────────────────────────────────────────────

  private async sampleTopTweets(country: string, daysBack: number) {
    return this.dataDs.query(`
      SELECT
        t.external_id, t.post_text, t.views_count, t.likes_count,
        DATE(t.date_published) as date
      FROM x_tweets t
      JOIN x_search_queries q ON t.query_id = q.id
      WHERE t.date_published >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND t.post_status = 'original post'
        AND q.country = ?
        AND LENGTH(t.post_text) > 30
        AND t.post_text IS NOT NULL
      ORDER BY (t.views_count + t.likes_count * 3) DESC
      LIMIT 300
    `, [daysBack, country]);
  }

  // ─── Step 2: Topic discovery ──────────────────────────────────────────────

  private async discoverTopics(tweets: any[]): Promise<DiscoveredTopic[]> {
    if (!this.openai) return this.getMockTopics();

    const prompt = await this.settings.findByKey('topic_discovery');
    const sample = tweets.slice(0, 150);
    const texts = sample.map((t, i) => `${i + 1}. ${t.post_text?.substring(0, 200)}`).join('\n');
    const userPrompt = this.settings.fill(prompt.userPromptTemplate, { tweets: texts });

    const text = await this.complete(prompt.systemPrompt, userPrompt, prompt.model, prompt.maxTokens);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return this.getMockTopics();

    try {
      return JSON.parse(match[0]) as DiscoveredTopic[];
    } catch {
      return this.getMockTopics();
    }
  }

  // ─── Step 3: Classify tweets ──────────────────────────────────────────────

  private async classifyTweets(tweets: any[], topics: Topic[]): Promise<ClassifiedTweet[]> {
    if (!this.openai) return this.getMockAssignments(tweets, topics);

    const prompt = await this.settings.findByKey('topic_classification');
    const topicList = topics.map((t, i) => `${i + 1}. ${t.name} — ${t.description}`).join('\n');

    const results: ClassifiedTweet[] = [];
    const BATCH = 25;

    for (let i = 0; i < tweets.length; i += BATCH) {
      const batch = tweets.slice(i, i + BATCH);
      const tweetLines = batch.map((t, j) => `[${j}] ${t.post_text?.substring(0, 180)}`).join('\n');
      const userPrompt = this.settings.fill(prompt.userPromptTemplate, { topics: topicList, tweets: tweetLines });

      try {
        const text = await this.complete(prompt.systemPrompt, userPrompt, prompt.model, prompt.maxTokens);
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const classified: any[] = JSON.parse(match[0]);
          for (const c of classified) {
            if (batch[c.index]) {
              results.push({
                externalId: String(batch[c.index].external_id),
                topicName: c.topic,
                confidence: c.confidence ?? 0.7,
                sentiment: c.sentiment ?? 'neutral',
              });
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Classification batch ${i} failed: ${e.message}`);
      }

      if (i + BATCH < tweets.length) await new Promise((r) => setTimeout(r, 300));
    }

    return results;
  }

  // ─── Save results ─────────────────────────────────────────────────────────

  private async saveTopics(discovered: DiscoveredTopic[], weekStart: string): Promise<Topic[]> {
    const entities = discovered.map((d) =>
      this.topicRepo.create({
        name: d.name,
        description: d.description,
        keywords: JSON.stringify(d.keywords ?? []),
        weekStart,
        isActive: true,
      }),
    );
    return this.topicRepo.save(entities);
  }

  private async saveAssignments(classified: ClassifiedTweet[], topics: Topic[]) {
    const topicMap = new Map(topics.map((t) => [t.name, t]));

    const externalIds = classified.map((c) => c.externalId);
    const tweetMeta: any[] = externalIds.length
      ? await this.dataDs.query(
          `SELECT external_id, views_count, likes_count, DATE(date_published) as date
           FROM x_tweets
           WHERE external_id IN (${externalIds.map(() => '?').join(',')})
           LIMIT 500`,
          externalIds,
        )
      : [];

    const metaMap = new Map(tweetMeta.map((t) => [String(t.external_id), t]));

    const entities = classified.flatMap((c) => {
      const topic = topicMap.get(c.topicName);
      const meta = metaMap.get(c.externalId);
      if (!topic) return [];
      return [this.assignmentRepo.create({
        tweetExternalId: c.externalId,
        topicId: topic.id,
        topicName: c.topicName,
        confidence: c.confidence,
        sentiment: c.sentiment,
        date: meta?.date instanceof Date
          ? meta.date.toISOString().split('T')[0]
          : meta?.date ? String(meta.date) : null,
        viewsCount: meta ? Number(meta.views_count) : 0,
        likesCount: meta ? Number(meta.likes_count) : 0,
      })];
    });

    if (!entities.length) return;

    await this.assignmentRepo
      .createQueryBuilder()
      .insert()
      .into(TopicAssignment)
      .values(entities)
      .orIgnore()
      .execute();

    for (const topic of topics) {
      const assignments = classified.filter((c) => c.topicName === topic.name);
      if (!assignments.length) continue;

      const counts = { positive: 0, neutral: 0, negative: 0 };
      assignments.forEach((a) => counts[a.sentiment] = (counts[a.sentiment] ?? 0) + 1);
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

      await this.topicRepo.update(topic.id, {
        assignedCount: topic.assignedCount + assignments.length,
        dominantSentiment: dominant,
      });
    }
  }

  // ─── Read hot topics ──────────────────────────────────────────────────────

  async getHotTopics(filters: { country?: string; daysBack?: number } = {}) {
    const daysBack = filters.daysBack ?? 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const rows = await this.assignmentRepo
      .createQueryBuilder('a')
      .select([
        'a.topicName as topicName',
        'COUNT(*) as tweetCount',
        'SUM(a.viewsCount) as totalViews',
        'SUM(a.likesCount) as totalLikes',
        `SUM(CASE WHEN a.sentiment = 'positive' THEN 1 ELSE 0 END) as positiveCount`,
        `SUM(CASE WHEN a.sentiment = 'negative' THEN 1 ELSE 0 END) as negativeCount`,
      ])
      .where('a.date >= :cutoff', { cutoff: cutoffStr })
      .groupBy('a.topicName')
      .orderBy('SUM(a.viewsCount)', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map((r) => {
      const pos = Number(r.positiveCount);
      const neg = Number(r.negativeCount);
      const total = Number(r.tweetCount);
      const sentiment = pos > neg * 1.5 ? 'positive' : neg > pos * 1.5 ? 'negative' : 'neutral';

      return {
        topic: r.topicName,
        count: total,
        views: Number(r.totalViews),
        likes: Number(r.totalLikes),
        sentiment,
        trend: 'rising',
      };
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getWeekKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = Math.ceil(
      ((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + 1) / 7,
    );
    return `${year}-${String(week).padStart(2, '0')}`;
  }

  private getMockTopics(): DiscoveredTopic[] {
    return [
      { name: 'UAE Housing Grants', description: 'Government housing programs and loans', keywords: ['housing', 'grant', 'إسكان'] },
      { name: 'Labour Law Reform', description: 'UAE labour law changes and worker rights', keywords: ['labour', 'workers', 'قانون العمل'] },
      { name: 'Public Transport Projects', description: 'Metro, bus and mobility initiatives', keywords: ['metro', 'transport', 'نقل'] },
      { name: 'Child Safety Policy', description: 'Child protection regulations', keywords: ['child', 'safety', 'حماية الطفل'] },
      { name: 'Cultural Heritage Events', description: 'Heritage sites and cultural programs', keywords: ['heritage', 'culture', 'تراث'] },
    ];
  }

  private getMockAssignments(tweets: any[], topics: Topic[]): ClassifiedTweet[] {
    return tweets.map((t, i) => ({
      externalId: String(t.external_id),
      topicName: topics[i % topics.length]?.name ?? 'UAE Housing Grants',
      confidence: 0.7,
      sentiment: (['positive', 'neutral', 'negative'] as const)[i % 3],
    }));
  }
}
