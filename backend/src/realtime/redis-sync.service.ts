import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisSyncService {
  private readonly logger = new Logger(RedisSyncService.name);
  private readonly pubClient: Redis;
  private readonly subClient: Redis;
  private readonly subHandlers = new Map<string, { onUpdate?: (update: Uint8Array) => void; onAwareness?: (update: Uint8Array) => void }>();
  private readonly subscribedDocuments = new Set<string>();

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

    this.pubClient = new Redis(redisUrl);
    this.subClient = new Redis(redisUrl);

    this.subClient.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      const documentId = this.extractDocumentIdFromChannel(channel.toString());
      if (!documentId) return;

      const handlers = this.subHandlers.get(documentId);
      if (!handlers) return;

      const update = new Uint8Array(message);
      const channelName = channel.toString();
      if (channelName.endsWith(':update')) {
        handlers.onUpdate?.(update);
      }

      if (channelName.endsWith(':awareness')) {
        handlers.onAwareness?.(update);
      }
    });
  }

  private extractDocumentIdFromChannel(channel: string): string | null {
    const match = channel.match(/^doc:(.+):(update|awareness)$/);
    return match ? match[1] : null;
  }

  private getUpdateChannel(documentId: string) {
    return `doc:${documentId}:update`;
  }

  private getAwarenessChannel(documentId: string) {
    return `doc:${documentId}:awareness`;
  }

  async subscribeDocument(
    documentId: string,
    handlers: { onUpdate?: (update: Uint8Array) => void; onAwareness?: (update: Uint8Array) => void },
  ) {
    const existing = this.subHandlers.get(documentId) ?? {};
    const merged = {
      onUpdate: handlers.onUpdate ?? existing.onUpdate,
      onAwareness: handlers.onAwareness ?? existing.onAwareness,
    };

    this.subHandlers.set(documentId, merged);

    if (this.subscribedDocuments.has(documentId)) {
      return;
    }

    try {
      await this.subClient.subscribe(this.getUpdateChannel(documentId), this.getAwarenessChannel(documentId));
      this.subscribedDocuments.add(documentId);
    } catch (error) {
      this.logger.error(`Failed to subscribe document ${documentId}: ${String(error)}`);
      this.subHandlers.delete(documentId);
    }
  }

  async unsubscribeDocument(documentId: string) {
    if (!this.subscribedDocuments.has(documentId)) {
      this.subHandlers.delete(documentId);
      return;
    }

    try {
      await this.subClient.unsubscribe(this.getUpdateChannel(documentId), this.getAwarenessChannel(documentId));
      this.subscribedDocuments.delete(documentId);
      this.subHandlers.delete(documentId);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe document ${documentId}: ${String(error)}`);
    }
  }

  async publishUpdate(documentId: string, update: Uint8Array, type: 'update' | 'awareness' = 'update') {
    const channel = type === 'update' ? this.getUpdateChannel(documentId) : this.getAwarenessChannel(documentId);

    try {
      await this.pubClient.publish(channel, Buffer.from(update));
    } catch (error) {
      this.logger.error(`Failed to publish ${type} for ${documentId}: ${String(error)}`);
    }
  }

  async close() {
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
  }
}
