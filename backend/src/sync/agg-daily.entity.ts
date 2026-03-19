import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('agg_daily')
@Index(['date', 'theme', 'country'], { unique: true })
export class AggDaily {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  date: string; // YYYY-MM-DD

  @Column({ nullable: true, length: 255 })
  @Index()
  theme: string;

  @Column({ nullable: true, length: 10 })
  @Index()
  country: string;

  @Column({ default: 0 })
  tweetCount: number;

  @Column({ default: 0 })
  originalCount: number;

  @Column({ default: 0 })
  replyCount: number;

  @Column({ default: 0 })
  quoteCount: number;

  @Column({ type: 'bigint', default: 0 })
  likesSum: number;

  @Column({ type: 'bigint', default: 0 })
  retweetsSum: number;

  @Column({ type: 'bigint', default: 0 })
  viewsSum: number;

  @Column({ default: 0 })
  uniqueAuthors: number;

  @CreateDateColumn()
  createdAt: Date;
}
