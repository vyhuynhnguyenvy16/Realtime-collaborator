import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';

type Handlers = {
  onUpdate?: (update: Uint8Array) => void;
  onAwareness?: (update: Uint8Array) => void;
};

/**
 * Fans Yjs updates out to other API instances through Redis pub/sub.
 * Without REDIS_URL the service is a no-op, which is right for a single instance.
 * Each message starts with the sender's instance id so an instance ignores its own echo.
 */
@Injectable()
export class RedisSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisSyncService.name);
  private readonly instanceId = Buffer.from(randomUUID());
  private readonly pubClient?: Redis;
  private readonly subClient?: Redis;
  private readonly subHandlers = new Map<string, Handlers>();
  private readonly subscribedDocuments = new Set<string>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.log('REDIS_URL not set: running as a single instance without Redis fan-out');
      return;
    }

    this.pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    this.subClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    this.pubClient.on('error', (error) => this.logger.warn(`Redis pub: ${error.message}`));
    this.subClient.on('error', (error) => this.logger.warn(`Redis sub: ${error.message}`));

    this.subClient.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      const channelName = channel.toString();
      const documentId = this.extractDocumentIdFromChannel(channelName);
      if (!documentId) return;

      const handlers = this.subHandlers.get(documentId);
      if (!handlers) return;

      const idLength = this.instanceId.length;
      if (message.length < idLength) return;
      if (message.subarray(0, idLength).equals(this.instanceId)) return;

      const update = new Uint8Array(message.subarray(idLength));
      if (channelName.endsWith(':update')) handlers.onUpdate?.(update);
      if (channelName.endsWith(':awareness')) handlers.onAwareness?.(update);
    });
  }

  get enabled() {
    return Boolean(this.pubClient);
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

  async subscribeDocument(documentId: string, handlers: Handlers) {
    if (!this.subClient) return;

    const existing = this.subHandlers.get(documentId) ?? {};
    this.subHandlers.set(documentId, {
      onUpdate: handlers.onUpdate ?? existing.onUpdate,
      onAwareness: handlers.onAwareness ?? existing.onAwareness,
    });

    if (this.subscribedDocuments.has(documentId)) return;

    try {
      await this.subClient.subscribe(
        this.getUpdateChannel(documentId),
        this.getAwarenessChannel(documentId),
      );
      this.subscribedDocuments.add(documentId);
    } catch (error) {
      this.logger.error(`Failed to subscribe document ${documentId}: ${String(error)}`);
      this.subHandlers.delete(documentId);
    }
  }

  async unsubscribeDocument(documentId: string) {
    this.subHandlers.delete(documentId);
    if (!this.subClient || !this.subscribedDocuments.has(documentId)) return;

    try {
      await this.subClient.unsubscribe(
        this.getUpdateChannel(documentId),
        this.getAwarenessChannel(documentId),
      );
      this.subscribedDocuments.delete(documentId);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe document ${documentId}: ${String(error)}`);
    }
  }

  async publishUpdate(
    documentId: string,
    update: Uint8Array,
    type: 'update' | 'awareness' = 'update',
  ) {
    if (!this.pubClient) return;
    const channel =
      type === 'update' ? this.getUpdateChannel(documentId) : this.getAwarenessChannel(documentId);

    try {
      await this.pubClient.publish(channel, Buffer.concat([this.instanceId, Buffer.from(update)]));
    } catch (error) {
      this.logger.error(`Failed to publish ${type} for ${documentId}: ${String(error)}`);
    }
  }

  async close() {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }

  async onModuleDestroy() {
    await this.close().catch(() => undefined);
  }
}
