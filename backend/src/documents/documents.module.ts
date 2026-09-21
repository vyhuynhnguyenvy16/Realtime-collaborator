import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
	imports: [AuthModule, PrismaModule],
	controllers: [DocumentsController],
	providers: [DocumentsService],
})
export class DocumentsModule {}
