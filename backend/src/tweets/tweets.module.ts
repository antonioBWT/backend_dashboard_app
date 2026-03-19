import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TweetsService } from './tweets.service';
import { TweetsController } from './tweets.controller';
import { TweetCache } from '../sync/tweet-cache.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TweetCache], 'appConnection')],
  providers: [TweetsService],
  controllers: [TweetsController],
})
export class TweetsModule {}
