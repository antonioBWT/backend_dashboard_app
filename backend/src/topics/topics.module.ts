import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopicsService } from './topics.service';
import { TopicsController } from './topics.controller';
import { Topic } from './topic.entity';
import { TopicAssignment } from './topic-assignment.entity';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Topic, TopicAssignment], 'appConnection'),
    SettingsModule,
  ],
  providers: [
    TopicsService,
    {
      provide: 'DATA_SOURCE',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken('dataConnection')],
    },
  ],
  controllers: [TopicsController],
  exports: [TopicsService],
})
export class TopicsModule {}
