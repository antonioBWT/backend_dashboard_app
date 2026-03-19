import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { SentimentCache } from './sentiment-cache.entity';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([SentimentCache], 'appConnection'), SettingsModule],
  providers: [
    AiService,
    {
      provide: 'DATA_SOURCE',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken('dataConnection')],
    },
  ],
  controllers: [AiController],
})
export class AiModule {}
