import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { IncomingMessage } from 'http';
import { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { accessSecret } from '../auth/auth.service.js';
import { DocumentChange, DocumentEventsService } from '../documents/document-events.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { RedisSyncService } from './redis-sync.service.js';
import { YjsDocumentManager } from './yjs-document-manager.service.js';

type ClientMeta = { documentId: string; userId: string; role: Role; yjsClientId?: number };
type AuthedSocket = WebSocket & { userId?: string; isAlive?: boolean };
type UpdatePayload = { documentId: string; update: number[]; id?: number };

const MAX_UPDATE_BYTES = 2 * 1024 * 1024;
const HEARTBEAT_MS = 30_000;

/**
 * Frames are JSON `{ event, data }` (NestJS WsAdapter).
 * Client → server: join, update, awareness.
 * Server → client: sync, update, awareness, ack, role, meta, error.
 * Close code 1008 with reason "Unauthorized" or "Forbidden".
 */
@WebSocketGateway({ path: '/realtime' })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private clientMeta = new Map<WebSocket, ClientMeta>();
  private rooms = new Map<string, Set<WebSocket>>();
  private subscription?: Subscription;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private yjsManager: YjsDocumentManager,
    private documentsService: DocumentsService,
    private documentEvents: DocumentEventsService,
    private jwtService: JwtService,
    private redisSync: RedisSyncService,
  ) {}

  onModuleInit() {
    this.subscription = this.documentEvents.changes.subscribe((change) => this.onDocumentChange(change));
    // Railway and most proxies drop idle sockets; ping keeps them open and finds dead ones.
    this.heartbeat = setInterval(() => {
      for (const client of this.clientMeta.keys() as Iterable<AuthedSocket>) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, HEARTBEAT_MS);
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  handleConnection(client: AuthedSocket, request: IncomingMessage) {
    try {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) throw new Error('Missing token');

      const payload = this.jwtService.verify<{ sub: string }>(token, { secret: accessSecret() });
      client.userId = payload.sub;
      client.isAlive = true;
      client.on('pong', () => {
        client.isAlive = true;
      });
    } catch {
      client.close(1008, 'Unauthorized');
    }
  }

  handleDisconnect(client: WebSocket) {
    const meta = this.clientMeta.get(client);
    if (!meta) return;
    this.clientMeta.delete(client);

    const { documentId, yjsClientId } = meta;
    const room = this.rooms.get(documentId);

    if (yjsClientId !== undefined && room) {
      const removal = this.yjsManager.removeClientAwareness(documentId, yjsClientId);
      if (removal) {
        this.broadcast(documentId, 'awareness', { documentId, update: Array.from(removal) }, client);
        void this.redisSync.publishUpdate(documentId, removal, 'awareness');
      }
    }

    if (room) {
      room.delete(client);
      if (room.size === 0) {
        this.rooms.delete(documentId);
        void this.redisSync.unsubscribeDocument(documentId);
        void this.yjsManager.compactAndEvict(documentId, () => this.rooms.has(documentId));
      }
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { documentId: string; yjsClientId?: number },
  ) {
    const userId = client.userId;
    const documentId = payload?.documentId;
    if (!userId || typeof documentId !== 'string') {
      client.close(1008, 'Unauthorized');
      return;
    }

    let role: Role;
    try {
      const access = await this.documentsService.checkAccess(documentId, userId, [
        Role.OWNER,
        Role.EDITOR,
        Role.VIEWER,
      ]);
      role = access.role;
    } catch {
      this.send(client, 'error', { message: 'Forbidden' });
      client.close(1008, 'Forbidden');
      return;
    }

    // Load first, so no update can land on an empty in-memory document.
    const doc = await this.yjsManager.getOrCreate(documentId);
    if (client.readyState !== WebSocket.OPEN) return;

    const yjsClientId = typeof payload.yjsClientId === 'number' ? payload.yjsClientId : undefined;
    this.clientMeta.set(client, { documentId, userId, role, yjsClientId });

    const room = this.rooms.get(documentId) ?? new Set<WebSocket>();
    const isFirstClient = room.size === 0;
    room.add(client);
    this.rooms.set(documentId, room);

    if (isFirstClient) {
      await this.redisSync.subscribeDocument(documentId, {
        onUpdate: (update) => {
          this.yjsManager.applyUpdate(documentId, update, 'redis');
          this.broadcast(documentId, 'update', { documentId, update: Array.from(update) });
        },
        onAwareness: (update) => {
          this.yjsManager.applyAwarenessUpdate(documentId, update, 'redis');
          this.broadcast(documentId, 'awareness', { documentId, update: Array.from(update) });
        },
      });
    }

    this.send(client, 'sync', {
      documentId,
      role,
      state: Array.from(Y.encodeStateAsUpdate(doc)),
    });

    const awarenessState = this.yjsManager.encodeFullAwarenessState(documentId);
    if (awarenessState.byteLength > 0) {
      this.send(client, 'awareness', { documentId, update: Array.from(awarenessState) });
    }
  }

  @SubscribeMessage('update')
  async handleUpdate(@ConnectedSocket() client: WebSocket, @MessageBody() payload: UpdatePayload) {
    const meta = this.clientMeta.get(client);
    if (!meta || meta.documentId !== payload?.documentId || !Array.isArray(payload.update)) return;

    if (meta.role === Role.VIEWER) {
      this.send(client, 'error', { message: 'ReadOnly', id: payload.id });
      return;
    }
    if (payload.update.length > MAX_UPDATE_BYTES) {
      this.send(client, 'error', { message: 'TooLarge', id: payload.id });
      return;
    }

    const update = new Uint8Array(payload.update);
    try {
      this.yjsManager.applyUpdate(meta.documentId, update, 'local');
    } catch {
      this.send(client, 'error', { message: 'BadUpdate', id: payload.id });
      return;
    }

    this.broadcast(meta.documentId, 'update', { documentId: meta.documentId, update: payload.update }, client);
    void this.redisSync.publishUpdate(meta.documentId, update, 'update');

    try {
      await this.yjsManager.persistUpdate(meta.documentId, update);
      // Tells the sender its change is stored, so the UI can show "Đã lưu".
      if (payload.id !== undefined) this.send(client, 'ack', { documentId: meta.documentId, id: payload.id });
    } catch (error) {
      this.logger.error(`Persist update failed: ${String(error)}`);
      this.send(client, 'error', { message: 'PersistFailed', id: payload.id });
    }
  }

  @SubscribeMessage('awareness')
  handleAwareness(@ConnectedSocket() client: WebSocket, @MessageBody() payload: UpdatePayload) {
    const meta = this.clientMeta.get(client);
    if (!meta || meta.documentId !== payload?.documentId || !Array.isArray(payload.update)) return;

    const update = new Uint8Array(payload.update);
    try {
      this.yjsManager.applyAwarenessUpdate(meta.documentId, update, client);
    } catch {
      return;
    }
    void this.redisSync.publishUpdate(meta.documentId, update, 'awareness');
    this.broadcast(meta.documentId, 'awareness', { documentId: meta.documentId, update: payload.update }, client);
  }

  /** Sends an update made on the server (e.g. a restored version) to everyone. */
  async broadcastServerUpdate(documentId: string, update: Uint8Array) {
    this.broadcast(documentId, 'update', { documentId, update: Array.from(update) });
    void this.redisSync.publishUpdate(documentId, update, 'update');
    await this.yjsManager.persistUpdate(documentId, update);
    if (!this.rooms.has(documentId)) {
      void this.yjsManager.compactAndEvict(documentId, () => this.rooms.has(documentId));
    }
  }

  private onDocumentChange(change: DocumentChange) {
    const room = this.rooms.get(change.documentId);

    switch (change.type) {
      case 'renamed':
        this.broadcast(change.documentId, 'meta', { documentId: change.documentId, title: change.title });
        return;
      case 'role-changed':
        for (const client of room ?? []) {
          const meta = this.clientMeta.get(client);
          if (meta?.userId === change.userId) {
            meta.role = change.role as Role;
            this.send(client, 'role', { documentId: change.documentId, role: change.role });
          }
        }
        return;
      case 'access-revoked':
        for (const client of [...(room ?? [])]) {
          if (this.clientMeta.get(client)?.userId === change.userId) client.close(1008, 'Forbidden');
        }
        return;
      case 'deleted':
        for (const client of [...(room ?? [])]) client.close(1008, 'Forbidden');
        this.yjsManager.evict(change.documentId);
        return;
    }
  }

  private send(client: WebSocket, event: string, data: unknown) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ event, data }));
  }

  private broadcast(documentId: string, event: string, data: unknown, except?: WebSocket) {
    const room = this.rooms.get(documentId);
    if (!room) return;
    const message = JSON.stringify({ event, data });
    for (const client of room) {
      if (client !== except && client.readyState === WebSocket.OPEN) client.send(message);
    }
  }
}
