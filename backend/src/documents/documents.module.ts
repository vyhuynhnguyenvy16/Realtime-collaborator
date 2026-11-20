import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentEventsService } from './document-events.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentEventsService],
  exports: [DocumentsService, DocumentEventsService],
})
export class DocumentsModule {}
