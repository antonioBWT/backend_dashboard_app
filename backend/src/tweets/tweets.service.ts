import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface TweetsFilters {
  theme?: string;
  country?: string;
  dateFrom?: string;
  dateTo?: string;
  postStatus?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'views' | 'likes' | 'retweets' | 'date';
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class TweetsService {
  constructor(
    @Inject('DATA_SOURCE') private remoteDs: DataSource,
  ) {}

  async findAll(filters: TweetsFilters) {
    const page   = Math.max(1, Number(filters.page ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(filters.limit ?? 20)));
    const offset = (page - 1) * limit;

    const sortColMap: Record<string, string> = {
      views:    'views_count',
      likes:    'likes_count',
      retweets: 'retweets_count',
      date:     'date_published',
    };
    const orderCol = sortColMap[filters.sortBy ?? 'views'] ?? 'views_count';
    const orderDir = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: any[]        = [];

    if (filters.theme)      { conditions.push('q.theme = ?');            params.push(filters.theme); }
    if (filters.country)    { conditions.push('q.country = ?');          params.push(filters.country); }
    if (filters.postStatus) { conditions.push('t.post_status = ?');      params.push(filters.postStatus); }
    if (filters.dateFrom)   { conditions.push('t.date_published >= ?');  params.push(filters.dateFrom); }
    if (filters.dateTo)     { conditions.push('t.date_published <= ?');  params.push(filters.dateTo); }
    if (filters.search)     { conditions.push('t.post_text LIKE ?');     params.push(`%${filters.search}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM x_tweets t
      LEFT JOIN x_search_queries q ON q.id = t.query_id
      ${where}
    `;

    const [rows, countRows] = await Promise.all([
      this.remoteDs.query(
        `SELECT t.*, q.theme, q.country ${baseQuery}
         ORDER BY t.${orderCol} ${orderDir}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.remoteDs.query(
        `SELECT COUNT(*) as total ${baseQuery}`,
        params,
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getTopTweets(filters: TweetsFilters & { metric?: 'views' | 'likes' }) {
    const sortCol = filters.metric === 'likes' ? 'likes_count' : 'views_count';

    const conditions: string[] = ["t.post_status = 'original post'"];
    const params: any[]        = [];

    if (filters.theme)    { conditions.push('q.theme = ?');           params.push(filters.theme); }
    if (filters.country)  { conditions.push('q.country = ?');         params.push(filters.country); }
    if (filters.dateFrom) { conditions.push('t.date_published >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo)   { conditions.push('t.date_published <= ?'); params.push(filters.dateTo); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await this.remoteDs.query(
      `SELECT t.*, q.theme, q.country
       FROM x_tweets t
       LEFT JOIN x_search_queries q ON q.id = t.query_id
       ${where}
       ORDER BY t.${sortCol} DESC
       LIMIT 10`,
      params,
    );

    return rows;
  }
}
