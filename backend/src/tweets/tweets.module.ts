import { Module } from '@nestjs/common';
import { TweetsService } from './tweets.service';
import { TweetsController } from './tweets.controller';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

@Module({
  providers: [
    TweetsService,
    {
      provide: 'DATA_SOURCE',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken('dataConnection')],
    },
  ],
  controllers: [TweetsController],
})
export class TweetsModule {}
