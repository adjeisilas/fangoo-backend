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

    /** Two registrations racing for one address both pass the lookup. */
    it('turns a unique-constraint failure into a conflict, not a 500', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(
        authService.register({
          email: 'john@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow('A user with this email address already exists');
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

    /**
     * Regression: an address with no account was refused without hashing
     * anything, so it answered far faster than a wrong password on a real
     * account — enough to tell whether someone is registered here.
     */
    it('hashes a password even when no account matches', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const startedAt = performance.now();
      await expect(
        authService.login({ email: 'nobody@example.com', password: 'Password123!' }),
      ).rejects.toThrow('Invalid email or password');
      const elapsed = performance.now() - startedAt;

      // argon2 costs ~150ms here; refusing without hashing takes under a
      // millisecond. The bound is loose so a slow machine cannot fail it.
      expect(elapsed).toBeGreaterThan(20);
    });

    /** Whether an account is deactivated is only told to whoever knows its password. */
    it('does not reveal a deactivated account to a wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        authService.login({ email: 'john@example.com', password: 'WrongPassword!' }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('tells the account holder when their account is deactivated', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        authService.login({ email: 'john@example.com', password: 'Secret123!' }),
      ).rejects.toThrow('Account has been deactivated');
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

  describe('startSession', () => {
    it('issues tokens and stores the refresh-token hash, as sign-in does', async () => {
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.startSession(mockUser as any);

      expect(result.tokens).toEqual({
        accessToken: 'jwt-user-uuid-1',
        refreshToken: 'jwt-user-uuid-1',
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { refreshTokenHash: expect.any(String) },
      });
      expect(result.user.email).toBe('john@example.com');
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result.user as any).refreshTokenHash).toBeUndefined();
    });

    it('refuses a deactivated account', async () => {
      await expect(
        authService.startSession({ ...mockUser, isActive: false } as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
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
