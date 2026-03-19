import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('topic_assignments')
export class TopicAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  tweetExternalId: string; // x_tweets.external_id (as string)

  @Column()
  @Index()
  topicId: number;

  @Column({ length: 255 })
  topicName: string; // denormalized for fast reads

  @Column({ type: 'float', default: 1.0 })
  confidence: number; // 0-1

  @Column({ nullable: true, length: 20 })
  sentiment: string; // positive | neutral | negative

  @Column({ nullable: true, length: 10 })
  @Index()
  date: string; // YYYY-MM-DD for aggregation

  @Column({ nullable: true, type: 'bigint' })
  viewsCount: number;

  @Column({ nullable: true, type: 'bigint' })
  likesCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
