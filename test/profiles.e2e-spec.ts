import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { Role, VerificationStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';

describe('Profiles & Delivery Areas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let customerToken = '';
  let adminToken = '';
  let supplierProfileId = '';
  let testAreaId = '';

  const timestamp = Date.now();
  const customerEmail = `cust_${timestamp}@example.com`;
  const adminEmail = `admin_${timestamp}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    prisma = app.get(PrismaService);

    // Register a customer user
    const custRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'Password123!',
        firstName: 'Alice',
        lastName: 'Customer',
        phone: '+233201111111',
        role: Role.CUSTOMER,
      });
    customerToken = custRes.body.data.accessToken;

    // Register an admin user (via Prisma directly to guarantee ADMIN role)
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: 'dummy-hash',
        firstName: 'Super',
        lastName: 'Admin',
        role: Role.ADMIN,
      },
    });

    const jwtService = app.get(JwtService);
    adminToken = await jwtService.signAsync(
      { sub: adminUser.id, email: adminUser.email, role: adminUser.role },
      {
        secret: 'fangoo_jwt_access_secret_key_prod_2026',
        expiresIn: '15m',
      },
    );
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: { email: { in: [customerEmail, adminEmail] } },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('Delivery Areas', () => {
    it('GET /api/v1/delivery-areas returns seeded delivery areas', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/delivery-areas')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Every area belongs to a region, and only the relation is exposed.
      for (const area of response.body.data) {
        expect(area.region).toEqual({
          id: expect.any(String),
          name: expect.any(String),
          capital: expect.any(String),
        });
        expect(area).not.toHaveProperty('legacyRegion');
      }

      testAreaId = response.body.data[0].id;
    });
  });

  describe('User Profile', () => {
    it('GET /api/v1/users/me returns authenticated customer profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(customerEmail);
      expect(response.body.data.firstName).toBe('Alice');
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('PATCH /api/v1/users/me updates personal info', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          firstName: 'Alicia',
          phone: '+233209999999',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe('Alicia');
      expect(response.body.data.phone).toBe('+233209999999');
    });
  });

  describe('Supplier Profile Creation & Management', () => {
    it('POST /api/v1/suppliers/profile/me creates supplier profile and promotes user to SUPPLIER', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/suppliers/profile/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          companyName: 'Apex Fuel Logistics Ltd',
          businessRegNumber: 'BN-888999',
          address: 'Plot 4 Heavy Industrial Area',
          city: 'Accra',
          contactPhone: '+233208888888',
          contactEmail: 'contact@apexfuel.com',
          description: 'Premium bulk diesel and petrol supplies across Ghana.',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.companyName).toBe('Apex Fuel Logistics Ltd');
      expect(response.body.data.verificationStatus).toBe(VerificationStatus.PENDING);

      supplierProfileId = response.body.data.id;
    });

    it('GET /api/v1/suppliers/profile/me retrieves supplier profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/suppliers/profile/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(supplierProfileId);
      expect(response.body.data.companyName).toBe('Apex Fuel Logistics Ltd');
    });

    it('PATCH /api/v1/suppliers/profile/me updates business details', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/suppliers/profile/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          city: 'Tema',
          isAcceptingOrders: true,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.city).toBe('Tema');
    });

    it('POST /api/v1/suppliers/delivery-areas/me configures supplier delivery coverage', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/suppliers/delivery-areas/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          areas: [
            {
              deliveryAreaId: testAreaId,
              deliveryFee: 50.0,
              estimatedDeliveryHours: 6,
            },
          ],
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deliveryAreas.length).toBe(1);
      expect(response.body.data.deliveryAreas[0].deliveryAreaId).toBe(testAreaId);
    });

    it('GET /api/v1/suppliers/delivery-areas/me returns configured areas', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/suppliers/delivery-areas/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
    });
  });

  describe('Supplier Verification & Public Marketplace', () => {
    it('GET /api/v1/suppliers does not list PENDING suppliers publicly', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .expect(200);

      const found = response.body.data.find(
        (s: any) => s.id === supplierProfileId,
      );
      expect(found).toBeUndefined();
    });

    it('PATCH /api/v1/suppliers/:id/verify forbids non-admin users', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/suppliers/${supplierProfileId}/verify`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: VerificationStatus.VERIFIED })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(403);
    });

    it('PATCH /api/v1/suppliers/:id/verify allows ADMIN to verify supplier', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/suppliers/${supplierProfileId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: VerificationStatus.VERIFIED })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.verificationStatus).toBe(VerificationStatus.VERIFIED);
      expect(response.body.data.verifiedAt).toBeDefined();
    });

    it('GET /api/v1/suppliers now includes the VERIFIED supplier in public marketplace', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .expect(200);

      const found = response.body.data.find(
        (s: any) => s.id === supplierProfileId,
      );
      expect(found).toBeDefined();
      expect(found.companyName).toBe('Apex Fuel Logistics Ltd');
      expect(found.taxId).toBeUndefined(); // Tax ID not exposed publicly
    });

    it('GET /api/v1/suppliers/:id returns public supplier details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/suppliers/${supplierProfileId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.companyName).toBe('Apex Fuel Logistics Ltd');
    });
  });
});
