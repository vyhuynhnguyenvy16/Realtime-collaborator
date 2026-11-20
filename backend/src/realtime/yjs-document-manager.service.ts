import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate as applyYjsAwareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { PrismaService } from '../prisma/prisma.service.js';

/** Tiptap's Collaboration extension stores the document in this fragment. */
export const EDITOR_FIELD = 'default';

@Injectable()
export class YjsDocumentManager {
  private static readonly SNAPSHOT_EVERY_EVENTS = 50;
  private static readonly TOUCH_EVERY_MS = 30_000;

  private readonly logger = new Logger(YjsDocumentManager.name);
  private docs = new Map<string, Y.Doc>();
  private loading = new Map<string, Promise<Y.Doc>>();
  private awarenessMap = new Map<string, Awareness>();
  private eventsSinceSnapshot = new Map<string, number>();
  private lastTouched = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  private getOrCreateSync(documentId: string): Y.Doc {
    let doc = this.docs.get(documentId);
    if (!doc) {
      doc = new Y.Doc();
      this.docs.set(documentId, doc);
    }
    return doc;
  }

  isLoaded(documentId: string) {
    return this.docs.has(documentId);
  }

  /** Loads a document once, even when several clients join at the same moment. */
  async getOrCreate(documentId: string): Promise<Y.Doc> {
    const existing = this.docs.get(documentId);
    if (existing) return existing;

    let pending = this.loading.get(documentId);
    if (!pending) {
      pending = this.loadDocument(documentId).finally(() => this.loading.delete(documentId));
      this.loading.set(documentId, pending);
    }
    return pending;
  }

  /**
   * Latest snapshot + every event written after it. Snapshot.version holds the highest
   * event id the snapshot already contains; replaying a few extra updates is harmless
   * because Yjs updates are idempotent.
   */
  async loadDocument(documentId: string): Promise<Y.Doc> {
    const cached = this.docs.get(documentId);
    if (cached) return cached;

    const doc = new Y.Doc();
    const snapshot = await this.prisma.documentSnapshot.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });
    if (snapshot) {
      Y.applyUpdate(doc, new Uint8Array(snapshot.snapshotData));
    }

    const events = await this.prisma.documentEvent.findMany({
      where: { documentId, ...(snapshot ? { id: { gt: BigInt(snapshot.version) } } : {}) },
      orderBy: { id: 'asc' },
    });
    for (const event of events) {
      Y.applyUpdate(doc, new Uint8Array(event.updateData));
    }

    this.eventsSinceSnapshot.set(documentId, events.length);
    this.docs.set(documentId, doc);
    return doc;
  }

  async persistUpdate(documentId: string, update: Uint8Array) {
    await this.prisma.documentEvent.create({
      data: { documentId, updateData: Buffer.from(update) },
    });

    const count = (this.eventsSinceSnapshot.get(documentId) ?? 0) + 1;
    this.eventsSinceSnapshot.set(documentId, count);
    if (count >= YjsDocumentManager.SNAPSHOT_EVERY_EVENTS) {
      await this.createSnapshot(documentId);
    }

    const now = Date.now();
    if (now - (this.lastTouched.get(documentId) ?? 0) > YjsDocumentManager.TOUCH_EVERY_MS) {
      this.lastTouched.set(documentId, now);
      await this.prisma.document
        .update({ where: { id: documentId }, data: { updatedAt: new Date() } })
        .catch(() => undefined);
    }
  }

  /** Saves the full current state. A label marks a version the user saved on purpose. */
  async createSnapshot(documentId: string, options: { label?: string; userId?: string } = {}) {
    const doc = await this.getOrCreate(documentId);
    const latestEvent = await this.prisma.documentEvent.findFirst({
      where: { documentId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const snapshotData = Y.encodeStateAsUpdate(doc);
    this.eventsSinceSnapshot.set(documentId, 0);

    return this.prisma.documentSnapshot.create({
      data: {
        documentId,
        snapshotData: Buffer.from(snapshotData),
        version: Number(latestEvent?.id ?? 0),
        label: options.label ?? null,
        createdById: options.userId ?? null,
      },
    });
  }

  /** Writes a snapshot if anything changed since the last one, then frees memory. */
  async compactAndEvict(documentId: string, stillNeeded: () => boolean) {
    try {
      if ((this.eventsSinceSnapshot.get(documentId) ?? 0) > 0) {
        await this.createSnapshot(documentId);
      }
    } catch (error) {
      this.logger.warn(`Snapshot on close failed for ${documentId}: ${String(error)}`);
      return;
    }
    if (stillNeeded()) return;
    this.evict(documentId);
  }

  evict(documentId: string) {
    this.docs.get(documentId)?.destroy();
    this.docs.delete(documentId);
    this.awarenessMap.get(documentId)?.destroy();
    this.awarenessMap.delete(documentId);
    this.eventsSinceSnapshot.delete(documentId);
    this.lastTouched.delete(documentId);
  }

  /**
   * Replaces the editor content with a saved version. Returns the Yjs update to
   * broadcast and persist; history stays intact because nothing is rewritten.
   */
  async restoreSnapshot(documentId: string, snapshotData: Uint8Array): Promise<Uint8Array> {
    const doc = await this.getOrCreate(documentId);
    const source = new Y.Doc();
    Y.applyUpdate(source, snapshotData);

    const before = Y.encodeStateVector(doc);
    const target = doc.getXmlFragment(EDITOR_FIELD);
    const nodes = source
      .getXmlFragment(EDITOR_FIELD)
      .toArray()
      .map((node) => node.clone() as Y.XmlElement | Y.XmlText);

    doc.transact(() => {
      if (target.length > 0) target.delete(0, target.length);
      if (nodes.length > 0) target.insert(0, nodes);
    }, 'restore');
    source.destroy();

    return Y.encodeStateAsUpdate(doc, before);
  }

  getOrCreateAwareness(documentId: string): Awareness {
    let awareness = this.awarenessMap.get(documentId);
    if (!awareness) {
      awareness = new Awareness(this.getOrCreateSync(documentId));
      // The server holds no editor of its own; drop the empty local state.
      awareness.setLocalState(null);
      this.awarenessMap.set(documentId, awareness);
    }
    return awareness;
  }

  applyUpdate(documentId: string, update: Uint8Array, origin?: string) {
    Y.applyUpdate(this.getOrCreateSync(documentId), update, origin);
  }

  encodeState(documentId: string): Uint8Array {
    return Y.encodeStateAsUpdate(this.getOrCreateSync(documentId));
  }

  applyAwarenessUpdate(documentId: string, update: Uint8Array, origin: unknown) {
    applyYjsAwareness(this.getOrCreateAwareness(documentId), update, origin);
  }

  encodeFullAwarenessState(documentId: string): Uint8Array {
    const awareness = this.getOrCreateAwareness(documentId);
    const clients = Array.from(awareness.getStates().keys());
    if (clients.length === 0) return new Uint8Array();
    return encodeAwarenessUpdate(awareness, clients);
  }

  /** Returns null when the client never sent an awareness state. */
  removeClientAwareness(documentId: string, clientId: number): Uint8Array | null {
    const awareness = this.getOrCreateAwareness(documentId);
    if (!awareness.meta.has(clientId)) return null;
    removeAwarenessStates(awareness, [clientId], 'server-disconnect');
    return encodeAwarenessUpdate(awareness, [clientId]);
  }
}
