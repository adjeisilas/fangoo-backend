/**
 * Ceilings for the numbers that reach the money columns.
 *
 * Orders store money as Decimal(10, 2), so anything above `MAX_AMOUNT` cannot be
 * written at all: without these checks a large enough quote reached the database
 * and came back as a 500 with the order half-made. The litre and price ceilings
 * are deliberately far above any real fuel order — they exist to catch a typo or
 * a probe before it is multiplied out, not to price the market.
 */
export const MAX_AMOUNT = 99_999_999.99;

/** Litres on a single line. A tanker carries ~45,000. */
export const MAX_LITRES = 10_000_000;

/** GHS per litre. */
export const MAX_PRICE_PER_LITRE = 100_000;

export const MAX_AMOUNT_MESSAGE = `Amount must not exceed ${MAX_AMOUNT}`;
export const MAX_LITRES_MESSAGE = `Quantity must not exceed ${MAX_LITRES.toLocaleString('en-GH')} litres`;
export const MAX_PRICE_MESSAGE = `Price per litre must not exceed ${MAX_PRICE_PER_LITRE.toLocaleString('en-GH')}`;
