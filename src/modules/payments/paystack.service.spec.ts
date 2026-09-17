import { describe, it, expect } from 'vitest';
import { readOrderId } from './paystack.service.js';

/**
 * The order id sent at checkout is how a payment through an older checkout link
 * finds its order, so reading it back must be exact and never throw.
 */
describe('readOrderId', () => {
  it('reads metadata returned as an object', () => {
    expect(readOrderId({ order_id: 'order-1' })).toBe('order-1');
  });

  it('reads metadata returned as the JSON string it was sent as', () => {
    expect(readOrderId('{"order_id":"order-1"}')).toBe('order-1');
  });

  it.each([
    ['missing metadata', undefined],
    ['null metadata', null],
    ['an empty string', ''],
    ['text that is not JSON', 'not json'],
    ['metadata without an order id', { cart_id: 'x' }],
    ['a non-string order id', { order_id: 42 }],
    ['an empty order id', { order_id: '' }],
  ])('returns null for %s', (_case, metadata) => {
    expect(readOrderId(metadata)).toBeNull();
  });
});
