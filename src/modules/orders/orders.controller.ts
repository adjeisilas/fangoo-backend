import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role, OrderStatus } from '../../generated/prisma/client.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SanitizedUser } from '../auth/types/auth.types.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyOrders(@CurrentUser('id') userId: string) {
    return this.ordersService.getMyOrders(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('supplier/me')
  async getSupplierOrders(@CurrentUser('id') userId: string) {
    return this.ordersService.getSupplierOrders(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  async listAllForAdmin(@Query('status') status?: OrderStatus) {
    return this.ordersService.listAllForAdmin(status);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOrderById(
    @CurrentUser() user: SanitizedUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderById(id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/cancel')
  async cancelOrder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(id, userId, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateOrderStatus(
    @CurrentUser() user: SanitizedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(
      id,
      dto.status,
      user.id,
      user.role,
      dto.reason,
    );
  }
}
