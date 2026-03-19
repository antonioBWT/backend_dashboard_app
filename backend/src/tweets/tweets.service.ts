import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TweetCache } from '../sync/tweet-cache.entity';

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
    @InjectRepository(TweetCache, 'appConnection') private cacheRepo: Repository<TweetCache>,
  ) {}

  async findAll(filters: TweetsFilters) {
    const page   = Math.max(1, Number(filters.page ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(filters.limit ?? 20)));
    const offset = (page - 1) * limit;

    const sortColMap: Record<string, string> = {
      views:    'viewsCount',
      likes:    'likesCount',
      retweets: 'retweetsCount',
      date:     'datePublished',
    };
    const orderCol = sortColMap[filters.sortBy ?? 'views'] ?? 'viewsCount';
    const orderDir = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.cacheRepo.createQueryBuilder('t');

    if (filters.theme)      qb.andWhere('t.theme = :theme',           { theme: filters.theme });
    if (filters.country)    qb.andWhere('t.country = :country',       { country: filters.country });
    if (filters.postStatus) qb.andWhere('t.postStatus = :postStatus', { postStatus: filters.postStatus });
    if (filters.dateFrom)   qb.andWhere('t.datePublished >= :from',   { from: filters.dateFrom });
    if (filters.dateTo)     qb.andWhere('t.datePublished <= :to',     { to: filters.dateTo });
    if (filters.search)     qb.andWhere('t.postText LIKE :search',    { search: `%${filters.search}%` });

    qb.orderBy(`t.${orderCol}`, orderDir).skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map(t => ({
        external_id:     t.externalId,
        post_text:       t.postText,
        author:          t.author,
        post_status:     t.postStatus,
        date_published:  t.datePublished,
        views_count:     t.viewsCount,
        likes_count:     t.likesCount,
        retweets_count:  t.retweetsCount,
        replies_count:   t.repliesCount,
        theme:           t.theme,
        country:         t.country,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getTopTweets(filters: TweetsFilters & { metric?: 'views' | 'likes' }) {
    const orderCol = filters.metric === 'likes' ? 'likesCount' : 'viewsCount';

    const qb = this.cacheRepo.createQueryBuilder('t')
      .where("t.postStatus = 'original post'");

    if (filters.theme)    qb.andWhere('t.theme = :theme',         { theme: filters.theme });
    if (filters.country)  qb.andWhere('t.country = :country',     { country: filters.country });
    if (filters.dateFrom) qb.andWhere('t.datePublished >= :from', { from: filters.dateFrom });
    if (filters.dateTo)   qb.andWhere('t.datePublished <= :to',   { to: filters.dateTo });

    const rows = await qb.orderBy(`t.${orderCol}`, 'DESC').take(10).getMany();

    return rows.map(t => ({
      external_id:     t.externalId,
      post_text:       t.postText,
      author:          t.author,
      post_status:     t.postStatus,
      date_published:  t.datePublished,
      views_count:     t.viewsCount,
      likes_count:     t.likesCount,
      retweets_count:  t.retweetsCount,
      replies_count:   t.repliesCount,
      theme:           t.theme,
      country:         t.country,
    }));
  }
}
