import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { RateLimitGuard, type RateLimitOptions } from './rate-limit.guard.js';

const makeContext = (ip: string, handlerName = 'login') =>
  ({
    getHandler: () => ({ name: handlerName }),
    getClass: () => ({ name: 'AuthController' }),
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, ip, socket: { remoteAddress: ip } }),
    }),
  }) as any;

const makeReflector = (options?: RateLimitOptions) =>
  ({ getAllAndOverride: vi.fn().mockReturnValue(options) }) as any;

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;

  const options: RateLimitOptions = { limit: 3, windowMs: 60_000 };

  beforeEach(() => {
    guard = new RateLimitGuard(makeReflector(options));
  });

  it('allows requests up to the limit', () => {
    const ctx = makeContext('1.1.1.1');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks the request past the limit', () => {
    const ctx = makeContext('1.1.1.1');
    guard.canActivate(ctx);
    guard.canActivate(ctx);
    guard.canActivate(ctx);

    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    expect(() => guard.canActivate(ctx)).toThrow(/Too many attempts/);
  });

  it('counts each client separately', () => {
    const a = makeContext('1.1.1.1');
    const b = makeContext('2.2.2.2');

    guard.canActivate(a);
    guard.canActivate(a);
    guard.canActivate(a);
    expect(() => guard.canActivate(a)).toThrow(HttpException);

    // A different IP must not inherit the exhausted budget.
    expect(guard.canActivate(b)).toBe(true);
  });

  it('counts each endpoint separately', () => {
    const login = makeContext('1.1.1.1', 'login');
    const register = makeContext('1.1.1.1', 'register');

    guard.canActivate(login);
    guard.canActivate(login);
    guard.canActivate(login);
    expect(() => guard.canActivate(login)).toThrow(HttpException);

    expect(guard.canActivate(register)).toBe(true);
  });

  it('lets the budget recover once the window passes', () => {
    vi.useFakeTimers();
    try {
      const ctx = makeContext('1.1.1.1');
      guard.canActivate(ctx);
      guard.canActivate(ctx);
      guard.canActivate(ctx);
      expect(() => guard.canActivate(ctx)).toThrow(HttpException);

      vi.advanceTimersByTime(60_001);
      expect(guard.canActivate(ctx)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not limit routes without the decorator', () => {
    const open = new RateLimitGuard(makeReflector(undefined));
    const ctx = makeContext('1.1.1.1');

    for (let i = 0; i < 50; i += 1) {
      expect(open.canActivate(ctx)).toBe(true);
    }
  });

  it('prefers the forwarded client IP behind a proxy', () => {
    const proxied = (forwarded: string) =>
      ({
        getHandler: () => ({ name: 'login' }),
        getClass: () => ({ name: 'AuthController' }),
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-forwarded-for': forwarded },
            ip: '10.0.0.1',
            socket: { remoteAddress: '10.0.0.1' },
          }),
        }),
      }) as any;

    // Same proxy, different real clients — budgets must not be shared.
    guard.canActivate(proxied('9.9.9.9, 10.0.0.1'));
    guard.canActivate(proxied('9.9.9.9, 10.0.0.1'));
    guard.canActivate(proxied('9.9.9.9, 10.0.0.1'));
    expect(() => guard.canActivate(proxied('9.9.9.9, 10.0.0.1'))).toThrow(
      HttpException,
    );

    expect(guard.canActivate(proxied('8.8.8.8, 10.0.0.1'))).toBe(true);
  });
});
