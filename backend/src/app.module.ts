import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StatsModule } from './stats/stats.module';
import { TweetsModule } from './tweets/tweets.module';
import { AiModule } from './ai/ai.module';
import { SyncModule } from './sync/sync.module';
import { TopicsModule } from './topics/topics.module';
import { SettingsModule } from './settings/settings.module';
import { User } from './users/user.entity';
import { SentimentCache } from './ai/sentiment-cache.entity';
import { AggDaily } from './sync/agg-daily.entity';
import { AggAuthor } from './sync/agg-author.entity';
import { SyncStatus } from './sync/sync-status.entity';
import { TweetCache } from './sync/tweet-cache.entity';
import { Topic } from './topics/topic.entity';
import { TopicAssignment } from './topics/topic-assignment.entity';
import { PromptConfig } from './settings/prompt-config.entity';
import { AppSetting } from './settings/app-setting.entity';
import { AiAnalysisModule } from './ai-analysis/ai-analysis.module';
import { PostAnalysis } from './ai-analysis/post-analysis.entity';
import * as path from 'path';
import * as fs from 'fs';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // App DB (SQLite by default)
    TypeOrmModule.forRootAsync({
      name: 'appConnection',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): TypeOrmModuleOptions => {
        const dbType = cfg.get<string>('APP_DB_TYPE') ?? 'sqlite';
        if (dbType !== 'mysql') {
          const dbPath = cfg.get<string>('APP_DB_PATH') ?? './data/app.db';
          const dir = path.dirname(dbPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          return {
            type: 'sqlite',
            database: dbPath,
            entities: [User, SentimentCache, AggDaily, AggAuthor, SyncStatus, TweetCache, Topic, TopicAssignment, PromptConfig, PostAnalysis, AppSetting],
            synchronize: true,
          };
        }
        return {
          type: 'mysql',
          host: cfg.get<string>('APP_DB_HOST'),
          port: +(cfg.get<string>('APP_DB_PORT') ?? '3306'),
          username: cfg.get<string>('APP_DB_USER'),
          password: cfg.get<string>('APP_DB_PASS'),
          database: cfg.get<string>('APP_DB_NAME'),
          entities: [User, SentimentCache, AggDaily, AggAuthor, SyncStatus, TweetCache, Topic, TopicAssignment, PromptConfig, PostAnalysis, AppSetting],
          synchronize: true,
          charset: 'utf8mb4',
        };
      },
    }),

    // Data DB (remote read-only, optional — skips if DATA_DB_HOST not set)
    TypeOrmModule.forRootAsync({
      name: 'dataConnection',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): TypeOrmModuleOptions => {
        const host = cfg.get<string>('DATA_DB_HOST');
        if (!host) {
          return { type: 'sqlite', database: ':memory:', entities: [], synchronize: false };
        }
        return {
          type: 'mysql',
          host,
          port: +(cfg.get<string>('DATA_DB_PORT') ?? '3306'),
          username: cfg.get<string>('DATA_DB_USER'),
          password: cfg.get<string>('DATA_DB_PASS'),
          database: cfg.get<string>('DATA_DB_NAME'),
          entities: [],
          synchronize: false,
          charset: 'utf8mb4',
          connectTimeout: 30000,
          extra: { connectionLimit: 5, acquireTimeout: 60000, timeout: 120000 },
        };
      },
    }),

    ServeStaticModule.forRoot({
      rootPath: path.join(process.cwd(), 'frontend', 'dist'),
    }),
    SettingsModule,
    AuthModule,
    UsersModule,
    StatsModule,
    TweetsModule,
    AiModule,
    SyncModule,
    TopicsModule,
    AiAnalysisModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
