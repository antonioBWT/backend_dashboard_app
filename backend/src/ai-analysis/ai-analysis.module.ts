import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostAnalysis } from './post-analysis.entity';
import { TweetCache } from '../sync/tweet-cache.entity';
import { AiAnalysisService } from './ai-analysis.service';
import { AiAnalysisController } from './ai-analysis.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostAnalysis, TweetCache], 'appConnection'),
  ],
  providers: [AiAnalysisService],
  controllers: [AiAnalysisController],
  exports: [AiAnalysisService],
})
export class AiAnalysisModule {}
