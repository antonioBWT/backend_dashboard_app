import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('admin/sync')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Get('status')
  status() {
    return this.syncService.getStatus();
  }

  @Get('remote-stats')
  remoteStats() {
    return this.syncService.remoteStats();
  }

  @Post('full')
  fullSync() {
    // Fire and forget — returns immediately, sync runs in background
    this.syncService.syncAll();
    return { message: 'Full sync started', check: '/api/admin/sync/status' };
  }

  @Post('incremental')
  incrementalSync() {
    this.syncService.syncIncremental();
    return { message: 'Incremental sync started', check: '/api/admin/sync/status' };
  }

  @Post('tweet-cache')
  tweetCacheSync() {
    this.syncService.syncTweetCache(null)
      .catch((e) => console.error('Tweet cache sync failed:', e.message));
    return { message: 'Tweet cache sync started', check: '/api/admin/sync/status' };
  }
}
