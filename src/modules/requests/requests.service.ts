import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  NotificationType,
  OfferStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  RequestStatus,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client.js';
import { CreateRequestDto } from './dto/create-request.dto.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';

const REQUEST_INCLUDE = {
  fuelType: true,
  deliveryArea: true,
  buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
  offers: {
    include: {
      supplier: {
        select: { id: true, companyName: true, city: true, userId: true },
      },
    },
    orderBy: { pricePerLitre: 'asc' },
  },
} satisfies Prisma.FuelRequestInclude;

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Runs a notification side-effect that must never affect its caller.
   *
   * `NotificationsService.notify` already swallows its own failures, but working
   * out *who* to tell means more database queries — and those would otherwise
   * propagate and fail the very business operation being announced. Telling
   * someone about an award is never worth losing the award over.
   */
  private async announce(label: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Could not send ${label} notifications: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ----------------- Buyer -----------------

  async createRequest(buyerId: string, dto: CreateRequestDto) {
    const [fuelType, area] = await Promise.all([
      this.prisma.fuelType.findUnique({ where: { id: dto.fuelTypeId } }),
      this.prisma.deliveryArea.findUnique({
        where: { id: dto.deliveryAreaId },
      }),
    ]);

    if (!fuelType || !fuelType.isActive) {
      throw new NotFoundException('Fuel type not available');
    }

    if (!area || !area.isActive) {
      throw new NotFoundException('Delivery area not available');
    }

    const requiredBy = new Date(dto.requiredBy);

    if (requiredBy.getTime() < Date.now()) {
      throw new BadRequestException(
        'The required-by date must be in the future',
      );
    }

    const request = await this.prisma.fuelRequest.create({
      data: {
        buyerId,
        fuelTypeId: dto.fuelTypeId,
        deliveryAreaId: dto.deliveryAreaId,
        deliveryAddress: dto.deliveryAddress.trim(),
        quantityLitres: new Prisma.Decimal(dto.quantityLitres),
        requiredBy,
        notes: dto.notes?.trim() || null,
      },
      include: REQUEST_INCLUDE,
    });

    await this.announce('request-posted', () => this.announceRequest(request));

    return request;
  }

  /**
   * Tells exactly the suppliers who could actually bid: verified, open for
   * business, and covering the delivery area. Anyone else would be told about
   * work the server would then refuse them.
   */
  private async announceRequest(request: {
    id: string;
    deliveryAreaId: string;
    quantityLitres: Prisma.Decimal;
    requiredBy: Date;
    fuelType: { name: string };
    deliveryArea: { name: string };
  }) {
    const eligible = await this.prisma.supplierProfile.findMany({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        isAcceptingOrders: true,
        deliveryAreas: { some: { deliveryAreaId: request.deliveryAreaId } },
      },
      select: { userId: true },
    });

    const litres = Number(request.quantityLitres).toLocaleString('en-GH');
    const by = request.requiredBy.toLocaleDateString('en-GH', {
      day: 'numeric',
      month: 'short',
    });

    await this.notifications.notify(
      eligible.map((supplier) => ({
        userId: supplier.userId,
        type: NotificationType.REQUEST_POSTED,
        title: `New request: ${litres}L ${request.fuelType.name}`,
        body: `A buyer needs delivery to ${request.deliveryArea.name} by ${by}. Submit an offer before someone else does.`,
        link: `/supplier/requests/${request.id}`,
        entityId: request.id,
      })),
    );
  }

  async getMyRequests(buyerId: string) {
    return this.prisma.fuelRequest.findMany({
      where: { buyerId },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelRequest(requestId: string, buyerId: string) {
    const request = await this.prisma.fuelRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.buyerId !== buyerId) {
      throw new ForbiddenException('You can only cancel your own requests');
    }

    if (request.status !== RequestStatus.OPEN) {
      throw new BadRequestException(
        `A ${request.status.toLowerCase()} request cannot be cancelled`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Outstanding bids die with the request.
      await tx.offer.updateMany({
        where: { requestId, status: OfferStatus.PENDING },
        data: { status: OfferStatus.REJECTED },
      });

      return tx.fuelRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.CANCELLED },
        include: REQUEST_INCLUDE,
      });
    });
  }

  // ----------------- Supplier -----------------

  /** The marketplace feed: open requests in areas this supplier actually covers. */
  async getOpenRequestsForSupplier(userId: string) {
    const supplier = await this.requireTradingSupplier(userId);

    const coveredAreaIds = (
      await this.prisma.supplierDeliveryArea.findMany({
        where: { supplierProfileId: supplier.id },
        select: { deliveryAreaId: true },
      })
    ).map((row) => row.deliveryAreaId);

    return this.prisma.fuelRequest.findMany({
      where: {
        status: RequestStatus.OPEN,
        requiredBy: { gte: new Date() },
        // Always area-filtered. A supplier covering nothing sees nothing: showing
        // it requests it would then be refused (`submitOffer` rejects uncovered
        // areas) is a promise the marketplace cannot keep.
        deliveryAreaId: { in: coveredAreaIds },
      },
      include: {
        fuelType: true,
        deliveryArea: true,
        buyer: { select: { firstName: true, lastName: true } },
        // Only this supplier's own bid is visible — never a rival's price.
        offers: {
          where: { supplierProfileId: supplier.id },
          select: { id: true, status: true, pricePerLitre: true },
        },
        _count: { select: { offers: true } },
      },
      orderBy: { requiredBy: 'asc' },
    });
  }

  async submitOffer(requestId: string, userId: string, dto: CreateOfferDto) {
    const supplier = await this.requireTradingSupplier(userId);

    const request = await this.prisma.fuelRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.status !== RequestStatus.OPEN) {
      throw new BadRequestException(
        'This request is no longer accepting offers',
      );
    }

    if (request.buyerId === userId) {
      throw new ForbiddenException('You cannot bid on your own request');
    }

    const covers = await this.prisma.supplierDeliveryArea.findUnique({
      where: {
        supplierProfileId_deliveryAreaId: {
          supplierProfileId: supplier.id,
          deliveryAreaId: request.deliveryAreaId,
        },
      },
    });

    if (!covers) {
      throw new ForbiddenException('You do not deliver to this area');
    }

    const quantity = new Prisma.Decimal(dto.availableQuantity);

    // One order, one supplier — a partial bid cannot fulfil the requirement.
    if (quantity.lessThan(request.quantityLitres)) {
      throw new BadRequestException(
        `This request needs ${request.quantityLitres.toString()}L and you offered ${quantity.toString()}L`,
      );
    }

    const existing = await this.prisma.offer.findUnique({
      where: {
        requestId_supplierProfileId: {
          requestId,
          supplierProfileId: supplier.id,
        },
      },
    });

    if (existing && existing.status === OfferStatus.ACCEPTED) {
      throw new ConflictException('This offer has already been accepted');
    }

    const pricePerLitre = new Prisma.Decimal(dto.pricePerLitre);
    const deliveryFee = new Prisma.Decimal(dto.deliveryFee ?? 0);
    // Priced against what the buyer asked for, not what the supplier can spare.
    const subtotal = pricePerLitre.times(request.quantityLitres);
    const totalAmount = subtotal.plus(deliveryFee);

    const data = {
      pricePerLitre,
      availableQuantity: quantity,
      deliveryFee,
      deliveryDate: new Date(dto.deliveryDate),
      subtotal,
      totalAmount,
      notes: dto.notes?.trim() || null,
      status: OfferStatus.PENDING,
    };

    const offer = await this.prisma.offer.upsert({
      where: {
        requestId_supplierProfileId: {
          requestId,
          supplierProfileId: supplier.id,
        },
      },
      create: { requestId, supplierProfileId: supplier.id, ...data },
      update: data,
      include: { request: { include: { fuelType: true, deliveryArea: true } } },
    });

    // Only on a first bid: a supplier revising its price should not re-notify.
    if (!existing) {
      await this.announce('offer-received', async () => {
        const fuelName = offer.request?.fuelType?.name;

        await this.notifications.notify({
          userId: request.buyerId,
          type: NotificationType.OFFER_RECEIVED,
          title: fuelName
            ? `New offer on your ${fuelName} request`
            : 'New offer on your fuel request',
          body: `${supplier.companyName} quoted GHS ${pricePerLitre.toFixed(2)}/litre — GHS ${totalAmount.toFixed(2)} delivered. Compare it against any other offers.`,
          link: `/requests/${requestId}`,
          entityId: requestId,
        });
      });
    }

    return offer;
  }

  async getMyOffers(userId: string) {
    const supplier = await this.requireSupplierProfile(userId);

    return this.prisma.offer.findMany({
      where: { supplierProfileId: supplier.id },
      include: {
        request: {
          include: {
            fuelType: true,
            deliveryArea: true,
            buyer: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async withdrawOffer(offerId: string, userId: string) {
    const supplier = await this.requireSupplierProfile(userId);

    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) throw new NotFoundException('Offer not found');

    if (offer.supplierProfileId !== supplier.id) {
      throw new ForbiddenException('You can only withdraw your own offers');
    }

    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException(
        `A ${offer.status.toLowerCase()} offer cannot be withdrawn`,
      );
    }

    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.WITHDRAWN },
    });
  }

  // ----------------- Award -----------------

  /**
   * The buyer accepts one offer. That agreed price becomes an order, every rival
   * bid is rejected, and the request closes — atomically, so a request can never
   * end up awarded twice.
   */
  async acceptOffer(requestId: string, offerId: string, buyerId: string) {
    const request = await this.prisma.fuelRequest.findUnique({
      where: { id: requestId },
      include: { offers: true },
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.buyerId !== buyerId) {
      throw new ForbiddenException('You can only award your own requests');
    }

    if (request.status !== RequestStatus.OPEN) {
      throw new BadRequestException('This request has already been closed');
    }

    const offer = request.offers.find((candidate) => candidate.id === offerId);

    if (!offer) throw new NotFoundException('Offer not found on this request');

    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('That offer is no longer available');
    }

    const awarded = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: buyerId,
          supplierProfileId: offer.supplierProfileId,
          deliveryAreaId: request.deliveryAreaId,
          deliveryAddress: request.deliveryAddress,
          deliveryFee: offer.deliveryFee,
          subtotal: offer.subtotal,
          totalAmount: offer.totalAmount,
          status: OrderStatus.PENDING,
          // Marks this order as RFQ-sourced so payment skips catalogue stock.
          source: OrderSource.REQUEST,
          items: {
            create: [
              {
                fuelTypeId: request.fuelTypeId,
                pricePerLitre: offer.pricePerLitre,
                quantity: request.quantityLitres,
                lineTotal: offer.subtotal,
              },
            ],
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          note: `Awarded from request ${request.id}`,
        },
      });

      await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.ACCEPTED },
      });

      await tx.offer.updateMany({
        where: { requestId, id: { not: offerId }, status: OfferStatus.PENDING },
        data: { status: OfferStatus.REJECTED },
      });

      await tx.fuelRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.AWARDED, orderId: order.id },
      });

      return { order, offerId };
    });

    // After the transaction commits, never inside it: telling people is not
    // allowed to roll back an award.
    await this.announce('award', () =>
      this.announceAward(request, offer, awarded.order.id),
    );

    return awarded;
  }

  /** Both outcomes get said out loud — losing a bid silently is worse than losing it. */
  private async announceAward(
    request: { id: string; fuelTypeId: string; offers: { id: string; supplierProfileId: string; status: OfferStatus }[] },
    winning: { id: string; supplierProfileId: string; totalAmount: Prisma.Decimal },
    orderId: string,
  ) {
    const loserProfileIds = request.offers
      .filter(
        (candidate) =>
          candidate.id !== winning.id && candidate.status === OfferStatus.PENDING,
      )
      .map((candidate) => candidate.supplierProfileId);

    const profiles = await this.prisma.supplierProfile.findMany({
      where: { id: { in: [winning.supplierProfileId, ...loserProfileIds] } },
      select: { id: true, userId: true },
    });

    const userIdFor = (profileId: string) =>
      profiles.find((profile) => profile.id === profileId)?.userId;

    const winnerUserId = userIdFor(winning.supplierProfileId);
    const total = Number(winning.totalAmount).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    await this.notifications.notify([
      ...(winnerUserId
        ? [
            {
              userId: winnerUserId,
              type: NotificationType.OFFER_ACCEPTED,
              title: 'You won the bid',
              body: `Your offer was accepted — GHS ${total}. The order appears once the buyer has paid.`,
              link: '/supplier/orders',
              entityId: orderId,
            },
          ]
        : []),
      ...loserProfileIds.flatMap((profileId) => {
        const userId = userIdFor(profileId);
        return userId
          ? [
              {
                userId,
                type: NotificationType.OFFER_REJECTED,
                title: 'Your offer was not selected',
                body: 'The buyer awarded this request to another supplier. Your stock has not been touched.',
                link: '/supplier/offers',
                entityId: request.id,
              },
            ]
          : [];
      }),
    ]);
  }

  // ----------------- Shared / admin -----------------

  async getRequestById(requestId: string, userId: string, role: Role) {
    const request = await this.prisma.fuelRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.buyerId === userId || role === Role.ADMIN) {
      return request;
    }

    // A bidding supplier may read the brief, but never rival bids.
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!supplier) {
      throw new ForbiddenException('You do not have access to this request');
    }

    return {
      ...request,
      offers: request.offers.filter(
        (offer) => offer.supplierProfileId === supplier.id,
      ),
    };
  }

  async listAllForAdmin(status?: RequestStatus) {
    return this.prisma.fuelRequest.findMany({
      where: status ? { status } : {},
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async requireSupplierProfile(userId: string) {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });

    if (!supplier) throw new NotFoundException('Supplier profile not found');

    return supplier;
  }

  /** Bidding requires a verified supplier that is currently open for business. */
  private async requireTradingSupplier(userId: string) {
    const supplier = await this.requireSupplierProfile(userId);

    if (
      supplier.verificationStatus !== VerificationStatus.VERIFIED ||
      !supplier.isAcceptingOrders
    ) {
      throw new ForbiddenException(
        'Only verified suppliers that are accepting orders can bid',
      );
    }

    return supplier;
  }
}
