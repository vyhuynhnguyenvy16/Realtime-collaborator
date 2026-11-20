import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AuthModule } from './auth/auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [PrismaModule, AuthModule, DocumentsModule, RealtimeModule],
  controllers: [HealthController],
})
export class AppModule {}
