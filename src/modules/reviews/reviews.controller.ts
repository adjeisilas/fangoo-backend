import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createReview(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId')
  async getReviewForOrder(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.reviewsService.getReviewForOrder(orderId, userId);
  }

  @Public()
  @Get('suppliers/:supplierId')
  async getSupplierReviews(@Param('supplierId') supplierId: string) {
    return this.reviewsService.getSupplierReviews(supplierId);
  }
}
