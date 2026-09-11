import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrderStatus } from '../../generated/prisma/client.js';
import { CreateReviewDto } from './dto/create-review.dto.js';

const REVIEW_INCLUDE = {
  customer: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A review is only valid if the customer owns the order, the order actually
   * completed, and they have not already reviewed it (fangoo-project skill §30).
   * The supplier is taken from the order, never from the request.
   */
  async createReview(customerId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { review: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own orders');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'You can only review an order once it has been delivered',
      );
    }

    if (order.review) {
      throw new ConflictException('You have already reviewed this order');
    }

    return this.prisma.review.create({
      data: {
        orderId: order.id,
        customerId,
        supplierProfileId: order.supplierProfileId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
      include: REVIEW_INCLUDE,
    });
  }

  async getSupplierReviews(supplierProfileId: string) {
    const [reviews, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where: { supplierProfileId },
        include: REVIEW_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.review.aggregate({
        where: { supplierProfileId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      reviews,
      averageRating: aggregate._avg.rating,
      totalReviews: aggregate._count.rating,
    };
  }

  async getReviewForOrder(orderId: string, customerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, supplier: { select: { userId: true } } },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.customerId !== customerId &&
      order.supplier.userId !== customerId
    ) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return this.prisma.review.findUnique({
      where: { orderId },
      include: REVIEW_INCLUDE,
    });
  }
}
