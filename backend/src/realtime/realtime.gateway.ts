import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import * as Y from 'yjs';
import { WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { DocumentsService } from '../documents/documents.service.js';
import { YjsDocumentManager } from './yjs-document-manager.service.js';
import { RedisSyncService } from './redis-sync.service.js';
import { Role } from '@prisma/client';

@WebSocketGateway({ path: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private yjsManager: YjsDocumentManager,
    private documentsService: DocumentsService,
    private jwtService: JwtService,
    private redisSync: RedisSyncService,
  ) {}

  private clientMeta = new Map<WebSocket, { documentId: string; userId: string; yjsClientId?: number }>();
  private rooms = new Map<string, Set<WebSocket>>();

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    try {
      if (!request.url) {
        client.close(1008, 'Missing socket URL');
        return;
      }

      // Lấy JWT từ query string: ws://localhost:3000/realtime?token=...
      const url = new URL(request.url, 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) throw new Error('Missing token');

      // Xác thực token và lưu userId vào object client
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
      (client as any).userId = payload.sub;
    } catch {
      client.close(1008, 'Unauthorized'); // Đóng kết nối lập tức nếu token sai
    }
  }

  handleDisconnect(client: WebSocket) {
    const meta = this.clientMeta.get(client);
    if (meta) {
      const { documentId, yjsClientId } = meta;
      const room = this.rooms.get(documentId);

      if (yjsClientId !== undefined && room) {
        const removalUpdate = this.yjsManager.removeClientAwareness(documentId, yjsClientId);

        const broadcastMessage = JSON.stringify({
          event: 'awareness',
          data: { documentId, update: Array.from(removalUpdate) },
        });

        for (const c of room) {
          if (c !== client && c.readyState === WebSocket.OPEN) {
            c.send(broadcastMessage);
          }
        }

        void this.redisSync.publishUpdate(documentId, removalUpdate, 'awareness');
      }

      if (room) {
        room.delete(client);
        if (room.size === 0) {
          this.rooms.delete(documentId);
          void this.redisSync.unsubscribeDocument(documentId);
        }
      }
      this.clientMeta.delete(client);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: { documentId: string; yjsClientId?: number },
  ) {
    const userId = (client as any).userId;
    const { documentId, yjsClientId } = payload;

    try {
      await this.documentsService.checkAccess(documentId, userId, [Role.OWNER, Role.EDITOR, Role.VIEWER]);

      this.clientMeta.set(client, { documentId, userId, yjsClientId });

      const room = this.rooms.get(documentId) ?? new Set<WebSocket>();
      const isFirstClient = room.size === 0;
      room.add(client);
      this.rooms.set(documentId, room);

      if (isFirstClient) {
        await this.redisSync.subscribeDocument(documentId, {
          onUpdate: (update) => {
            this.yjsManager.applyUpdate(documentId, update, 'redis');
            const broadcast = JSON.stringify({
              event: 'update',
              data: { documentId, update: Array.from(update) },
            });

            for (const c of room) {
              if (c.readyState === WebSocket.OPEN) {
                c.send(broadcast);
              }
            }
          },
          onAwareness: (update) => {
            this.yjsManager.applyAwarenessUpdate(documentId, update, 'redis');
            const broadcast = JSON.stringify({
              event: 'awareness',
              data: { documentId, update: Array.from(update) },
            });

            for (const c of room) {
              if (c.readyState === WebSocket.OPEN) {
                c.send(broadcast);
              }
            }
          },
        });
      }

      const doc = await this.yjsManager.getOrCreate(documentId);
      const state = Y.encodeStateAsUpdate(doc);
      client.send(JSON.stringify({
        event: 'sync',
        data: { documentId, state: Array.from(state) },
      }));

      const awarenessState = this.yjsManager.encodeFullAwarenessState(documentId);
      if (awarenessState.byteLength > 0) {
        client.send(JSON.stringify({
          event: 'awareness',
          data: { documentId, update: Array.from(awarenessState) },
        }));
      }
    } catch {
      client.send(JSON.stringify({ event: 'error', data: { message: 'Forbidden' } }));
      client.close(1008, 'Forbidden');
    }
  }

  @SubscribeMessage('update')
  handleUpdate(@ConnectedSocket() client: WebSocket, @MessageBody() payload: { documentId: string; update: number[] }) {
    const meta = this.clientMeta.get(client);
    if (!meta || meta.documentId !== payload.documentId) return;

    const updateArray = new Uint8Array(payload.update);
    this.yjsManager.applyUpdate(payload.documentId, updateArray, 'local');
    void this.yjsManager.persistUpdate(payload.documentId, updateArray).catch((error) => {
      console.error('Persist update failed:', error);
    });

    void this.redisSync.publishUpdate(payload.documentId, updateArray, 'update');

    const room = this.rooms.get(payload.documentId);
    if (room) {
      const broadcastMessage = JSON.stringify({
        event: 'update',
        data: { documentId: payload.documentId, update: payload.update },
      });

      for (const c of room) {
        if (c !== client && c.readyState === WebSocket.OPEN) {
          c.send(broadcastMessage);
        }
      }
    }
  }

  @SubscribeMessage('awareness')
  handleAwareness(@ConnectedSocket() client: WebSocket, @MessageBody() payload: { documentId: string; update: number[] }) {
    const meta = this.clientMeta.get(client);
    if (!meta || meta.documentId !== payload.documentId) return;

    const updateArray = new Uint8Array(payload.update);
    this.yjsManager.applyAwarenessUpdate(payload.documentId, updateArray, client);
    void this.redisSync.publishUpdate(payload.documentId, updateArray, 'awareness');

    const room = this.rooms.get(payload.documentId);
    if (room) {
      const broadcastMessage = JSON.stringify({
        event: 'awareness',
        data: { documentId: payload.documentId, update: payload.update },
      });

      for (const c of room) {
        if (c !== client && c.readyState === WebSocket.OPEN) {
          c.send(broadcastMessage);
        }
      }
    }
  }
}