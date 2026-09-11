import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationType } from '../../generated/prisma/client.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: any;

  const input = {
    userId: 'user-1',
    type: NotificationType.OFFER_RECEIVED,
    title: 'New offer',
    body: 'Someone quoted you a price',
  };

  beforeEach(() => {
    mockPrisma = {
      notification: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new NotificationsService(mockPrisma as any);
  });

  describe('notify', () => {
    it('records a single notification', async () => {
      const count = await service.notify(input);

      expect(count).toBe(1);
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ userId: 'user-1', title: 'New offer' })],
      });
    });

    it('writes a fan-out in one statement rather than one per recipient', async () => {
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      await service.notify([input, input, input]);

      expect(mockPrisma.notification.createMany).toHaveBeenCalledTimes(1);
    });

    /**
     * The central guarantee. Callers are business operations — awarding an offer,
     * confirming a payment — and none of them may fail because someone could not
     * be told. A failure here is logged and swallowed by design.
     */
    it('never throws when the write fails', async () => {
      mockPrisma.notification.createMany.mockRejectedValue(new Error('db down'));

      await expect(service.notify(input)).resolves.toBe(0);
    });

    it('does nothing, cheaply, when there are no recipients', async () => {
      const count = await service.notify([]);

      expect(count).toBe(0);
      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    });

    // A runaway fan-out would be a self-inflicted denial of service.
    it('caps how many people one event can notify', async () => {
      await service.notify(Array.from({ length: 500 }, () => input));

      const written = mockPrisma.notification.createMany.mock.calls[0][0].data;
      expect(written).toHaveLength(200);
    });

    it('stores optional fields as null rather than undefined', async () => {
      await service.notify(input);

      const written = mockPrisma.notification.createMany.mock.calls[0][0].data[0];
      expect(written.link).toBeNull();
      expect(written.entityId).toBeNull();
    });
  });

  describe('reading', () => {
    it('returns only the caller’s notifications, newest first', async () => {
      await service.listForUser('user-1');

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('can narrow to unread only', async () => {
      await service.listForUser('user-1', true);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', readAt: null } }),
      );
    });

    it('counts only unread', async () => {
      await service.unreadCount('user-1');

      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });
  });

  describe('markRead', () => {
    /** Ownership is enforced in the query itself, not checked afterwards. */
    it('scopes the update to the caller so one user cannot read another’s', async () => {
      await service.markRead('n-1', 'user-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'n-1', userId: 'user-1', readAt: null },
        }),
      );
    });

    it('treats a second read as success, not an error', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });

      await expect(service.markRead('n-1', 'user-1')).resolves.toBeDefined();
    });

    it('404s for a notification that is not the caller’s', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('n-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks everything unread as read in one statement', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 7 });

      const result = await service.markAllRead('user-1');

      expect(result).toEqual({ updated: 7 });
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', readAt: null } }),
      );
    });
  });
});
