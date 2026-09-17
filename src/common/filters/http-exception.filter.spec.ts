import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let json: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  let logged: ReturnType<typeof vi.spyOn>;

  const host = () =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'POST',
          url: '/api/v1/orders',
          originalUrl: '/api/v1/orders',
        }),
      }),
    }) as any;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn(() => ({ json }));
    logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  /**
   * Regression: unexpected errors reached the client as a bare "Internal server
   * error" and were recorded nowhere, so a production failure left no trace.
   */
  it('logs an unexpected error with its stack, and hides it from the client', () => {
    const boom = new Error('connection reset');

    new HttpExceptionFilter().catch(boom, host());

    expect(logged).toHaveBeenCalledWith(
      'POST /api/v1/orders failed with 500',
      boom.stack,
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error' }),
    );
  });

  it('logs a deliberate 5xx too', () => {
    new HttpExceptionFilter().catch(
      new InternalServerErrorException('Could not start the payment'),
      host(),
    );

    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('does not log a client error', () => {
    new HttpExceptionFilter().catch(
      new BadRequestException(['name is required', 'city is required']),
      host(),
    );

    expect(logged).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'name is required, city is required',
        statusCode: 400,
      }),
    );
  });

  it('logs something readable when a non-Error is thrown', () => {
    new HttpExceptionFilter().catch('plain string', host());

    expect(logged).toHaveBeenCalledWith(
      'POST /api/v1/orders failed with 500',
      'plain string',
    );
  });
});
