import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationType } from '../../generated/prisma/client.js';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** An in-app route, not a rendered URL, so these survive a domain change. */
  link?: string;
  entityId?: string;
}

/** Nothing is told to more people than this in one go. */
const MAX_FANOUT = 200;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records notifications without ever throwing.
   *
   * Callers are business operations — awarding an offer, confirming a payment —
   * and none of them should fail or roll back because someone could not be told
   * about it. A failure here is logged and swallowed by design; the money and the
   * order are the source of truth, the notification is a courtesy.
   *
   * Deliberately NOT given the caller's transaction: a notification write must not
   * be able to abort the transaction it is reporting on.
   */
  async notify(inputs: NotificationInput | NotificationInput[]): Promise<number> {
    const rows = (Array.isArray(inputs) ? inputs : [inputs]).slice(0, MAX_FANOUT);

    if (!rows.length) return 0;

    try {
      const result = await this.prisma.notification.createMany({
        data: rows.map((row) => ({
          userId: row.userId,
          type: row.type,
          title: row.title,
          body: row.body,
          link: row.link ?? null,
          entityId: row.entityId ?? null,
        })),
      });

      return result.count;
    } catch (error) {
      this.logger.error(
        `Could not record ${rows.length} notification(s) of type ${rows[0]?.type}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  async listForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Scoped by userId in the same query, so one user cannot read another's. */
  async markRead(id: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      // Either it is not theirs, it does not exist, or it was already read. A
      // second read is not an error, so only a genuine miss is reported.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!exists) throw new NotFoundException('Notification not found');
    }

    return { id, readAt: new Date() };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }
}
