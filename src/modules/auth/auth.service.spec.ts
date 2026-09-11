import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { Role } from '../../generated/prisma/client.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;
  let mockConfigService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'john@example.com',
    passwordHash: '',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    role: Role.CUSTOMER,
    isActive: true,
    refreshTokenHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await argon2.hash('Secret123!');
    mockUser.refreshTokenHash = await argon2.hash('valid-refresh-token');

    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    mockJwtService = {
      signAsync: vi.fn().mockImplementation((payload) => {
        return Promise.resolve(`jwt-${payload.sub}`);
      }),
    };

    const configValues: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    };

    mockConfigService = {
      get: vi.fn(
        (key: string, defaultValue?: string) =>
          configValues[key] ?? defaultValue ?? 'default',
      ),
      // Secrets are read with getOrThrow so a missing one fails loudly.
      getOrThrow: vi.fn((key: string) => {
        const value = configValues[key];
        if (!value) throw new Error(`Missing configuration: ${key}`);
        return value;
      }),
    };

    authService = new AuthService(
      mockPrisma as any,
      mockJwtService as any,
      mockConfigService as any,
    );
  });

  describe('register', () => {
    it('should register a new customer successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'john@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        role: Role.CUSTOMER,
      });

      expect(result.user.email).toBe('john@example.com');
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(result.tokens.accessToken).toBe('jwt-user-uuid-1');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should forbid self-registering as ADMIN', async () => {
      await expect(
        authService.register({
          email: 'admin@example.com',
          password: 'Password123!',
          firstName: 'Admin',
          lastName: 'User',
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: 'john@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.login({
        email: 'john@example.com',
        password: 'Secret123!',
      });

      expect(result.user.email).toBe('john@example.com');
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'john@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should rotate tokens when valid refresh token is supplied', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const tokens = await authService.refreshTokens(
        mockUser.id,
        'valid-refresh-token',
      );

      expect(tokens.accessToken).toBe('jwt-user-uuid-1');
      expect(tokens.refreshToken).toBe('jwt-user-uuid-1');
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when refresh token hash does not match', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.refreshTokens(mockUser.id, 'wrong-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should set refreshTokenHash to null', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      await authService.logout(mockUser.id);

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: mockUser.id, refreshTokenHash: { not: null } },
        data: { refreshTokenHash: null },
      });
    });
  });

  describe('getMe', () => {
    it('should return sanitized user profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const me = await authService.getMe(mockUser.id);

      expect(me.email).toBe('john@example.com');
      expect((me as any).passwordHash).toBeUndefined();
      expect((me as any).refreshTokenHash).toBeUndefined();
    });
  });
});
