import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TweetsService } from './tweets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator';

class TweetsQueryDto {
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() postStatus?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsNumberString() page?: number;
  @IsOptional() @IsNumberString() limit?: number;
  @IsOptional() @IsIn(['views', 'likes', 'retweets', 'date']) sortBy?: 'views' | 'likes' | 'retweets' | 'date';
  @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC';
  @IsOptional() @IsIn(['views', 'likes']) metric?: 'views' | 'likes';
}

@Controller('tweets')
@UseGuards(JwtAuthGuard)
export class TweetsController {
  constructor(private tweetsService: TweetsService) {}

  @Get()
  findAll(@Query() q: TweetsQueryDto) {
    return this.tweetsService.findAll(q);
  }

  @Get('top')
  top(@Query() q: TweetsQueryDto) {
    return this.tweetsService.getTopTweets(q);
  }
}
