import { OrderStatus } from '../../generated/prisma/client.js';

/**
 * Centralized order lifecycle transition map (fangoo-project skill §26/§27).
 * Payments/delivery modules must route status changes through `canTransitionOrderStatus`
 * rather than duplicating transition checks.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.AWAITING_CONFIRMATION],
  [OrderStatus.AWAITING_CONFIRMATION]: [
    OrderStatus.CONFIRMED,
    OrderStatus.REJECTED,
  ],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING],
  [OrderStatus.PREPARING]: [OrderStatus.OUT_FOR_DELIVERY],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [OrderStatus.REFUND_PENDING],
  [OrderStatus.REFUND_PENDING]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Who a requester is relative to a given order. */
export type OrderActor = 'CUSTOMER' | 'SUPPLIER' | 'ADMIN';

/**
 * Which actor may request each transition. Transitions absent from this map are
 * system-driven (the payment flow) and can never be requested through the API —
 * that is what stops a client pushing an order straight to DELIVERED (§26).
 */
export const ORDER_TRANSITION_ACTORS: Partial<
  Record<OrderStatus, Partial<Record<OrderStatus, OrderActor[]>>>
> = {
  [OrderStatus.PENDING]: {
    [OrderStatus.CANCELLED]: ['CUSTOMER', 'ADMIN'],
  },
  [OrderStatus.PAYMENT_PENDING]: {
    [OrderStatus.CANCELLED]: ['CUSTOMER', 'ADMIN'],
  },
  [OrderStatus.AWAITING_CONFIRMATION]: {
    [OrderStatus.CONFIRMED]: ['SUPPLIER', 'ADMIN'],
    [OrderStatus.REJECTED]: ['SUPPLIER', 'ADMIN'],
  },
  [OrderStatus.CONFIRMED]: {
    [OrderStatus.PREPARING]: ['SUPPLIER', 'ADMIN'],
  },
  [OrderStatus.PREPARING]: {
    [OrderStatus.OUT_FOR_DELIVERY]: ['SUPPLIER', 'ADMIN'],
  },
  // The customer closes the loop — a supplier cannot mark its own delivery complete.
  [OrderStatus.OUT_FOR_DELIVERY]: {
    [OrderStatus.DELIVERED]: ['CUSTOMER', 'ADMIN'],
  },
  [OrderStatus.REFUND_PENDING]: {
    [OrderStatus.REFUNDED]: ['ADMIN'],
  },
};

export function getAllowedActors(
  from: OrderStatus,
  to: OrderStatus,
): OrderActor[] {
  return ORDER_TRANSITION_ACTORS[from]?.[to] ?? [];
}
