import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.validation.js';

const strongA = 'a'.repeat(48);
const strongB = 'b'.repeat(48);

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost:5432/fangoo',
  JWT_ACCESS_SECRET: strongA,
  JWT_REFRESH_SECRET: strongB,
};

describe('validateEnv', () => {
  it('accepts a complete development configuration', () => {
    expect(() => validateEnv({ ...baseEnv })).not.toThrow();
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = baseEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL is required/);
  });

  it('rejects missing JWT secrets rather than falling back to a default', () => {
    const { JWT_ACCESS_SECRET: _omitted, ...rest } = baseEnv;
    expect(() => validateEnv(rest)).toThrow(/JWT_ACCESS_SECRET is required/);
  });

  it('rejects a short secret', () => {
    expect(() =>
      validateEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/at least 32 characters/);
  });

  it('rejects reusing one secret for both tokens', () => {
    expect(() =>
      validateEnv({ ...baseEnv, JWT_REFRESH_SECRET: strongA }),
    ).toThrow(/must be different/);
  });

  it('requires CORS_ORIGIN in production', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        PAYSTACK_SECRET_KEY: 'sk_live_x',
        PAYSTACK_CALLBACK_URL: 'https://fangoo.com/orders/payment-callback',
      }),
    ).toThrow(/CORS_ORIGIN is required in production/);
  });

  it('refuses a Paystack test key in production', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://fangoo.com',
        PAYSTACK_SECRET_KEY: 'sk_test_abc',
        PAYSTACK_CALLBACK_URL: 'https://fangoo.com/orders/payment-callback',
      }),
    ).toThrow(/test key but NODE_ENV is production/);
  });

  it('accepts a complete production configuration', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://fangoo.com',
        PAYSTACK_SECRET_KEY: 'sk_live_abc',
        PAYSTACK_CALLBACK_URL: 'https://fangoo.com/orders/payment-callback',
      }),
    ).not.toThrow();
  });
});
