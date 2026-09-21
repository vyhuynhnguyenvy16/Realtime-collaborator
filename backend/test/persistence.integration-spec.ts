import * as Y from 'yjs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { YjsDocumentManager } from '../src/realtime/yjs-document-manager.service.js';
import { setupTestContainers, type TestContainerEnvironment } from './test-utils/testcontainers-setup.js';

let containers: TestContainerEnvironment;
let prisma: PrismaService;

beforeAll(async () => {
  containers = await setupTestContainers();
  process.env.DATABASE_URL = containers.databaseUrl;
  prisma = new PrismaService();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await containers.teardown();
});

describe('Yjs persistence and replay', () => {
  it('reconstructs the same state from a snapshot and subsequent events', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `persistence-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    const document = await prisma.document.create({
      data: { ownerId: owner.id, title: 'Persistence test' },
    });

    const manager = new YjsDocumentManager(prisma);
    const doc = await manager.getOrCreate(document.id);
    const text = doc.getText('content');

    const updates: Uint8Array[] = [];
    for (const value of ['alpha', ' beta', ' gamma', ' delta', ' epsilon']) {
      const before = Y.encodeStateVector(doc);
      text.insert(text.length, value);
      const update = Y.encodeStateAsUpdate(doc, before);
      updates.push(update);
      await manager.persistUpdate(document.id, update);

      if (updates.length === 3) {
        await manager.createSnapshot(document.id);
      }
    }

    const expectedState = Y.encodeStateAsUpdate(doc);
    const expectedText = text.toString();

    (manager as unknown as { docs: Map<string, Y.Doc> }).docs.delete(document.id);
    const restored = await manager.loadDocument(document.id);

    expect(Y.encodeStateAsUpdate(restored)).toEqual(expectedState);
    expect(restored.getText('content').toString()).toBe(expectedText);

    const [eventCount, snapshotCount] = await Promise.all([
      prisma.documentEvent.count({ where: { documentId: document.id } }),
      prisma.documentSnapshot.count({ where: { documentId: document.id } }),
    ]);
    expect(eventCount).toBe(5);
    expect(snapshotCount).toBe(1);
  });
});
