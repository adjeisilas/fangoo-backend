import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation.js';

import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { DeliveryAreasModule } from './modules/delivery-areas/delivery-areas.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { FuelTypesModule } from './modules/fuel-types/fuel-types.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { RequestsModule } from './modules/requests/requests.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    // Global, and registered early so every module below can inject it.
    NotificationsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DeliveryAreasModule,
    SuppliersModule,
    FuelTypesModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    RequestsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
