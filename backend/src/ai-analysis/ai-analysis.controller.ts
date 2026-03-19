import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { AiAnalysisService } from './ai-analysis.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('ai-analysis')
@UseGuards(JwtAuthGuard)
export class AiAnalysisController {
  constructor(private readonly svc: AiAnalysisService) {}

  /** Overall status: how many posts analyzed, running flag, etc. */
  @Get('status')
  status() {
    return this.svc.getStatus();
  }

  /** Sentiment + sub-topic stats grouped by theme */
  @Get('theme-stats')
  themeStats() {
    return this.svc.themeStats();
  }

  /** Top sub-topics, optionally filtered by theme */
  @Get('subtopic-stats')
  subtopicStats(@Query('theme') theme?: string) {
    return this.svc.subtopicStats(theme);
  }

  /** Sub-topics with real engagement metrics (views/likes/tweets) */
  @Get('subtopic-engagement')
  subtopicEngagement() {
    return this.svc.subtopicEngagement();
  }

  /** Get analysis for a single post */
  @Get('post/:externalId')
  forPost(@Param('externalId') externalId: string) {
    return this.svc.getForTweet(externalId);
  }

  /**
   * Analyze a single post on-demand (e.g. when opening post preview).
   * Returns cached result if already processed.
   */
  @Post('analyze/:externalId')
  analyzeSingle(@Param('externalId') externalId: string) {
    return this.svc.analyzeTweet(externalId);
  }

  /**
   * Admin only: start background batch analysis.
   * limit = max posts to process in this run (default 500).
   */
  @Post('batch/start')
  @UseGuards(AdminGuard)
  startBatch(@Body('limit') limit?: number) {
    return this.svc.startBatchAnalysis(limit ?? 500);
  }

  /** Admin only: retry posts that failed in previous batch */
  @Post('batch/retry-failed')
  @UseGuards(AdminGuard)
  retryFailed() {
    return this.svc.retryFailed();
  }

  /** Quick test: analyze arbitrary text without persisting */
  @Post('test')
  @UseGuards(AdminGuard)
  testAnalyze(
    @Body('text') text: string,
    @Body('theme') theme?: string,
    @Body('platform') platform?: string,
  ) {
    return this.svc.analyzeText(text, theme, platform ?? 'twitter');
  }
}
