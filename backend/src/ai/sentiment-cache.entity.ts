import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sentiment_cache')
export class SentimentCache {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ comment: 'MD5 hash of filter params' })
  cacheKey: string;

  @Column({ type: 'json' })
  result: any;

  @Column({ nullable: true })
  theme: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  dateFrom: string;

  @Column({ nullable: true })
  dateTo: string;

  @CreateDateColumn()
  createdAt: Date;
}
