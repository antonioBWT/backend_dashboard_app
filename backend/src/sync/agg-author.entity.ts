import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('agg_authors')
@Index(['yearMonth', 'author', 'theme', 'country'], { unique: true })
export class AggAuthor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 7 })
  @Index()
  yearMonth: string; // YYYY-MM

  @Column({ nullable: true, length: 255 })
  theme: string;

  @Column({ nullable: true, length: 10 })
  country: string;

  @Column({ length: 255 })
  @Index()
  author: string;

  @Column({ default: 0 })
  tweetCount: number;

  @Column({ type: 'bigint', default: 0 })
  likesSum: number;

  @Column({ type: 'bigint', default: 0 })
  retweetsSum: number;

  @Column({ type: 'bigint', default: 0 })
  viewsSum: number;
}
