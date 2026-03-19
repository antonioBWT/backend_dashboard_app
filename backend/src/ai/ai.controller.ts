import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsOptional, IsString } from 'class-validator';

class FiltersQuery {
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

class ChatDto extends FiltersQuery {
  @IsString() question: string;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  @Get('sentiment')
  sentiment(@Query() q: FiltersQuery) {
    return this.aiService.getSentimentDistribution(q);
  }

  @Post('chat')
  chat(@Body() dto: ChatDto) {
    const { question, ...filters } = dto;
    return this.aiService.chat(question, filters);
  }
}
