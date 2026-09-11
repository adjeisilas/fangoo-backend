import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { OrderStatus } from '../../generated/prisma/client.js';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockPrisma: any;

  const deliveredOrder = {
    id: 'order-1',
    customerId: 'customer-1',
    supplierProfileId: 'supplier-1',
    status: OrderStatus.DELIVERED,
    review: null,
  };

  const dto = { orderId: 'order-1', rating: 5, comment: '  Great service  ' };

  beforeEach(() => {
    mockPrisma = {
      order: { findUnique: vi.fn() },
      review: {
        create: vi.fn().mockResolvedValue({ id: 'review-1' }),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        aggregate: vi.fn(),
      },
    };

    service = new ReviewsService(mockPrisma as any);
  });

  describe('createReview', () => {
    it('should create a review for a delivered order the customer owns', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(deliveredOrder);

      await service.createReview('customer-1', dto);

      expect(mockPrisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            orderId: 'order-1',
            customerId: 'customer-1',
            // Supplier comes from the order, never from the request payload.
            supplierProfileId: 'supplier-1',
            rating: 5,
            comment: 'Great service',
          },
        }),
      );
    });

    it('should reject a review from someone who does not own the order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(deliveredOrder);

      await expect(service.createReview('someone-else', dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.review.create).not.toHaveBeenCalled();
    });

    it('should reject a review for an order that is not delivered', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...deliveredOrder,
        status: OrderStatus.OUT_FOR_DELIVERY,
      });

      await expect(service.createReview('customer-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.review.create).not.toHaveBeenCalled();
    });

    it('should reject a second review for the same order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...deliveredOrder,
        review: { id: 'existing' },
      });

      await expect(service.createReview('customer-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.createReview('customer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should store a blank comment as null rather than an empty string', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(deliveredOrder);

      await service.createReview('customer-1', { ...dto, comment: '   ' });

      expect(mockPrisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ comment: null }),
        }),
      );
    });
  });

  describe('getSupplierReviews', () => {
    it('should return reviews with the aggregate rating', async () => {
      mockPrisma.review.findMany.mockResolvedValue([
        { id: 'review-1', rating: 4 },
      ]);
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { rating: 2 },
      });

      const result = await service.getSupplierReviews('supplier-1');

      expect(result.averageRating).toBe(4.5);
      expect(result.totalReviews).toBe(2);
      expect(result.reviews).toHaveLength(1);
    });

    it('should report null average when a supplier has no reviews', async () => {
      mockPrisma.review.findMany.mockResolvedValue([]);
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { rating: 0 },
      });

      const result = await service.getSupplierReviews('supplier-1');

      expect(result.averageRating).toBeNull();
      expect(result.totalReviews).toBe(0);
    });
  });

  describe('getReviewForOrder', () => {
    it('should reject a user unrelated to the order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        customerId: 'customer-1',
        supplier: { userId: 'supplier-user-1' },
      });

      await expect(
        service.getReviewForOrder('order-1', 'stranger'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow the owning supplier to read the review', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        customerId: 'customer-1',
        supplier: { userId: 'supplier-user-1' },
      });
      mockPrisma.review.findUnique.mockResolvedValue({ id: 'review-1' });

      const result = await service.getReviewForOrder(
        'order-1',
        'supplier-user-1',
      );

      expect(result).toEqual({ id: 'review-1' });
    });
  });
});
