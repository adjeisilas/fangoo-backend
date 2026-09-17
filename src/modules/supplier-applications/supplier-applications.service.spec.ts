import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { SupplierApplicationsService } from './supplier-applications.service.js';
import { Role, VerificationStatus } from '../../generated/prisma/client.js';

vi.mock('argon2', () => ({ hash: vi.fn() }));

const dto = () => ({
  account: {
    email: '  Owner@Depot.COM ',
    password: 'correct-horse-battery',
    firstName: ' Ama ',
    lastName: ' Mensah ',
    phone: ' +233200000000 ',
  },
  business: {
    companyName: ' Mensah Fuels ',
    address: ' 4 Harbour Road ',
    city: ' Tema ',
    contactPhone: ' +233300000000 ',
    contactEmail: ' Sales@Mensah.COM ',
  },
  coverage: [
    { deliveryAreaId: 'area-tema', deliveryFee: 30, estimatedDeliveryHours: 4 },
    { deliveryAreaId: 'area-accra' },
  ],
});

const createdUser = {
  id: 'user-1',
  email: 'owner@depot.com',
  passwordHash: 'hashed-password',
  firstName: 'Ama',
  lastName: 'Mensah',
  phone: '+233200000000',
  role: Role.SUPPLIER,
  isActive: true,
  refreshTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SupplierApplicationsService', () => {
  let service: SupplierApplicationsService;
  let tx: any;
  let mockPrisma: any;
  let mockAuth: any;
  let committed: boolean;

  beforeEach(() => {
    vi.mocked(argon2.hash).mockReset();
    vi.mocked(argon2.hash).mockResolvedValue('hashed-password');
    committed = false;

    tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdUser),
      },
      supplierProfile: { create: vi.fn().mockResolvedValue({ id: 'profile-1' }) },
      supplierDeliveryArea: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      deliveryArea: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'area-tema', name: 'Tema Metropolitan Area', isActive: true },
          { id: 'area-accra', name: 'Accra Metropolitan Area', isActive: true },
        ]),
      },
    };

    mockPrisma = {
      // Mirrors Prisma: the callback's writes only count once it resolves.
      $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
      user: { delete: vi.fn() },
      supplierProfile: { delete: vi.fn() },
      supplierDeliveryArea: { deleteMany: vi.fn() },
    };

    mockAuth = {
      startSession: vi.fn(async (user: any) => {
        // The session must never be issued for an uncommitted account.
        expect(committed).toBe(true);
        return {
          user: { id: user.id, email: user.email, role: user.role },
          tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
        };
      }),
    };

    service = new SupplierApplicationsService(mockPrisma, mockAuth);
  });

  describe('a successful application', () => {
    it('creates the account, depot and coverage in one transaction', async () => {
      const result = await service.apply(dto());

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledTimes(1);
      expect(tx.supplierProfile.create).toHaveBeenCalledTimes(1);
      expect(tx.supplierDeliveryArea.createMany).toHaveBeenCalledTimes(1);
      expect(result.supplierProfileId).toBe('profile-1');
    });

    it('creates a SUPPLIER account with a normalised email and the hashed password', async () => {
      await service.apply(dto());

      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { email: 'owner@depot.com' } });
      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          email: 'owner@depot.com',
          passwordHash: 'hashed-password',
          firstName: 'Ama',
          lastName: 'Mensah',
          phone: '+233200000000',
          role: Role.SUPPLIER,
        },
      });
      expect(argon2.hash).toHaveBeenCalledWith('correct-horse-battery');
    });

    it('leaves the depot PENDING verification', async () => {
      const result = await service.apply(dto());

      expect(tx.supplierProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          verificationStatus: VerificationStatus.PENDING,
          companyName: 'Mensah Fuels',
          city: 'Tema',
          contactEmail: 'sales@mensah.com',
          businessRegNumber: null,
        }),
        select: { id: true },
      });
      expect(result.verificationStatus).toBe(VerificationStatus.PENDING);
    });

    it('stores the chosen coverage with the usual defaults', async () => {
      await service.apply(dto());

      expect(tx.supplierDeliveryArea.createMany).toHaveBeenCalledWith({
        data: [
          { supplierProfileId: 'profile-1', deliveryAreaId: 'area-tema', deliveryFee: 30, estimatedDeliveryHours: 4 },
          { supplierProfileId: 'profile-1', deliveryAreaId: 'area-accra', deliveryFee: 0, estimatedDeliveryHours: null },
        ],
      });
    });

    it('hashes the password before the transaction opens', async () => {
      await service.apply(dto());

      const hashedAt = vi.mocked(argon2.hash).mock.invocationCallOrder[0];
      const transactionAt = mockPrisma.$transaction.mock.invocationCallOrder[0];
      expect(hashedAt).toBeLessThan(transactionAt);
    });

    it('starts the session only after the commit, and returns it', async () => {
      const result = await service.apply(dto());

      expect(mockAuth.startSession).toHaveBeenCalledWith(createdUser);
      expect(result.session?.tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    });
  });

  describe('a rejected application writes nothing', () => {
    it('refuses an email that is already registered', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'someone-else' });

      await expect(service.apply(dto())).rejects.toThrow(
        new ConflictException('A user with this email address already exists'),
      );
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.supplierProfile.create).not.toHaveBeenCalled();
      expect(mockAuth.startSession).not.toHaveBeenCalled();
    });

    /** Two applications for one email: the unique index stops the loser. */
    it('turns a unique-index race on email into the same conflict', async () => {
      mockPrisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(service.apply(dto())).rejects.toThrow(ConflictException);
      expect(mockAuth.startSession).not.toHaveBeenCalled();
    });

    it('refuses a paused delivery area', async () => {
      tx.deliveryArea.findMany.mockResolvedValue([
        { id: 'area-tema', name: 'Tema Metropolitan Area', isActive: false },
        { id: 'area-accra', name: 'Accra Metropolitan Area', isActive: true },
      ]);

      await expect(service.apply(dto())).rejects.toThrow(BadRequestException);
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.supplierDeliveryArea.createMany).not.toHaveBeenCalled();
      expect(mockAuth.startSession).not.toHaveBeenCalled();
    });

    it('refuses an unknown delivery area', async () => {
      tx.deliveryArea.findMany.mockResolvedValue([
        { id: 'area-tema', name: 'Tema Metropolitan Area', isActive: true },
      ]);

      await expect(service.apply(dto())).rejects.toThrow(
        new NotFoundException('One or more delivery area IDs are invalid'),
      );
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.supplierDeliveryArea.createMany).not.toHaveBeenCalled();
      expect(mockAuth.startSession).not.toHaveBeenCalled();
    });

    it('refuses a repeated delivery area before hashing or opening a transaction', async () => {
      const application = dto();
      application.coverage = [{ deliveryAreaId: 'area-tema' }, { deliveryAreaId: 'area-tema' }];

      await expect(service.apply(application)).rejects.toThrow(BadRequestException);
      expect(argon2.hash).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('passes other database errors through unchanged', async () => {
      const failure = new Error('connection lost');
      mockPrisma.$transaction.mockRejectedValue(failure);

      await expect(service.apply(dto())).rejects.toBe(failure);
      expect(mockAuth.startSession).not.toHaveBeenCalled();
    });
  });

  describe('when signing in fails after the commit', () => {
    beforeEach(() => {
      mockAuth.startSession.mockRejectedValue(new Error('token signing unavailable'));
    });

    it('keeps the application and reports that no session was started', async () => {
      const result = await service.apply(dto());

      expect(result).toEqual({
        supplierProfileId: 'profile-1',
        verificationStatus: VerificationStatus.PENDING,
        session: null,
      });
    });

    it('does not try to undo anything it committed', async () => {
      await service.apply(dto());

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
      expect(mockPrisma.supplierProfile.delete).not.toHaveBeenCalled();
      expect(mockPrisma.supplierDeliveryArea.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
