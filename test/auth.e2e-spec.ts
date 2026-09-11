import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard.js';
import { Roles } from '../src/modules/auth/decorators/roles.decorator.js';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Controller('test-rbac')
@UseGuards(JwtAuthGuard, RolesGuard)
class RbacTestController {
  @Get('admin-only')
  @Roles(Role.ADMIN)
  adminEndpoint() {
    return { privileged: true };
  }
}

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUserEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let accessToken = '';
  let refreshToken = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RbacTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: 'http://localhost:3000',
      credentials: true,
    });
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
  });

  afterAll(async () => {
    // Clean up test user
    try {
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'test_' } },
      });
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new customer successfully and returns tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testUserEmail,
          password: testPassword,
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+1234567890',
          role: Role.CUSTOMER,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUserEmail);
      expect(response.body.data.user.role).toBe(Role.CUSTOMER);
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;

      // Verify Set-Cookie header contains refresh_token
      // Node types `set-cookie` as `string | string[]`; normalise before asserting.
      const rawCookies = response.headers['set-cookie'];
      expect(rawCookies).toBeDefined();
      const cookies: string[] = Array.isArray(rawCookies)
        ? rawCookies
        : [rawCookies as string];
      expect(cookies.some((c) => c.includes('refresh_token='))).toBe(true);
    });

    it('returns 409 Conflict when registering with duplicate email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testUserEmail,
          password: testPassword,
          firstName: 'Duplicate',
          lastName: 'User',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(409);
      expect(response.body.message).toContain('already exists');
    });

    it('returns 400 Bad Request on invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: testPassword,
          firstName: 'Invalid',
          lastName: 'User',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in successfully and returns tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: testPassword,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.email).toBe(testUserEmail);

      // Update tokens for subsequent tests
      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('returns 401 Unauthorized for incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: 'IncorrectPassword999!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 200 with user profile when bearer token is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(testUserEmail);
      expect(response.body.data.firstName).toBe('Jane');
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('returns 401 Unauthorized when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 200 with rotated tokens using valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      // Update tokens
      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('returns 401 Unauthorized with invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid-token')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('RBAC RolesGuard', () => {
    it('returns 403 Forbidden when CUSTOMER accesses an ADMIN endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-rbac/admin-only')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.statusCode).toBe(403);
      expect(response.body.message).toContain('required role is ADMIN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('logs out and invalidates refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Logged out successfully');

      // Attempting to refresh with previous refresh token should now fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .send({ refreshToken })
        .expect(401);
    });
  });
});
