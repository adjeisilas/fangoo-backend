import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { RequestsService } from './requests.service.js';
import {
  OfferStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  RequestStatus,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client.js';

const tomorrow = () => new Date(Date.now() + 86_400_000);

describe('RequestsService', () => {
  let service: RequestsService;
  let mockPrisma: any;
  let mockNotifications: any;

  const supplier = {
    id: 'supplier-1',
    userId: 'supplier-user-1',
    verificationStatus: VerificationStatus.VERIFIED,
    isAcceptingOrders: true,
  };

  const openRequest = {
    id: 'request-1',
    buyerId: 'buyer-1',
    fuelTypeId: 'fuel-1',
    deliveryAreaId: 'area-1',
    deliveryAddress: '12 Depot Rd, Kumasi',
    quantityLitres: new Prisma.Decimal(30000),
    status: RequestStatus.OPEN,
    offers: [],
  };

  const offerDto = {
    pricePerLitre: 12.4,
    availableQuantity: 30000,
    deliveryFee: 500,
    deliveryDate: tomorrow().toISOString(),
  };

  beforeEach(() => {
    mockPrisma = {
      fuelType: {
        findUnique: vi.fn().mockResolvedValue({ id: 'fuel-1', isActive: true }),
      },
      deliveryArea: {
        findUnique: vi.fn().mockResolvedValue({ id: 'area-1', isActive: true }),
      },
      supplierProfile: {
        findUnique: vi.fn().mockResolvedValue(supplier),
        findMany: vi.fn().mockResolvedValue([]),
      },
      supplierDeliveryArea: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ deliveryFee: new Prisma.Decimal(500) }),
        findMany: vi.fn().mockResolvedValue([{ deliveryAreaId: 'area-1' }]),
        count: vi.fn().mockResolvedValue(1),
      },
      fuelRequest: {
        // Shaped like the real `REQUEST_INCLUDE` result, because the created
        // request is what gets announced to suppliers.
        create: vi.fn().mockResolvedValue({
          id: 'request-1',
          deliveryAreaId: 'area-1',
          quantityLitres: new Prisma.Decimal(30000),
          requiredBy: tomorrow(),
          fuelType: { name: 'Diesel (AGO)' },
          deliveryArea: { name: 'Tema' },
        }),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'request-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      offer: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'offer-1' }),
        // Read back after a bid (with its request) and after an award is locked.
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'offer-1',
          supplierProfileId: 'supplier-1',
          pricePerLitre: new Prisma.Decimal(1),
          deliveryFee: new Prisma.Decimal(0),
          subtotal: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(100),
          request: { fuelType: { name: 'Diesel (AGO)' } },
        }),
        update: vi.fn().mockResolvedValue({ id: 'offer-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: { create: vi.fn().mockResolvedValue({ id: 'order-1' }) },
      orderStatusHistory: { create: vi.fn() },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockNotifications = { notify: vi.fn().mockResolvedValue(1) };

    service = new RequestsService(mockPrisma as any, mockNotifications as any);
  });

  /** Flattens a `notify` call into a plain array, whether it was given one or many. */
  const notified = () =>
    mockNotifications.notify.mock.calls.flatMap((call: any[]) =>
      Array.isArray(call[0]) ? call[0] : [call[0]],
    );

  describe('createRequest', () => {
    const dto = {
      fuelTypeId: 'fuel-1',
      deliveryAreaId: 'area-1',
      deliveryAddress: '  12 Depot Rd  ',
      quantityLitres: 30000,
      requiredBy: tomorrow().toISOString(),
    };

    it('creates an open request for the buyer', async () => {
      await service.createRequest('buyer-1', dto);

      expect(mockPrisma.fuelRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            buyerId: 'buyer-1',
            deliveryAddress: '12 Depot Rd',
          }),
        }),
      );
    });

    it('rejects a required-by date in the past', async () => {
      await expect(
        service.createRequest('buyer-1', {
          ...dto,
          requiredBy: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a retired fuel type', async () => {
      mockPrisma.fuelType.findUnique.mockResolvedValue({ isActive: false });

      await expect(service.createRequest('buyer-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('notifications', () => {
    const dto = {
      fuelTypeId: 'fuel-1',
      deliveryAreaId: 'area-1',
      deliveryAddress: '12 Depot Rd',
      quantityLitres: 30000,
      requiredBy: tomorrow().toISOString(),
    };

    it('announces a new request only to suppliers who could actually bid', async () => {
      mockPrisma.supplierProfile.findMany.mockResolvedValue([
        { userId: 'supplier-user-1' },
        { userId: 'supplier-user-2' },
      ]);

      await service.createRequest('buyer-1', dto);

      // Verified, accepting orders, and covering the area — anything else would be
      // told about work the server would then refuse them.
      expect(mockPrisma.supplierProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verificationStatus: VerificationStatus.VERIFIED,
            isAcceptingOrders: true,
            deliveryAreas: { some: { deliveryAreaId: 'area-1' } },
          }),
        }),
      );

      const sent = notified();
      expect(sent).toHaveLength(2);
      expect(sent[0].type).toBe('REQUEST_POSTED');
      expect(sent[0].link).toBe('/supplier/requests/request-1');
    });

    it('tells nobody when no supplier covers the area', async () => {
      mockPrisma.supplierProfile.findMany.mockResolvedValue([]);

      await service.createRequest('buyer-1', dto);

      expect(notified()).toHaveLength(0);
    });

    it('tells the buyer when a first offer arrives', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(openRequest);

      await service.submitOffer('request-1', 'supplier-user-1', offerDto);

      const sent = notified().filter((n: any) => n.type === 'OFFER_RECEIVED');
      expect(sent).toHaveLength(1);
      expect(sent[0].userId).toBe('buyer-1');
      expect(sent[0].link).toBe('/requests/request-1');
    });

    /** Revising a price is not news; it would just spam the buyer. */
    it('does not re-notify the buyer when a supplier revises its price', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(openRequest);
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: OfferStatus.PENDING,
      });

      await service.submitOffer('request-1', 'supplier-user-1', offerDto);

      expect(notified().filter((n: any) => n.type === 'OFFER_RECEIVED')).toHaveLength(0);
    });

    it('tells the winner and every loser when a request is awarded', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...openRequest,
        offers: [
          { id: 'offer-1', supplierProfileId: 'supplier-1', status: OfferStatus.PENDING, deliveryFee: new Prisma.Decimal(0), subtotal: new Prisma.Decimal(100), totalAmount: new Prisma.Decimal(100), pricePerLitre: new Prisma.Decimal(1) },
          { id: 'offer-2', supplierProfileId: 'supplier-2', status: OfferStatus.PENDING, deliveryFee: new Prisma.Decimal(0), subtotal: new Prisma.Decimal(120), totalAmount: new Prisma.Decimal(120), pricePerLitre: new Prisma.Decimal(2) },
          { id: 'offer-3', supplierProfileId: 'supplier-3', status: OfferStatus.WITHDRAWN, deliveryFee: new Prisma.Decimal(0), subtotal: new Prisma.Decimal(90), totalAmount: new Prisma.Decimal(90), pricePerLitre: new Prisma.Decimal(1) },
        ],
      });
      mockPrisma.supplierProfile.findMany.mockResolvedValue([
        { id: 'supplier-1', userId: 'user-win' },
        { id: 'supplier-2', userId: 'user-lose' },
      ]);

      await service.acceptOffer('request-1', 'offer-1', 'buyer-1');

      const sent = notified();
      const won = sent.find((n: any) => n.type === 'OFFER_ACCEPTED');
      const lost = sent.filter((n: any) => n.type === 'OFFER_REJECTED');

      expect(won?.userId).toBe('user-win');
      expect(lost).toHaveLength(1);
      expect(lost[0].userId).toBe('user-lose');
      // A withdrawn bid is not a loss — that supplier walked away already.
      expect(sent.some((n: any) => n.userId === 'supplier-3')).toBe(false);
    });

    /**
     * Notifying happens after the transaction commits, so it can never roll back
     * an award. Even a total failure of the notification layer must leave the
     * order standing.
     */
    it('still awards the request when notifying fails', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...openRequest,
        offers: [
          { id: 'offer-1', supplierProfileId: 'supplier-1', status: OfferStatus.PENDING, deliveryFee: new Prisma.Decimal(0), subtotal: new Prisma.Decimal(100), totalAmount: new Prisma.Decimal(100), pricePerLitre: new Prisma.Decimal(1) },
        ],
      });
      mockPrisma.supplierProfile.findMany.mockRejectedValue(new Error('db down'));

      await expect(
        service.acceptOffer('request-1', 'offer-1', 'buyer-1'),
      ).resolves.toBeDefined();

      expect(mockPrisma.order.create).toHaveBeenCalled();
    });
  });

  describe('getOpenRequestsForSupplier', () => {
    beforeEach(() => {
      mockPrisma.fuelRequest.findMany.mockResolvedValue([]);
    });

    it('only surfaces requests in areas the supplier actually covers', async () => {
      mockPrisma.supplierDeliveryArea.findMany.mockResolvedValue([
        { deliveryAreaId: 'area-1' },
        { deliveryAreaId: 'area-2' },
      ]);

      await service.getOpenRequestsForSupplier('supplier-user-1');

      expect(mockPrisma.fuelRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: RequestStatus.OPEN,
            deliveryAreaId: { in: ['area-1', 'area-2'] },
          }),
        }),
      );
    });

    /**
     * The feed must not advertise work the supplier would then be refused: bidding
     * on an uncovered area throws, so an uncovered supplier sees an empty feed.
     */
    it('shows nothing to a supplier with no delivery coverage', async () => {
      mockPrisma.supplierDeliveryArea.findMany.mockResolvedValue([]);

      await service.getOpenRequestsForSupplier('supplier-user-1');

      expect(mockPrisma.fuelRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deliveryAreaId: { in: [] } }),
        }),
      );
    });

    it('refuses an unverified supplier outright', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue({
        ...supplier,
        verificationStatus: VerificationStatus.PENDING,
      });

      await expect(
        service.getOpenRequestsForSupplier('supplier-user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submitOffer', () => {
    beforeEach(() => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(openRequest);
    });

    it('prices the offer against the requested quantity, not the supplier’s stock', async () => {
      await service.submitOffer('request-1', 'supplier-user-1', {
        ...offerDto,
        availableQuantity: 50000,
      });

      const data = mockPrisma.offer.create.mock.calls[0][0].data;
      // 12.40 × 30,000 requested = 372,000  (+500 delivery)
      expect(data.subtotal.toString()).toBe('372000');
      expect(data.totalAmount.toString()).toBe('372500');
    });

    it('refuses a bid that cannot cover the full requirement', async () => {
      await expect(
        service.submitOffer('request-1', 'supplier-user-1', {
          ...offerDto,
          availableQuantity: 10000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses an unverified supplier', async () => {
      mockPrisma.supplierProfile.findUnique.mockResolvedValue({
        ...supplier,
        verificationStatus: VerificationStatus.PENDING,
      });

      await expect(
        service.submitOffer('request-1', 'supplier-user-1', offerDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a supplier that does not cover the delivery area', async () => {
      mockPrisma.supplierDeliveryArea.findUnique.mockResolvedValue(null);

      await expect(
        service.submitOffer('request-1', 'supplier-user-1', offerDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses bidding on a closed request', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...openRequest,
        status: RequestStatus.AWARDED,
      });

      await expect(
        service.submitOffer('request-1', 'supplier-user-1', offerDto),
      ).rejects.toThrow(BadRequestException);
    });

    /**
     * Regression: a revision was an unconditional upsert, so a price change landing
     * as the buyer accepted flipped the accepted offer back to PENDING.
     */
    it('revises a bid only while the request is open and the bid not accepted', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: OfferStatus.PENDING,
      });

      await service.submitOffer('request-1', 'supplier-user-1', offerDto);

      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'offer-1',
          status: { not: OfferStatus.ACCEPTED },
          request: { status: RequestStatus.OPEN },
        },
        data: expect.objectContaining({ status: OfferStatus.PENDING }),
      });
      expect(mockPrisma.offer.create).not.toHaveBeenCalled();
    });

    it('refuses a revision that lost the race to an award', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: OfferStatus.PENDING,
      });
      mockPrisma.offer.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.submitOffer('request-1', 'supplier-user-1', offerDto),
      ).rejects.toThrow(ConflictException);
    });

    it('turns two simultaneous first bids into a conflict, not a crash', async () => {
      mockPrisma.offer.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(
        service.submitOffer('request-1', 'supplier-user-1', offerDto),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses bidding on your own request', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...openRequest,
        buyerId: 'supplier-user-1',
      });

      await expect(
        service.submitOffer('request-1', 'supplier-user-1', offerDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('acceptOffer', () => {
    const offer = {
      id: 'offer-1',
      supplierProfileId: 'supplier-1',
      status: OfferStatus.PENDING,
      pricePerLitre: new Prisma.Decimal('12.40'),
      deliveryFee: new Prisma.Decimal(500),
      subtotal: new Prisma.Decimal(372000),
      totalAmount: new Prisma.Decimal(372500),
    };

    beforeEach(() => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...openRequest,
        offers: [offer, { id: 'offer-2', status: OfferStatus.PENDING }],
      });
      mockPrisma.offer.findUniqueOrThrow.mockResolvedValue(offer);
    });

    it('creates an RFQ-sourced order at the agreed price', async () => {
      await service.acceptOffer('request-1', 'offer-1', 'buyer-1');

      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'buyer-1',
            supplierProfileId: 'supplier-1',
            source: OrderSource.REQUEST,
            status: OrderStatus.PENDING,
            totalAmount: offer.totalAmount,
          }),
        }),
      );
    });

    it('accepts the winner, rejects every rival, and closes the request', async () => {
      await service.acceptOffer('request-1', 'offer-1', 'buyer-1');

      expect(mockPrisma.fuelRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', status: RequestStatus.OPEN },
        data: { status: RequestStatus.AWARDED },
      });
      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', requestId: 'request-1', status: OfferStatus.PENDING },
        data: { status: OfferStatus.ACCEPTED },
      });
      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: {
          requestId: 'request-1',
          id: { not: 'offer-1' },
          status: OfferStatus.PENDING,
        },
        data: { status: OfferStatus.REJECTED },
      });
      expect(mockPrisma.fuelRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { orderId: 'order-1' },
        }),
      );
    });

    it('refuses an award by anyone but the buyer', async () => {
      await expect(
        service.acceptOffer('request-1', 'offer-1', 'someone-else'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('refuses a second award on the same request', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...openRequest,
        status: RequestStatus.AWARDED,
        offers: [offer],
      });

      await expect(
        service.acceptOffer('request-1', 'offer-1', 'buyer-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    /**
     * Regression: both checks ran on a snapshot, so two clicks at the same moment
     * each created an order for one request.
     */
    it('creates no order when a concurrent award already closed the request', async () => {
      mockPrisma.fuelRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.acceptOffer('request-1', 'offer-1', 'buyer-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
      expect(mockNotifications.notify).not.toHaveBeenCalled();
    });

    it('creates no order when the offer was withdrawn meanwhile', async () => {
      mockPrisma.offer.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.acceptOffer('request-1', 'offer-1', 'buyer-1'),
      ).rejects.toThrow('That offer is no longer available');
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('prices the order from the offer as locked, not as first read', async () => {
      mockPrisma.offer.findUniqueOrThrow.mockResolvedValue({
        ...offer,
        totalAmount: new Prisma.Decimal(360500),
      });

      await service.acceptOffer('request-1', 'offer-1', 'buyer-1');

      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: new Prisma.Decimal(360500),
          }),
        }),
      );
    });

    it('refuses an offer that belongs to another request', async () => {
      await expect(
        service.acceptOffer('request-1', 'offer-from-elsewhere', 'buyer-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRequestById', () => {
    const withRivalOffers = {
      ...openRequest,
      buyer: {
        id: 'buyer-1',
        firstName: 'Ama',
        lastName: 'Mensah',
        email: 'ama@example.com',
      },
      offers: [
        { id: 'offer-1', supplierProfileId: 'supplier-1' },
        { id: 'offer-2', supplierProfileId: 'supplier-2' },
      ],
    };

    it('shows the buyer every offer', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(withRivalOffers);

      const result = await service.getRequestById(
        'request-1',
        'buyer-1',
        Role.CUSTOMER,
      );

      expect(result.offers).toHaveLength(2);
      expect(result.buyer).toHaveProperty('email', 'ama@example.com');
    });

    it('never leaks a rival bid to a competing supplier', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(withRivalOffers);

      const result = await service.getRequestById(
        'request-1',
        'supplier-user-1',
        Role.SUPPLIER,
      );

      expect(result.offers).toHaveLength(1);
      expect(result.offers[0]!.supplierProfileId).toBe('supplier-1');
    });

    it('never gives a supplier the buyer’s email', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(withRivalOffers);

      const result = await service.getRequestById(
        'request-1',
        'supplier-user-1',
        Role.SUPPLIER,
      );

      expect(result.buyer).toEqual({ id: 'buyer-1', firstName: 'Ama', lastName: 'Mensah' });
    });

    it('lets a supplier that could bid read an open request it has not bid on', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...withRivalOffers,
        offers: [{ id: 'offer-2', supplierProfileId: 'supplier-2' }],
      });

      const result = await service.getRequestById(
        'request-1',
        'supplier-user-1',
        Role.SUPPLIER,
      );

      expect(result.offers).toEqual([]);
      expect(mockPrisma.supplierDeliveryArea.count).toHaveBeenCalledWith({
        where: { supplierProfileId: 'supplier-1', deliveryAreaId: 'area-1' },
      });
    });

    /**
     * Regression: any account with a supplier profile — even an unverified one
     * with no coverage — could read any request, buyer email included.
     */
    it.each([
      ['does not cover the area', () => mockPrisma.supplierDeliveryArea.count.mockResolvedValue(0)],
      [
        'is not verified',
        () =>
          mockPrisma.supplierProfile.findUnique.mockResolvedValue({
            ...supplier,
            verificationStatus: VerificationStatus.PENDING,
          }),
      ],
      [
        'is not accepting orders',
        () =>
          mockPrisma.supplierProfile.findUnique.mockResolvedValue({
            ...supplier,
            isAcceptingOrders: false,
          }),
      ],
      [
        'is looking at a closed request',
        () =>
          mockPrisma.fuelRequest.findUnique.mockResolvedValue({
            ...withRivalOffers,
            status: RequestStatus.AWARDED,
            offers: [],
          }),
      ],
    ])('refuses a supplier that has not bid and %s', async (_case, arrange) => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...withRivalOffers,
        offers: [],
      });
      arrange();

      await expect(
        service.getRequestById('request-1', 'supplier-user-1', Role.SUPPLIER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still lets a supplier read a closed request it bid on', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue({
        ...withRivalOffers,
        status: RequestStatus.AWARDED,
      });
      mockPrisma.supplierDeliveryArea.count.mockResolvedValue(0);

      const result = await service.getRequestById(
        'request-1',
        'supplier-user-1',
        Role.SUPPLIER,
      );

      expect(result.offers).toHaveLength(1);
    });

    it('refuses a stranger with no supplier profile', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(withRivalOffers);
      mockPrisma.supplierProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.getRequestById('request-1', 'stranger', Role.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelRequest', () => {
    it('rejects outstanding offers when the buyer cancels', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(openRequest);

      await service.cancelRequest('request-1', 'buyer-1');

      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: { requestId: 'request-1', status: OfferStatus.PENDING },
        data: { status: OfferStatus.REJECTED },
      });
    });

    it('refuses cancelling someone else’s request', async () => {
      mockPrisma.fuelRequest.findUnique.mockResolvedValue(openRequest);

      await expect(
        service.cancelRequest('request-1', 'not-the-buyer'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
