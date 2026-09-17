import { describe, it, expect } from 'vitest';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateSupplierApplicationDto } from './create-supplier-application.dto.js';

// The same options `main.ts` applies to every request.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateSupplierApplicationDto });

const messagesFor = async (body: unknown): Promise<string[]> => {
  try {
    await validate(body);
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return ([] as string[]).concat(
      ((err as BadRequestException).getResponse() as { message: string | string[] }).message,
    );
  }
};

const valid = () => ({
  account: {
    email: 'owner@depot.com',
    password: 'correct-horse-battery',
    firstName: 'Ama',
    lastName: 'Mensah',
  },
  business: {
    companyName: 'Mensah Fuels',
    address: '4 Harbour Road',
    city: 'Tema',
    contactPhone: '+233300000000',
    contactEmail: 'sales@mensah.com',
  },
  coverage: [{ deliveryAreaId: 'area-tema', deliveryFee: 30 }],
});

describe('CreateSupplierApplicationDto', () => {
  it('accepts a complete application', async () => {
    await expect(validate(valid())).resolves.toBeInstanceOf(CreateSupplierApplicationDto);
  });

  /** An application always creates a supplier; nobody can ask to be an admin. */
  it.each(['ADMIN', 'CUSTOMER', 'SUPPLIER'])('rejects a role of %s sent with the account', async (role) => {
    const body = valid();
    (body.account as Record<string, unknown>).role = role;

    expect(await messagesFor(body)).toContain('account.property role should not exist');
  });

  it('rejects a role sent at the top level', async () => {
    const body = { ...valid(), role: 'ADMIN' };

    expect(await messagesFor(body)).toContain('property role should not exist');
  });

  it('rejects a verification status sent with the business', async () => {
    const body = valid();
    (body.business as Record<string, unknown>).verificationStatus = 'VERIFIED';

    expect(await messagesFor(body)).toContain('business.property verificationStatus should not exist');
  });

  it('requires at least one delivery area', async () => {
    expect(await messagesFor({ ...valid(), coverage: [] })).toContain('Choose at least one delivery area');
  });

  it('requires each part of the application', async () => {
    const { account, business, coverage } = valid();

    expect(await messagesFor({ business, coverage })).toContain('Account details are required');
    expect(await messagesFor({ account, coverage })).toContain('Business details are required');
    expect(await messagesFor({ account, business })).toContain('Delivery coverage is required');
  });

  it('applies the registration password rules', async () => {
    const body = valid();
    body.account.password = 'short';

    expect(await messagesFor(body)).toContain(
      'account.Password must be at least 8 characters long',
    );
  });

  it('validates the business and coverage entries themselves', async () => {
    const body = valid();
    body.business.contactEmail = 'not-an-email';
    body.coverage = [{ deliveryAreaId: 'area-tema', deliveryFee: -5 }];

    const messages = await messagesFor(body);
    expect(messages).toContain('business.Valid contact email is required');
    expect(messages.some((m) => m.startsWith('coverage.0.deliveryFee'))).toBe(true);
  });
});
