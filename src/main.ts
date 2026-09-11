import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  // rawBody is required to verify Paystack webhook signatures against the exact bytes sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  const configService = app.get(ConfigService);

  // Explicit allow-list, never a wildcard — these responses carry credentials.
  const corsOrigins = (
    configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()',
    );

    // Production only: sending HSTS over plain HTTP in development would pin the
    // browser to https://localhost and make the dev server unreachable.
    if (isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    res.removeHeader('X-Powered-By');
    next();
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

  /**
   * Without this, a container runtime's SIGTERM kills the process outright and
   * `PrismaService.onModuleDestroy` never runs — the connection pool is dropped
   * mid-flight instead of drained. Nest only wires signal handlers when asked.
   */
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 4000);

  // Bind explicitly: a container that only listens on the loopback interface is
  // unreachable from outside itself, and the failure looks like a crash-loop.
  await app.listen(port, '0.0.0.0');
}

bootstrap();
