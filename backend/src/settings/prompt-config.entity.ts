import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('prompt_configs')
export class PromptConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  key: string; // e.g. 'sentiment', 'topic_discovery', 'topic_classification', 'chat_system'

  @Column({ length: 100 })
  label: string;

  @Column({ type: 'text' })
  systemPrompt: string;

  @Column({ type: 'text', nullable: true })
  userPromptTemplate: string; // {{variables}} for interpolation

  @Column({ length: 50, default: 'gpt-4o-mini' })
  model: string;

  @Column({ default: 800 })
  maxTokens: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
