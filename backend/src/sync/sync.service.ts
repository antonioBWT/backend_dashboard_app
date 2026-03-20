import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AggDaily } from './agg-daily.entity';
import { AggAuthor } from './agg-author.entity';
import { SyncStatus } from './sync-status.entity';
import { TweetCache } from './tweet-cache.entity';

const BATCH_INSERT = 500;

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(AggDaily, 'appConnection') private aggDailyRepo: Repository<AggDaily>,
    @InjectRepository(AggAuthor, 'appConnection') private aggAuthorRepo: Repository<AggAuthor>,
    @InjectRepository(SyncStatus, 'appConnection') private syncStatusRepo: Repository<SyncStatus>,
    @InjectRepository(TweetCache, 'appConnection') private tweetCacheRepo: Repository<TweetCache>,
    @Inject('DATA_SOURCE') private dataDs: DataSource,
  ) {}

  async onModuleInit() {
    // Auto-sync on startup only if no data yet
    const count = await this.aggDailyRepo.count();
    if (count === 0) {
      this.logger.log('No aggregated data found. Starting initial sync...');
      this.syncAll().catch((e) => this.logger.error('Initial sync failed:', e.message));
    } else {
      this.logger.log(`Found ${count} agg_daily rows. Checking for incremental sync...`);
      this.syncIncremental().catch((e) => this.logger.error('Incremental sync failed:', e.message));
    }
  }

  async getStatus() {
    const statuses = await this.syncStatusRepo.find();
    const aggCount = await this.aggDailyRepo.count();
    const authorCount = await this.aggAuthorRepo.count();
    const tweetCacheCount = await this.tweetCacheRepo.count();
    return { statuses, aggDailyRows: aggCount, aggAuthorRows: authorCount, tweetCacheRows: tweetCacheCount };
  }

  // ─── Full sync (first run) ────────────────────────────────────────────────

  async syncAll() {
    await this.setSyncStatus('agg_daily', 'running', undefined, undefined, undefined, 0);
    try {
      await this.syncAggDaily(null);
      await this.syncAggAuthors(null);
      await this.setSyncStatus('agg_daily', 'done', undefined, undefined, undefined, 100);
      this.logger.log('Full sync completed. Starting tweet cache sync...');
      this.syncTweetCache(null).catch((e) => this.logger.error('Tweet cache sync failed:', e.message));
    } catch (e) {
      await this.setSyncStatus('agg_daily', 'error', e.message, undefined, undefined, 0);
      throw e;
    }
  }

  // ─── Incremental sync (daily) ─────────────────────────────────────────────

  async syncIncremental() {
    const status = await this.syncStatusRepo.findOne({ where: { key: 'agg_daily' } });
    const since = status?.lastSyncedDate ?? null;
    if (since) this.logger.log(`Incremental sync from ${since}`);
    await this.syncAggDaily(since);
    await this.syncAggAuthors(since);
    // Refresh tweet cache with recent tweets
    this.syncTweetCache(since).catch((e) => this.logger.error('Tweet cache sync failed:', e.message));
  }

  // ─── Sync agg_daily ───────────────────────────────────────────────────────

  private async syncAggDaily(since: string | null) {
    this.logger.log('Syncing agg_daily...');
    await this.setSyncStatus('agg_daily', 'running', undefined, undefined, undefined, 5);

    const dateFilter = since ? `AND DATE(t.date_published) > '${since}'` : '';

    const rows: any[] = await this.dataDs.query(`
      SELECT
        DATE(t.date_published)                                            AS date,
        COALESCE(q.theme, '__unclassified__')                            AS theme,
        COALESCE(q.country, 'Unknown')                                   AS country,
        COUNT(*)                                                          AS tweetCount,
        SUM(t.post_status = 'original post')                             AS originalCount,
        SUM(t.post_status = 'reply')                                     AS replyCount,
        SUM(t.post_status = 'quote tweet')                               AS quoteCount,
        COALESCE(SUM(t.likes_count), 0)                                  AS likesSum,
        COALESCE(SUM(t.retweets_count), 0)                               AS retweetsSum,
        COALESCE(SUM(t.views_count), 0)                                  AS viewsSum,
        COUNT(DISTINCT t.author)                                         AS uniqueAuthors
      FROM x_tweets t
      JOIN x_search_queries q ON t.query_id = q.id
      WHERE t.date_published IS NOT NULL ${dateFilter}
      GROUP BY DATE(t.date_published), q.theme, q.country
      ORDER BY date ASC
    `);

    this.logger.log(`Fetched ${rows.length} agg_daily rows from remote`);
    await this.setSyncStatus('agg_daily', 'running', undefined, undefined, undefined, 40);

    // Upsert in batches
    let inserted = 0;
    const total = rows.length;
    for (let i = 0; i < rows.length; i += BATCH_INSERT) {
      const batch = rows.slice(i, i + BATCH_INSERT);
      await this.aggDailyRepo
        .createQueryBuilder()
        .insert()
        .into(AggDaily)
        .values(batch.map((r) => ({
          date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
          theme: r.theme,
          country: r.country,
          tweetCount: Number(r.tweetCount),
          originalCount: Number(r.originalCount),
          replyCount: Number(r.replyCount),
          quoteCount: Number(r.quoteCount),
          likesSum: Number(r.likesSum),
          retweetsSum: Number(r.retweetsSum),
          viewsSum: Number(r.viewsSum),
          uniqueAuthors: Number(r.uniqueAuthors),
        })))
        .orUpdate(
          ['tweetCount', 'originalCount', 'replyCount', 'quoteCount',
            'likesSum', 'retweetsSum', 'viewsSum', 'uniqueAuthors'],
          ['date', 'theme', 'country'],
        )
        .updateEntity(false)
        .execute();
      inserted += batch.length;
      const progress = 40 + Math.round((inserted / total) * 50); // 40→90%
      await this.setSyncStatus('agg_daily', 'running', undefined, inserted, undefined, progress);
    }

    const lastDate = rows.at(-1)?.date;
    const lastDateStr = lastDate instanceof Date
      ? lastDate.toISOString().split('T')[0]
      : lastDate ? String(lastDate) : null;

    await this.setSyncStatus('agg_daily', 'done', undefined, inserted, lastDateStr ?? undefined, 90);
    this.logger.log(`agg_daily sync done: ${inserted} rows`);
  }

  // ─── Sync agg_authors ─────────────────────────────────────────────────────

  private async syncAggAuthors(since: string | null) {
    this.logger.log('Syncing agg_authors...');
    const dateFilter = since ? `AND DATE(t.date_published) > '${since}'` : '';

    const rows: any[] = await this.dataDs.query(`
      SELECT
        DATE_FORMAT(t.date_published, '%Y-%m')   AS yearMonth,
        COALESCE(q.theme, '__unclassified__')    AS theme,
        COALESCE(q.country, 'Unknown')           AS country,
        t.author,
        COUNT(*)                                  AS tweetCount,
        COALESCE(SUM(t.likes_count), 0)          AS likesSum,
        COALESCE(SUM(t.retweets_count), 0)       AS retweetsSum,
        COALESCE(SUM(t.views_count), 0)          AS viewsSum
      FROM x_tweets t
      JOIN x_search_queries q ON t.query_id = q.id
      WHERE t.date_published IS NOT NULL
        AND t.author IS NOT NULL ${dateFilter}
      GROUP BY yearMonth, q.theme, q.country, t.author
      HAVING viewsSum > 0
      ORDER BY viewsSum DESC
      LIMIT 50000
    `);

    this.logger.log(`Fetched ${rows.length} agg_author rows from remote`);

    for (let i = 0; i < rows.length; i += BATCH_INSERT) {
      const batch = rows.slice(i, i + BATCH_INSERT);
      await this.aggAuthorRepo
        .createQueryBuilder()
        .insert()
        .into(AggAuthor)
        .values(batch.map((r) => ({
          yearMonth: r.yearMonth,
          theme: r.theme,
          country: r.country,
          author: r.author,
          tweetCount: Number(r.tweetCount),
          likesSum: Number(r.likesSum),
          retweetsSum: Number(r.retweetsSum),
          viewsSum: Number(r.viewsSum),
        })))
        .orUpdate(
          ['tweetCount', 'likesSum', 'retweetsSum', 'viewsSum'],
          ['yearMonth', 'author', 'theme', 'country'],
        )
        .updateEntity(false)
        .execute();
    }

    this.logger.log(`agg_authors sync done: ${rows.length} rows`);
  }

  // ─── Tweet cache (serves Posts page from local SQLite) ────────────────────

  async syncTweetCache(since: string | null) {
    this.logger.log('Syncing tweet cache...');
    await this.setSyncStatus('tweet_cache', 'running');

    const baseSelect = `
      SELECT
        t.external_id, t.post_text, t.author, t.post_status,
        DATE(t.date_published) AS date_published,
        COALESCE(t.likes_count, 0)    AS likes_count,
        COALESCE(t.retweets_count, 0) AS retweets_count,
        COALESCE(t.replies_count, 0)  AS replies_count,
        COALESCE(t.views_count, 0)    AS views_count,
        q.theme, q.policy, q.country
      FROM x_tweets t
      JOIN x_search_queries q ON t.query_id = q.id
      WHERE t.date_published IS NOT NULL AND t.post_text IS NOT NULL
    `;

    // If incremental: only fetch new tweets by date
    // If full: fetch top 40k by views + 10k most recent (covering both sort modes)
    let rows: any[];
    if (since) {
      rows = await this.dataDs.query(
        `${baseSelect} AND DATE(t.date_published) > ? ORDER BY t.date_published DESC LIMIT 15000`,
        [since],
      );
    } else {
      const [topViews, recent] = await Promise.all([
        this.dataDs.query(`${baseSelect} ORDER BY t.views_count DESC LIMIT 40000`),
        this.dataDs.query(`${baseSelect} ORDER BY t.date_published DESC LIMIT 10000`),
      ]);
      // Deduplicate by external_id
      const seen = new Set<string>();
      rows = [];
      for (const r of [...topViews, ...recent]) {
        if (!seen.has(r.external_id)) { seen.add(r.external_id); rows.push(r); }
      }
    }

    this.logger.log(`Fetched ${rows.length} tweets for cache`);

    // Upsert into local SQLite tweet_cache
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_INSERT) {
      const batch = rows.slice(i, i + BATCH_INSERT);
      await this.tweetCacheRepo
        .createQueryBuilder()
        .insert()
        .into(TweetCache)
        .values(batch.map((r) => ({
          externalId: String(r.external_id),
          postText: r.post_text ?? '',
          author: r.author ?? '',
          postStatus: r.post_status ?? '',
          datePublished: r.date_published ? String(r.date_published) : undefined,
          viewsCount: Number(r.views_count),
          likesCount: Number(r.likes_count),
          retweetsCount: Number(r.retweets_count),
          repliesCount: Number(r.replies_count),
          theme: r.theme ?? null,
          policy: r.policy ?? null,
          country: r.country ?? null,
        })))
        .orUpdate(
          ['postText', 'author', 'postStatus', 'datePublished',
            'viewsCount', 'likesCount', 'retweetsCount', 'repliesCount',
            'theme', 'policy', 'country'],
          ['externalId'],
        )
        .updateEntity(false)
        .execute();
      upserted += batch.length;
    }

    await this.setSyncStatus('tweet_cache', 'done', undefined, upserted);
    this.logger.log(`Tweet cache sync done: ${upserted} rows`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async setSyncStatus(
    key: string,
    status: string,
    error?: string,
    totalRows?: number,
    lastSyncedDate?: string,
    progress?: number,
  ) {
    let entity = await this.syncStatusRepo.findOne({ where: { key } });
    if (!entity) {
      entity = this.syncStatusRepo.create({ key, status: 'idle', totalRows: 0, progress: 0 });
      await this.syncStatusRepo.save(entity); // INSERT to get id
    }
    entity.status = status;
    if (error !== undefined)          entity.lastError = error;
    if (totalRows !== undefined)      entity.totalRows = totalRows;
    if (lastSyncedDate !== undefined) entity.lastSyncedDate = lastSyncedDate;
    if (progress !== undefined)       entity.progress = progress;
    await this.syncStatusRepo.save(entity);
  }

  async remoteStats() {
    const [result] = await this.dataDs.query(`
      SELECT
        COUNT(*) as total,
        MIN(DATE(date_published)) as minDate,
        MAX(DATE(date_published)) as maxDate,
        COUNT(DISTINCT author) as uniqueAuthors
      FROM x_tweets
      WHERE date_published IS NOT NULL
    `);
    return {
      totalTweets: Number(result.total),
      minDate: result.minDate,
      maxDate: result.maxDate,
      uniqueAuthors: Number(result.uniqueAuthors),
    };
  }

  // ─── Local theme / country lists (fallback when remote is down) ──────────

  async getLocalThemes(): Promise<string[]> {
    const rows = await this.aggDailyRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.theme', 'theme')
      .where("a.theme != '__unclassified__'")
      .andWhere('a.theme IS NOT NULL')
      .orderBy('a.theme', 'ASC')
      .getRawMany();
    return rows.map((r: any) => r.theme).filter(Boolean);
  }

  async getLocalCountries(): Promise<string[]> {
    const rows = await this.aggDailyRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.country', 'country')
      .where('a.country IS NOT NULL')
      .andWhere("a.country != 'Unknown'")
      .orderBy('a.country', 'ASC')
      .getRawMany();
    return rows.map((r: any) => r.country).filter(Boolean);
  }

  // ─── Share of Voice + Hot Themes (used by StatsService) ──────────────────

  async queryShareOfVoice(filters: {
    country?: string; dateFrom?: string; dateTo?: string;
    granularity?: 'day' | 'week' | 'month';
  }) {
    const gran = filters.granularity ?? 'month';
    const groupExpr = gran === 'day' ? 'a.date'
      : gran === 'week' ? "strftime('%Y-%W', a.date)"
      : "strftime('%Y-%m', a.date)";

    const qb = this.aggDailyRepo.createQueryBuilder('a').select([
      `${groupExpr} as period`,
      'a.theme as theme',
      'SUM(a.tweetCount) as tweets',
      'SUM(a.viewsSum) as views',
    ]);
    if (filters.country)  qb.andWhere('a.country = :country', { country: filters.country });
    if (filters.dateFrom) qb.andWhere('a.date >= :df', { df: filters.dateFrom });
    if (filters.dateTo)   qb.andWhere('a.date <= :dt', { dt: filters.dateTo });
    qb.andWhere("a.theme != '__unclassified__'");
    qb.groupBy(`${groupExpr}, a.theme`).orderBy(groupExpr, 'ASC');
    return qb.getRawMany();
  }

  async queryHotThemes(filters: { country?: string; dateFrom?: string; dateTo?: string }) {
    // Use max date in DB (not today) so hot themes work with historical data
    const maxRow = await this.aggDailyRepo.createQueryBuilder('a')
      .select('MAX(a.date)', 'maxDate').getRawOne();
    const endDate = filters.dateTo || maxRow?.maxDate || new Date().toISOString().split('T')[0];
    const d         = new Date(endDate);
    const thisStart = new Date(d); thisStart.setDate(d.getDate() - 7);
    const prevStart = new Date(d); prevStart.setDate(d.getDate() - 14);
    const thisStr   = thisStart.toISOString().split('T')[0];
    const prevStr   = prevStart.toISOString().split('T')[0];

    const base = (qb: any) => {
      qb.andWhere("a.theme != '__unclassified__'");
      if (filters.country) qb.andWhere('a.country = :country', { country: filters.country });
      return qb;
    };

    const [thisWeek, prevWeek] = await Promise.all([
      base(this.aggDailyRepo.createQueryBuilder('a').select([
        'a.theme as theme',
        'SUM(a.tweetCount) as tweets',
        'SUM(a.viewsSum)   as views',
        'SUM(a.likesSum)   as likes',
      ]).where('a.date >= :s', { s: thisStr }).andWhere('a.date <= :e', { e: endDate }))
        .groupBy('a.theme').orderBy('SUM(a.viewsSum)', 'DESC').limit(10).getRawMany(),

      base(this.aggDailyRepo.createQueryBuilder('a').select([
        'a.theme as theme', 'SUM(a.tweetCount) as tweets',
      ]).where('a.date >= :s', { s: prevStr }).andWhere('a.date < :e', { e: thisStr }))
        .groupBy('a.theme').getRawMany(),
    ]);

    const prevMap = new Map(prevWeek.map((r: any) => [r.theme, Number(r.tweets)]));

    return thisWeek.map((r: any) => {
      const curr = Number(r.tweets);
      const prev = Number(prevMap.get(r.theme) ?? 0);
      const ratio = prev === 0 ? 2 : curr / prev;
      const trend = ratio > 1.15 ? 'rising' : ratio < 0.85 ? 'falling' : 'stable';
      const pct   = prev === 0 ? null : Math.round((curr - prev) / prev * 100);
      return {
        topic:   r.theme,
        count:   curr,
        views:   Number(r.views),
        likes:   Number(r.likes),
        prevCount: prev,
        changePct: pct,
        trend,
      };
    });
  }

  // ─── Query helpers (used by StatsService) ─────────────────────────────────

  async queryOverview(filters: { theme?: string; country?: string; dateFrom?: string; dateTo?: string }) {
    const qb = this.aggDailyRepo.createQueryBuilder('a').select([
      'SUM(a.tweetCount) as totalTweets',
      'SUM(a.likesSum) as totalLikes',
      'SUM(a.retweetsSum) as totalRetweets',
      'SUM(a.viewsSum) as totalViews',
      'SUM(a.originalCount) as originalPosts',
      'SUM(a.replyCount) as replies',
      'SUM(a.quoteCount) as quoteTweets',
    ]);
    this.applyFilters(qb, filters);
    // uniqueAuthors can't be summed — approximate from raw
    const row = await qb.getRawOne();
    return row;
  }

  async queryTimeline(filters: {
    theme?: string; country?: string; dateFrom?: string; dateTo?: string;
    granularity?: 'day' | 'week' | 'month';
  }) {
    const gran = filters.granularity ?? 'month';
    const groupExpr = gran === 'day' ? 'a.date'
      : gran === 'week' ? "strftime('%Y-%W', a.date)"
      : "strftime('%Y-%m', a.date)";

    const qb = this.aggDailyRepo.createQueryBuilder('a').select([
      `${groupExpr} as period`,
      'MIN(a.date) as periodStart',
      'SUM(a.tweetCount) as tweets',
      'SUM(a.likesSum) as likes',
      'SUM(a.retweetsSum) as retweets',
      'SUM(a.viewsSum) as views',
    ]);
    this.applyFilters(qb, filters);
    qb.groupBy(groupExpr).orderBy(groupExpr, 'ASC').limit(200);
    return qb.getRawMany();
  }

  async queryByTheme(filters: { country?: string; dateFrom?: string; dateTo?: string }) {
    const qb = this.aggDailyRepo.createQueryBuilder('a').select([
      'a.theme as theme',
      'SUM(a.tweetCount) as tweets',
      'SUM(a.likesSum) as likes',
      'SUM(a.retweetsSum) as retweets',
      'SUM(a.viewsSum) as views',
    ]);
    if (filters.country) qb.andWhere('a.country = :country', { country: filters.country });
    if (filters.dateFrom) qb.andWhere('a.date >= :df', { df: filters.dateFrom });
    if (filters.dateTo) qb.andWhere('a.date <= :dt', { dt: filters.dateTo });
    qb.andWhere("a.theme != '__unclassified__'");
    qb.groupBy('a.theme').orderBy('SUM(a.tweetCount)', 'DESC');
    return qb.getRawMany();
  }

  async queryPostTypes(filters: { theme?: string; country?: string; dateFrom?: string; dateTo?: string }) {
    const qb = this.aggDailyRepo.createQueryBuilder('a').select([
      'SUM(a.originalCount) as originals',
      'SUM(a.replyCount) as replies',
      'SUM(a.quoteCount) as quotes',
    ]);
    this.applyFilters(qb, filters);
    return qb.getRawOne();
  }

  async queryTopAuthors(filters: { theme?: string; country?: string; dateFrom?: string; dateTo?: string }) {
    const qb = this.aggAuthorRepo.createQueryBuilder('a').select([
      'a.author as author',
      'SUM(a.tweetCount) as tweets',
      'SUM(a.likesSum) as likes',
      'SUM(a.retweetsSum) as retweets',
      'SUM(a.viewsSum) as views',
    ]);
    if (filters.theme) qb.andWhere('a.theme = :theme', { theme: filters.theme });
    if (filters.country) qb.andWhere('a.country = :country', { country: filters.country });
    if (filters.dateFrom) {
      const month = filters.dateFrom.substring(0, 7);
      qb.andWhere('a.yearMonth >= :ymFrom', { ymFrom: month });
    }
    if (filters.dateTo) {
      const month = filters.dateTo.substring(0, 7);
      qb.andWhere('a.yearMonth <= :ymTo', { ymTo: month });
    }
    qb.groupBy('a.author').orderBy('SUM(a.viewsSum)', 'DESC').limit(20);
    return qb.getRawMany();
  }

  async queryByCountry(): Promise<{ period: string; country: string; tweets: number; views: number }[]> {
    const qb = this.aggDailyRepo.createQueryBuilder('a').select([
      "strftime('%Y-%m', a.date) as period",
      'a.country as country',
      'SUM(a.tweetCount) as tweets',
      'SUM(a.viewsSum) as views',
    ]);
    qb.andWhere('a.country IS NOT NULL').andWhere("a.country != ''");
    qb.groupBy("strftime('%Y-%m', a.date), a.country")
      .orderBy("strftime('%Y-%m', a.date)", 'ASC');
    return qb.getRawMany();
  }

  private applyFilters(qb: any, filters: any) {
    if (filters.theme) qb.andWhere('a.theme = :theme', { theme: filters.theme });
    if (filters.country) qb.andWhere('a.country = :country', { country: filters.country });
    if (filters.dateFrom) qb.andWhere('a.date >= :df', { df: filters.dateFrom });
    if (filters.dateTo) qb.andWhere('a.date <= :dt', { dt: filters.dateTo });
  }

  // ─── Hashtag analytics (from tweet_cache postText) ────────────────────────

  async queryTopHashtags(
    filters: { theme?: string; country?: string; dateFrom?: string; dateTo?: string },
    limit = 30,
  ): Promise<{ tag: string; views: number; likes: number; retweets: number; count: number }[]> {
    // TypeORM stores camelCase property names as columns in SQLite (no snake_case conversion)
    let sql = `SELECT "postText", "viewsCount", "likesCount", "retweetsCount"
               FROM tweet_cache
               WHERE "postText" IS NOT NULL AND "postText" LIKE '%#%'`;
    const params: any[] = [];

    if (filters.theme)    { sql += ` AND "theme" = ?`;          params.push(filters.theme); }
    if (filters.country)  { sql += ` AND "country" = ?`;        params.push(filters.country); }
    if (filters.dateFrom) { sql += ` AND "datePublished" >= ?`; params.push(filters.dateFrom); }
    if (filters.dateTo)   { sql += ` AND "datePublished" <= ?`; params.push(filters.dateTo); }

    const rows: any[] = await this.tweetCacheRepo.manager.query(sql, params);

    const map = new Map<string, { views: number; likes: number; retweets: number; count: number }>();
    for (const row of rows) {
      const tags = (row.postText?.match(/#[\w\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g) ?? [])
        .map((t: string) => t.toLowerCase());
      for (const tag of tags) {
        const curr = map.get(tag) ?? { views: 0, likes: 0, retweets: 0, count: 0 };
        curr.views    += Number(row.viewsCount) || 0;
        curr.likes    += Number(row.likesCount) || 0;
        curr.retweets += Number(row.retweetsCount) || 0;
        curr.count++;
        map.set(tag, curr);
      }
    }

    return [...map.entries()]
      .map(([tag, stats]) => ({ tag, ...stats }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  async queryHashtagTimeline(filters: {
    tag: string; country?: string; dateFrom?: string; dateTo?: string;
    granularity?: 'day' | 'week' | 'month';
  }): Promise<{ period: string; count: number; views: number }[]> {
    const gran = filters.granularity ?? 'month';

    const groupExpr = gran === 'day'
      ? '"datePublished"'
      : gran === 'week'
      ? `strftime('%Y-%W', "datePublished")`
      : `strftime('%Y-%m', "datePublished")`;

    let sql = `SELECT ${groupExpr} as period, COUNT(*) as count, SUM("viewsCount") as views
               FROM tweet_cache
               WHERE "postText" LIKE ? AND "datePublished" IS NOT NULL`;
    const params: any[] = [`%${filters.tag}%`];

    if (filters.country)  { sql += ` AND "country" = ?`;        params.push(filters.country); }
    if (filters.dateFrom) { sql += ` AND "datePublished" >= ?`; params.push(filters.dateFrom); }
    if (filters.dateTo)   { sql += ` AND "datePublished" <= ?`; params.push(filters.dateTo); }

    sql += ` GROUP BY ${groupExpr} ORDER BY ${groupExpr} ASC`;

    const rows: any[] = await this.tweetCacheRepo.manager.query(sql, params);
    return rows.map(r => ({ period: r.period, count: Number(r.count), views: Number(r.views) || 0 }));
  }
}
