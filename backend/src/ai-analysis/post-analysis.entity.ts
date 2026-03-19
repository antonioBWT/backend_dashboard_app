import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('post_analysis')
export class PostAnalysis {
  @PrimaryGeneratedColumn()
  id: number;

  /** Links to tweet_cache.external_id — works for any platform post */
  @Index({ unique: true })
  @Column({ length: 64 })
  externalId: string;

  /** Source platform — future-proof for Instagram, Facebook, YouTube etc */
  @Column({ length: 32, default: 'twitter' })
  platform: string;

  // ── Sentiment ──────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 16, nullable: true })
  sentiment: 'positive' | 'neutral' | 'negative' | null;

  /** -1.0 (very negative) … +1.0 (very positive) */
  @Column({ type: 'real', nullable: true })
  sentimentScore: number | null;

  @Column({ type: 'real', nullable: true })
  sentimentConfidence: number | null;

  // ── Language ───────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 16, nullable: true })
  language: string | null; // 'ar', 'en', 'mixed', 'other'

  // ── Topics ─────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 256, nullable: true })
  subtopic: string | null;

  /** JSON array of sub-topic strings */
  @Column({ type: 'text', nullable: true })
  subtopicsJson: string | null;

  // ── Emotions ───────────────────────────────────────────────────────────
  /** neutral | anger | joy | fear | surprise | disgust | sadness */
  @Column({ type: 'varchar', length: 32, nullable: true })
  emotion: string | null;

  // ── Extracted content ──────────────────────────────────────────────────
  /** JSON array of key phrases */
  @Column({ type: 'text', nullable: true })
  keyPhrasesJson: string | null;

  /** JSON array of mentioned entities: {type, name} */
  @Column({ type: 'text', nullable: true })
  entitiesJson: string | null;

  /** One-line AI summary of the post */
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  // ── Meta ───────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 64, nullable: true })
  modelUsed: string | null;

  @Column({ type: 'int', nullable: true })
  processingMs: number | null;

  @CreateDateColumn()
  processedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
