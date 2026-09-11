import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Post,
  Get,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

class ValidationTestDto {
  @IsString()
  title!: string;
}

@Controller('test-validation')
class ValidationTestController {
  @Post()
  testEndpoint(@Body() dto: ValidationTestDto) {
    return dto;
  }

  @Get('not-found')
  testNotFound() {
    throw new NotFoundException('Requested resource was not found');
  }
}

describe('Foundation API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationTestController],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: 'http://localhost:3000',
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Endpoint', () => {
    it('GET /api/v1/health returns standardized success response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Request successful',
        data: {
          status: 'ok',
          database: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('Exception Filter & Global Prefix', () => {
    it('GET /api/v1/test-validation/not-found returns standardized 404 error response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-validation/not-found')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
        error: 'Not Found',
        message: 'Requested resource was not found',
        path: '/api/v1/test-validation/not-found',
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('ValidationPipe', () => {
    it('rejects unwhitelisted properties with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-validation')
        .send({
          title: 'Valid Title',
          extraProperty: 'disallowed',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        error: 'Bad Request',
      });
      expect(response.body.message).toContain('property extraProperty should not exist');
    });

    it('accepts valid payload and wraps response with ResponseInterceptor', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-validation')
        .send({
          title: 'Clean Input',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Request successful',
        data: {
          title: 'Clean Input',
        },
      });
    });
  });
});
