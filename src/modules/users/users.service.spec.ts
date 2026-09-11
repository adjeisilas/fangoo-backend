import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Role } from '../../generated/prisma/client.js';

describe('UsersService (admin)', () => {
  let service: UsersService;
  let mockPrisma: any;

  const target = {
    id: 'user-2',
    email: 'someone@example.com',
    role: Role.CUSTOMER,
    isActive: true,
    passwordHash: 'hashed',
    refreshTokenHash: 'hashed-refresh',
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue(target),
      },
    };

    service = new UsersService(mockPrisma as any);
  });

  describe('listUsersForAdmin', () => {
    it('should never leak password or refresh-token hashes', async () => {
      mockPrisma.user.findMany.mockResolvedValue([target]);

      const [user] = await service.listUsersForAdmin({});

      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('refreshTokenHash');
      expect(user.email).toBe('someone@example.com');
    });

    it('should search across email and name', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.listUsersForAdmin({ q: 'ama' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { email: { contains: 'ama', mode: 'insensitive' } },
              { firstName: { contains: 'ama', mode: 'insensitive' } },
              { lastName: { contains: 'ama', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  describe('adminUpdateUser', () => {
    it('should deactivate a user and revoke their refresh token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(target);

      await service.adminUpdateUser('admin-1', 'user-2', { isActive: false });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false, refreshTokenHash: null },
        }),
      );
    });

    it('should stop an admin deactivating their own account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...target,
        id: 'admin-1',
      });

      await expect(
        service.adminUpdateUser('admin-1', 'admin-1', { isActive: false }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should stop an admin removing their own admin access', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...target,
        id: 'admin-1',
      });

      await expect(
        service.adminUpdateUser('admin-1', 'admin-1', { role: Role.CUSTOMER }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow an admin to promote another user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(target);

      await service.adminUpdateUser('admin-1', 'user-2', { role: Role.ADMIN });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: Role.ADMIN } }),
      );
    });

    it('should throw NotFoundException for an unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.adminUpdateUser('admin-1', 'ghost', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject an empty update', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(target);

      await expect(
        service.adminUpdateUser('admin-1', 'user-2', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
