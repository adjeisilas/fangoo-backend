import { describe, it, expect } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateDeliveryAreaDto } from './create-delivery-area.dto.js';
import { UpdateDeliveryAreaDto } from './update-delivery-area.dto.js';

// The same options `main.ts` applies to every request.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const messagesFor = async (metatype: new () => object, body: unknown): Promise<string[]> => {
  try {
    await pipe.transform(body, { type: 'body', metatype });
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return ([] as string[]).concat(
      ((err as BadRequestException).getResponse() as { message: string | string[] }).message,
    );
  }
};

describe('CreateDeliveryAreaDto', () => {
  const valid = { name: 'Ejisu Municipal Area', city: 'Ejisu', regionId: 'region-1' };

  it('accepts a complete area', async () => {
    expect(await messagesFor(CreateDeliveryAreaDto, valid)).toEqual([]);
  });

  it.each([
    [{ name: '' }, 'Delivery area name is required'],
    [{ name: '   ' }, 'Delivery area name is required'],
    [{ city: '  ' }, 'City is required'],
    [{ regionId: '' }, 'Region is required'],
    [{ name: 'x'.repeat(101) }, 'Delivery area name cannot exceed 100 characters'],
    [{ city: 'x'.repeat(51) }, 'City cannot exceed 50 characters'],
  ])('rejects %j', async (change, message) => {
    expect(await messagesFor(CreateDeliveryAreaDto, { ...valid, ...change })).toEqual([message]);
  });

  /** The contract changed from free text to an id; the old field is refused. */
  it('refuses the old free-text region field', async () => {
    expect(await messagesFor(CreateDeliveryAreaDto, { ...valid, region: 'Ashanti' })).toContain(
      'property region should not exist',
    );
  });
});

describe('UpdateDeliveryAreaDto', () => {
  it('accepts a partial update', async () => {
    expect(await messagesFor(UpdateDeliveryAreaDto, { isActive: false })).toEqual([]);
    expect(await messagesFor(UpdateDeliveryAreaDto, { city: 'Ejisu' })).toEqual([]);
  });

  it.each([
    [{ name: '  ' }, 'Delivery area name cannot be blank'],
    [{ city: '' }, 'City cannot be blank'],
    [{ regionId: '' }, 'Region cannot be blank'],
    [{ name: 'x'.repeat(101) }, 'Delivery area name cannot exceed 100 characters'],
  ])('rejects %j', async (body, message) => {
    expect(await messagesFor(UpdateDeliveryAreaDto, body)).toEqual([message]);
  });

  it('requires isActive to be a real boolean', async () => {
    expect(await messagesFor(UpdateDeliveryAreaDto, { isActive: 'false' })).toEqual([
      'isActive must be a boolean value',
    ]);
  });
});
