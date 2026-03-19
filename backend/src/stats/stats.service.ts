import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SyncService } from '../sync/sync.service';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { SettingsService } from '../settings/settings.service';

export interface StatsFilters {
  theme?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
  granularity?: 'day' | 'week' | 'month';
}

@Injectable()
export class StatsService {
  constructor(
    @Inject('DATA_SOURCE') private ds: DataSource,
    private syncService: SyncService,
    private aiAnalysis: AiAnalysisService,
    private settings: SettingsService,
  ) {}

  getDashboardDefaults() {
    return this.settings.getDashboardDefaults();
  }

  async getOverview(filters: StatsFilters) {
    const row = await this.syncService.queryOverview(filters);
    // uniqueAuthors needs a separate fast query on local data
    const authorsRow = await this.syncService.queryTopAuthors(filters);
    return {
      ...row,
      totalTweets: Number(row?.totalTweets ?? 0),
      totalLikes: Number(row?.totalLikes ?? 0),
      totalRetweets: Number(row?.totalRetweets ?? 0),
      totalViews: Number(row?.totalViews ?? 0),
      originalPosts: Number(row?.originalPosts ?? 0),
      replies: Number(row?.replies ?? 0),
      quoteTweets: Number(row?.quoteTweets ?? 0),
      uniqueAuthors: authorsRow.length, // approximate
    };
  }

  async getTimeline(filters: StatsFilters) {
    return this.syncService.queryTimeline(filters);
  }

  async getByTheme(filters: StatsFilters) {
    return this.syncService.queryByTheme(filters);
  }

  async getByCountry() {
    return this.syncService.queryByCountry();
  }

  async getPostTypes(filters: StatsFilters) {
    const row = await this.syncService.queryPostTypes(filters);
    return [
      { type: 'original post', count: Number(row?.originals ?? 0) },
      { type: 'reply', count: Number(row?.replies ?? 0) },
      { type: 'quote tweet', count: Number(row?.quotes ?? 0) },
    ];
  }

  async getTopAuthors(filters: StatsFilters) {
    return this.syncService.queryTopAuthors(filters);
  }

  async getShareOfVoice(filters: StatsFilters) {
    return this.syncService.queryShareOfVoice(filters);
  }

  async getHotThemes(filters: StatsFilters) {
    return this.syncService.queryHotThemes(filters);
  }

  async getSentiment(filters: StatsFilters & { limit?: number }) {
    const byTheme = await this.getSentimentByTheme(filters, filters.limit);
    if (!byTheme.length) return { positive: 0, neutral: 0, negative: 0, total: 0, byTheme: [] };

    let totTweets = 0, totPos = 0, totNeg = 0;
    for (const t of byTheme) {
      totTweets += t.total;
      totPos    += t.positive * t.total;
      totNeg    += t.negative * t.total;
    }
    const positive = totTweets ? Math.round(totPos / totTweets) : 0;
    const negative = totTweets ? Math.round(totNeg / totTweets) : 0;
    const neutral  = 100 - positive - negative;

    return { positive, neutral, negative, total: totTweets, byTheme };
  }

  async getSentimentByTheme(filters: StatsFilters, limit = 100) {
    // Use real AI analysis data from post_analysis table
    const aiRows = await this.aiAnalysis.themeStats(limit);
    if (aiRows.length) {
      return aiRows
        .filter((r: any) => Number(r.total) > 0)
        .map((r: any) => {
          const total    = Number(r.total);
          const positive = total ? Math.round((Number(r.positive) / total) * 100) : 0;
          const negative = total ? Math.round((Number(r.negative) / total) * 100) : 0;
          const neutral  = 100 - positive - negative;
          return {
            theme:    r.theme,
            tweets:   total,
            positive: Math.max(0, positive),
            neutral:  Math.max(0, neutral),
            negative: Math.max(0, negative),
            avgScore: Number(r.avgScore ?? 0),
            total,
          };
        })
        .sort((a: any, b: any) => b.total - a.total);
    }
    return [];
  }

  async getTopHashtags(filters: StatsFilters) {
    return this.syncService.queryTopHashtags(filters);
  }

  async getHashtagTimeline(filters: StatsFilters & { tag: string }) {
    return this.syncService.queryHashtagTimeline(filters);
  }

  async getThemes(): Promise<string[]> {
    try {
      const rows = await this.ds.query(
        `SELECT DISTINCT theme FROM x_search_queries WHERE theme IS NOT NULL ORDER BY theme`,
      );
      return rows.map((r: any) => r.theme);
    } catch {
      return this.syncService.getLocalThemes();
    }
  }

  async getCountries(): Promise<string[]> {
    try {
      const rows = await this.ds.query(
        `SELECT DISTINCT country FROM x_search_queries WHERE country IS NOT NULL ORDER BY country`,
      );
      return rows.map((r: any) => r.country);
    } catch {
      return this.syncService.getLocalCountries();
    }
  }

  async getDateRange() {
    try {
      const rows = await this.ds.query(
        `SELECT MIN(date_published) as minDate, MAX(date_published) as maxDate FROM x_tweets WHERE date_published IS NOT NULL`,
      );
      return rows[0];
    } catch {
      // Fallback to local agg_daily date range
      return this.syncService.queryOverview({}).then(() =>
        this.syncService.queryTimeline({ granularity: 'month' }).then(rows => ({
          minDate: rows[0]?.periodStart ?? null,
          maxDate: rows[rows.length - 1]?.periodStart ?? null,
        }))
      );
    }
  }
}
