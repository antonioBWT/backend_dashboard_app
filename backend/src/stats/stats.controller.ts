import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsOptional, IsString, IsIn } from 'class-validator';

class FiltersDto {
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) granularity?: 'day' | 'week' | 'month';
  @IsOptional() limit?: number;
}

class HashtagFiltersDto extends FiltersDto {
  @IsOptional() @IsString() tag?: string;
}

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Get('overview')
  overview(@Query() q: FiltersDto) {
    return this.statsService.getOverview(q);
  }

  @Get('timeline')
  timeline(@Query() q: FiltersDto) {
    return this.statsService.getTimeline(q);
  }

  @Get('by-theme')
  byTheme(@Query() q: FiltersDto) {
    return this.statsService.getByTheme(q);
  }

  @Get('post-types')
  postTypes(@Query() q: FiltersDto) {
    return this.statsService.getPostTypes(q);
  }

  @Get('top-authors')
  topAuthors(@Query() q: FiltersDto) {
    return this.statsService.getTopAuthors(q);
  }

  @Get('share-of-voice')
  shareOfVoice(@Query() q: FiltersDto) {
    return this.statsService.getShareOfVoice(q);
  }

  @Get('hot-themes')
  hotThemes(@Query() q: FiltersDto) {
    return this.statsService.getHotThemes(q);
  }

  @Get('sentiment')
  sentiment(@Query() q: FiltersDto) {
    return this.statsService.getSentiment(q);
  }

  @Get('themes')
  themes() {
    return this.statsService.getThemes();
  }

  @Get('countries')
  countries() {
    return this.statsService.getCountries();
  }

  @Get('date-range')
  dateRange() {
    return this.statsService.getDateRange();
  }

  @Get('dashboard-defaults')
  dashboardDefaults() {
    return this.statsService.getDashboardDefaults();
  }

  @Get('by-country')
  byCountry() {
    return this.statsService.getByCountry();
  }

  @Get('hashtags')
  hashtags(@Query() q: FiltersDto) {
    return this.statsService.getTopHashtags(q);
  }

  @Get('hashtag-timeline')
  hashtagTimeline(@Query() q: HashtagFiltersDto) {
    return this.statsService.getHashtagTimeline(q as any);
  }
}
