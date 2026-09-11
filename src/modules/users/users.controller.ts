import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../../generated/prisma/client.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getUserProfile(userId);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateUserProfile(userId, dto);
  }

  // ----------------- Admin Management -----------------

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async listAllForAdmin(
    @Query('role') role?: Role,
    @Query('isActive') isActive?: string,
    @Query('q') q?: string,
  ) {
    return this.usersService.listUsersForAdmin({
      role,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      q,
    });
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id')
  async adminUpdateUser(
    @CurrentUser('id') actingAdminId: string,
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdateUser(actingAdminId, id, dto);
  }
}
