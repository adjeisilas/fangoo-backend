import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role } from '../../generated/prisma/client.js';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { DELIVERY_AREA_WITH_REGION } from '../delivery-areas/delivery-area.query.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsersForAdmin(filters: {
    role?: Role;
    isActive?: boolean;
    q?: string;
  }) {
    const where: any = {};

    if (filters.role) where.role = filters.role;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    if (filters.q) {
      where.OR = [
        { email: { contains: filters.q, mode: 'insensitive' } },
        { firstName: { contains: filters.q, mode: 'insensitive' } },
        { lastName: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        supplierProfile: {
          select: { id: true, companyName: true, verificationStatus: true },
        },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  /**
   * Admins must not be able to lock themselves out — the last admin demoting or
   * deactivating themselves would leave nobody able to undo it.
   */
  async adminUpdateUser(
    actingAdminId: string,
    targetUserId: string,
    dto: AdminUpdateUserDto,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (targetUserId === actingAdminId) {
      if (dto.isActive === false) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      if (dto.role && dto.role !== Role.ADMIN) {
        throw new BadRequestException(
          'You cannot remove your own admin access',
        );
      }
    }

    const data: Record<string, any> = {};
    if (dto.role !== undefined) data.role = dto.role;

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      // Deactivating must also end the session, not just block the next login.
      if (!dto.isActive) data.refreshTokenHash = null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data,
      include: {
        supplierProfile: {
          select: { id: true, companyName: true, verificationStatus: true },
        },
      },
    });

    return this.sanitizeUser(updated);
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        supplierProfile: {
          include: {
            deliveryAreas: {
              include: {
                deliveryArea: DELIVERY_AREA_WITH_REGION,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.sanitizeUser(user);
  }

  async updateUserProfile(userId: string, dto: UpdateUserProfileDto) {
    const dataToUpdate: Record<string, any> = {};

    if (dto.firstName !== undefined)
      dataToUpdate.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) dataToUpdate.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) dataToUpdate.phone = dto.phone.trim();

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      include: {
        supplierProfile: true,
      },
    });

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: any) {
    const { passwordHash: _p, refreshTokenHash: _r, ...sanitized } = user;
    return sanitized;
  }
}
