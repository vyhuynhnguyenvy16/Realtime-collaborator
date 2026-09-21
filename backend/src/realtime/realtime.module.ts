import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { YjsDocumentManager } from './yjs-document-manager.service.js';
import { RedisSyncService } from './redis-sync.service.js';
import { JwtModule } from '@nestjs/jwt';
import { DocumentsModule } from '../documents/documents.module.js';

@Module({
  imports: [JwtModule, DocumentsModule],
  providers: [RealtimeGateway, YjsDocumentManager, RedisSyncService],
  exports: [RedisSyncService],
})
export class RealtimeModule {}