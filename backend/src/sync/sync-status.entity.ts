import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('sync_status')
export class SyncStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string; // 'agg_daily', 'agg_authors', 'topics'

  @Column({ nullable: true })
  lastSyncedDate: string; // last date synced (for incremental)

  @Column({ default: 'idle' })
  status: string; // idle | running | done | error

  @Column({ nullable: true })
  lastError: string;

  @Column({ default: 0 })
  totalRows: number;

  @Column({ default: 0 })
  progress: number; // 0–100

  @UpdateDateColumn()
  updatedAt: Date;
}
