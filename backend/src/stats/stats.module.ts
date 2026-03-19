import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { SyncModule } from '../sync/sync.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { SettingsModule } from '../settings/settings.module';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

@Module({
  imports: [SyncModule, AiAnalysisModule, SettingsModule],
  providers: [
    StatsService,
    {
      provide: 'DATA_SOURCE',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken('dataConnection')],
    },
  ],
  controllers: [StatsController],
})
export class StatsModule {}
