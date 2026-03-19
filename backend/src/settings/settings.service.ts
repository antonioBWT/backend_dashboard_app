import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptConfig } from './prompt-config.entity';

export interface DashboardDefaults {
  country: string;
  theme: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULTS: Omit<PromptConfig, 'id' | 'updatedAt'>[] = [
  {
    key: 'dashboard_defaults',
    label: 'Dashboard Default Filters',
    systemPrompt: JSON.stringify({ country: '', theme: '', dateFrom: '', dateTo: '' } as DashboardDefaults),
    userPromptTemplate: '',
    model: 'n/a',
    maxTokens: 0,
  },
  {
    key: 'sentiment',
    label: 'Sentiment Analysis',
    model: 'gpt-4o-mini',
    maxTokens: 200,
    systemPrompt: 'You are a social media analyst specializing in Middle East (UAE, Saudi Arabia, Gulf region) content. Analyze tweet sentiment accurately and return only valid JSON.',
    userPromptTemplate: `Analyze the sentiment of these {{count}} tweets about UAE/Middle East policies and public affairs.
Count how many are: positive, neutral, negative.
Respond ONLY with JSON: {"positive": N, "neutral": N, "negative": N}

Tweets:
{{tweets}}`,
  },
  {
    key: 'topic_discovery',
    label: 'Topic Discovery',
    model: 'gpt-4o-mini',
    maxTokens: 1000,
    systemPrompt: 'You are analyzing tweets from the Middle East region (UAE, Saudi Arabia, Gulf). Identify specific, concrete topics — not generic categories. Return only valid JSON arrays.',
    userPromptTemplate: `Identify 8-12 distinct, specific topics that appear in these tweets.
Focus on concrete current events, policies, social issues — not generic categories.
Good examples: "UAE Housing Grants Application", "Dubai Metro Expansion", "Saudi Vision 2030 Jobs"
Bad examples: "Politics", "Economy", "Social Issues"

Respond ONLY with a JSON array:
[
  {
    "name": "Short topic name (3-5 words)",
    "description": "One sentence description",
    "keywords": ["keyword1", "keyword2", "keyword3"]
  }
]

Tweets:
{{tweets}}`,
  },
  {
    key: 'topic_classification',
    label: 'Tweet Classification',
    model: 'gpt-4o-mini',
    maxTokens: 800,
    systemPrompt: 'You classify social media posts into predefined topics and determine their sentiment. Return only valid JSON arrays.',
    userPromptTemplate: `Classify each tweet into one of these topics. Also determine sentiment.

Topics:
{{topics}}

For each tweet [index], respond with JSON:
{"index": 0, "topic": "exact topic name", "confidence": 0.0-1.0, "sentiment": "positive|neutral|negative"}

If a tweet doesn't clearly fit any topic, use the closest one with low confidence (0.3).

Tweets:
{{tweets}}

Respond ONLY with a JSON array of classifications.`,
  },
  {
    key: 'chat_system',
    label: 'AI Chat Assistant',
    model: 'gpt-4o-mini',
    maxTokens: 400,
    systemPrompt: 'You are a data analyst assistant for a UAE/Middle East social media analytics dashboard built for PwC. Answer questions about the Twitter/X data concisely and factually. Focus on insights, trends, and actionable observations. Be professional and analytical.',
    userPromptTemplate: `{{context}}

Question: {{question}}`,
  },
];

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(PromptConfig, 'appConnection')
    private promptRepo: Repository<PromptConfig>,
  ) {}

  async onModuleInit() {
    for (const def of DEFAULTS) {
      const exists = await this.promptRepo.findOne({ where: { key: def.key } });
      if (!exists) {
        await this.promptRepo.save(this.promptRepo.create(def));
      }
    }
  }

  async findAll(): Promise<PromptConfig[]> {
    return this.promptRepo.find({ order: { id: 'ASC' } });
  }

  async findByKey(key: string): Promise<PromptConfig> {
    const p = await this.promptRepo.findOne({ where: { key } });
    if (!p) throw new NotFoundException(`Prompt "${key}" not found`);
    return p;
  }

  async update(key: string, dto: Partial<Pick<PromptConfig, 'systemPrompt' | 'userPromptTemplate' | 'model' | 'maxTokens' | 'label'>>) {
    const p = await this.findByKey(key);
    Object.assign(p, dto);
    return this.promptRepo.save(p);
  }

  async getDashboardDefaults(): Promise<DashboardDefaults> {
    const p = await this.promptRepo.findOne({ where: { key: 'dashboard_defaults' } });
    try { return JSON.parse(p?.systemPrompt ?? '{}'); } catch { return { country: '', theme: '', dateFrom: '', dateTo: '' }; }
  }

  async updateDashboardDefaults(data: DashboardDefaults): Promise<DashboardDefaults> {
    const p = await this.promptRepo.findOne({ where: { key: 'dashboard_defaults' } });
    if (p) {
      p.systemPrompt = JSON.stringify(data);
      await this.promptRepo.save(p);
    }
    return data;
  }

  /** Fill template variables: replaceVars('Hello {{name}}', { name: 'World' }) */
  fill(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  }
}
