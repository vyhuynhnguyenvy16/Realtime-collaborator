import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RedisSyncService } from './redis-sync.service.js';
import { VersionsController } from './versions.controller.js';
import { YjsDocumentManager } from './yjs-document-manager.service.js';

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [VersionsController],
  providers: [RealtimeGateway, YjsDocumentManager, RedisSyncService],
  exports: [RedisSyncService, YjsDocumentManager],
})
export class RealtimeModule {}
