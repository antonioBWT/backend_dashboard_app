import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('topics')
export class Topic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string; // e.g. "UAE Housing Grants", "Gaza Ceasefire"

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true, type: 'text' })
  keywords: string; // JSON array stored as text (SQLite compat)

  @Column({ nullable: true, length: 7 })
  @Index()
  weekStart: string; // YYYY-WW — which discovery run created this topic

  @Column({ default: 0 })
  assignedCount: number; // how many tweets classified into this topic

  @Column({ nullable: true })
  trendDirection: string; // 'rising' | 'stable' | 'falling'

  @Column({ nullable: true })
  dominantSentiment: string; // 'positive' | 'neutral' | 'negative'

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
