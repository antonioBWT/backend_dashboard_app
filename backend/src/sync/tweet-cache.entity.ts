import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('tweet_cache')
export class TweetCache {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 64 })
  externalId: string;

  @Column({ type: 'text', nullable: true })
  postText: string;

  @Column({ length: 128, nullable: true })
  author: string;

  @Column({ length: 32, nullable: true })
  postStatus: string;

  @Index()
  @Column({ length: 20, nullable: true })
  datePublished: string; // 'YYYY-MM-DD'

  @Index()
  @Column({ default: 0 })
  viewsCount: number;

  @Column({ default: 0 })
  likesCount: number;

  @Column({ default: 0 })
  retweetsCount: number;

  @Column({ default: 0 })
  repliesCount: number;

  @Index()
  @Column({ length: 128, nullable: true })
  theme: string;

  @Column({ length: 64, nullable: true })
  policy: string;

  @Index()
  @Column({ length: 64, nullable: true })
  country: string;
}
