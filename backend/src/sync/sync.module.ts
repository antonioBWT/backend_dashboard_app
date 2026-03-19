import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { AggDaily } from './agg-daily.entity';
import { AggAuthor } from './agg-author.entity';
import { SyncStatus } from './sync-status.entity';
import { TweetCache } from './tweet-cache.entity';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([AggDaily, AggAuthor, SyncStatus, TweetCache], 'appConnection'),
  ],
  providers: [
    SyncService,
    {
      provide: 'DATA_SOURCE',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken('dataConnection')],
    },
  ],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
