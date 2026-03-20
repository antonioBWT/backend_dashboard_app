import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { SentimentCache } from './sentiment-cache.entity';
import { TweetCache } from '../sync/tweet-cache.entity';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SentimentCache, TweetCache], 'appConnection'),
    SettingsModule,
  ],
  providers: [AiService],
  controllers: [AiController],
})
export class AiModule {}
