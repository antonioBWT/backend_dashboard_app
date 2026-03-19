import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { IsOptional, IsString, IsNumber } from 'class-validator';

class UpdatePromptDto {
  @IsOptional() @IsString() systemPrompt?: string;
  @IsOptional() @IsString() userPromptTemplate?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsNumber() maxTokens?: number;
  @IsOptional() @IsString() label?: string;
}

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('prompts')
  findAll() {
    return this.settingsService.findAll();
  }

  @Put('prompts/:key')
  update(@Param('key') key: string, @Body() dto: UpdatePromptDto) {
    return this.settingsService.update(key, dto);
  }

  @Put('defaults')
  updateDefaults(@Body() body: { country: string; theme: string; dateFrom: string; dateTo: string }) {
    return this.settingsService.updateDashboardDefaults(body);
  }
}
