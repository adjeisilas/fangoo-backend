import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

/** Every route is scoped to the caller — there is no cross-user read here. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.listForUser(userId, unread === 'true');
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('id') userId: string) {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  // Dynamic route last, so it cannot swallow `read-all`.
  @Patch(':id/read')
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(id, userId);
  }
}
