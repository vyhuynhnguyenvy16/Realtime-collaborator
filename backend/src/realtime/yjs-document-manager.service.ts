import { Injectable } from '@nestjs/common';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate as applyYjsAwareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class YjsDocumentManager {
  private static readonly SNAPSHOT_EVERY_EVENTS = 50;

  private docs = new Map<string, Y.Doc>();
  private awarenessMap = new Map<string, Awareness>();

  constructor(private readonly prisma: PrismaService) {}

  private getOrCreateSync(documentId: string): Y.Doc {
    let doc = this.docs.get(documentId);
    if (!doc) {
      doc = new Y.Doc();
      this.docs.set(documentId, doc);
    }
    return doc;
  }

  async getOrCreate(documentId: string): Promise<Y.Doc> {
    const existing = this.docs.get(documentId);
    if (existing) {
      return existing;
    }

    const loaded = await this.loadDocument(documentId);
    this.docs.set(documentId, loaded);
    return loaded;
  }

  async loadDocument(documentId: string): Promise<Y.Doc> {
    const cached = this.docs.get(documentId);
    if (cached) {
      return cached;
    }

    const doc = new Y.Doc();
    const snapshot = await this.prisma.documentSnapshot.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });

    if (snapshot) {
      Y.applyUpdate(doc, new Uint8Array(snapshot.snapshotData));
    }

    const events = await this.prisma.documentEvent.findMany({
      where: { documentId },
      orderBy: { id: 'asc' },
    });

    const eventsToReplay = snapshot ? events.slice(snapshot.version) : events;
    for (const event of eventsToReplay) {
      Y.applyUpdate(doc, new Uint8Array(event.updateData));
    }

    this.docs.set(documentId, doc);
    return doc;
  }

  async persistUpdate(documentId: string, update: Uint8Array) {
    await this.prisma.documentEvent.create({
      data: {
        documentId,
        updateData: Buffer.from(update),
      },
    });

    const totalEvents = await this.prisma.documentEvent.count({
      where: { documentId },
    });

    if (totalEvents % YjsDocumentManager.SNAPSHOT_EVERY_EVENTS === 0) {
      await this.createSnapshot(documentId);
    }
  }

  async createSnapshot(documentId: string) {
    const doc = await this.getOrCreate(documentId);
    const snapshotData = Y.encodeStateAsUpdate(doc);

    const latestSnapshot = await this.prisma.documentSnapshot.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });

    const version = (latestSnapshot?.version ?? 0) + 1;
    const totalEvents = await this.prisma.documentEvent.count({ where: { documentId } });

    await this.prisma.documentSnapshot.create({
      data: {
        documentId,
        snapshotData: Buffer.from(snapshotData),
        version: Math.max(version, totalEvents),
      },
    });
  }

  getOrCreateAwareness(documentId: string): Awareness {
    let awareness = this.awarenessMap.get(documentId);
    if (!awareness) {
      const doc = this.getOrCreateSync(documentId);
      awareness = new Awareness(doc);
      this.awarenessMap.set(documentId, awareness);
    }
    return awareness;
  }

  applyUpdate(documentId: string, update: Uint8Array, origin?: string) {
    const doc = this.getOrCreateSync(documentId);
    Y.applyUpdate(doc, update, origin);
  }

  encodeState(documentId: string): Uint8Array {
    const doc = this.getOrCreateSync(documentId);
    return Y.encodeStateAsUpdate(doc);
  }

  applyAwarenessUpdate(documentId: string, update: Uint8Array, origin: unknown) {
    const awareness = this.getOrCreateAwareness(documentId);
    applyYjsAwareness(awareness, update, origin);
  }

  encodeFullAwarenessState(documentId: string): Uint8Array {
    const awareness = this.getOrCreateAwareness(documentId);
    const clients = Array.from(awareness.getStates().keys());

    if (clients.length === 0) {
      return new Uint8Array();
    }

    return encodeAwarenessUpdate(awareness, clients);
  }

  removeClientAwareness(documentId: string, clientId: number): Uint8Array {
    const awareness = this.getOrCreateAwareness(documentId);
    removeAwarenessStates(awareness, [clientId], 'server-disconnect');

    return encodeAwarenessUpdate(awareness, [clientId]);
  }
}
