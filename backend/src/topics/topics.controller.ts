import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { IsOptional, IsString, IsNumberString, IsNumber } from 'class-validator';

class TopicsQueryDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsNumberString() daysBack?: string;
}

class PipelineBodyDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsNumber() daysBack?: number;
}

@Controller('topics')
@UseGuards(JwtAuthGuard)
export class TopicsController {
  constructor(private topicsService: TopicsService) {}

  @Get('hot')
  getHotTopics(@Query() q: TopicsQueryDto) {
    return this.topicsService.getHotTopics({ country: q.country, daysBack: q.daysBack ? Number(q.daysBack) : undefined });
  }

  @Post('run-pipeline')
  @UseGuards(AdminGuard)
  runPipeline(@Body() body: PipelineBodyDto) {
    // Fire and forget — errors are caught inside the service
    this.topicsService.runWeeklyPipeline({ country: body.country, daysBack: body.daysBack })
      .catch((e) => console.error('Topic pipeline failed:', e?.message));
    return { message: 'Topic pipeline started. Results will be available at GET /api/topics/hot' };
  }
}
