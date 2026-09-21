import * as Y from 'yjs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisSyncService } from '../src/realtime/redis-sync.service.js';
import { YjsDocumentManager } from '../src/realtime/yjs-document-manager.service.js';
import { setupTestContainers, type TestContainerEnvironment } from './test-utils/testcontainers-setup.js';

let containers: TestContainerEnvironment;
let prisma: PrismaService;

beforeAll(async () => {
  containers = await setupTestContainers();
  process.env.DATABASE_URL = containers.databaseUrl;
  process.env.REDIS_URL = containers.redisUrl;
  prisma = new PrismaService();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await containers.teardown();
});

describe('Redis cross-instance synchronization', () => {
  it('delivers a local Yjs update to the other instance once without a republish loop', async () => {
    const managerA = new YjsDocumentManager(prisma);
    const managerB = new YjsDocumentManager(prisma);
    const redisA = new RedisSyncService();
    const redisB = new RedisSyncService();
    const documentId = `redis-${Date.now()}`;
    const docA = await managerA.getOrCreate(documentId);
    const docB = await managerB.getOrCreate(documentId);
    const receivedUpdates: Uint8Array[] = [];
    let resolveReceived!: () => void;
    const received = new Promise<void>((resolve) => {
      resolveReceived = resolve;
    });
    await redisB.subscribeDocument(documentId, {
      onUpdate: (update) => {
        receivedUpdates.push(update);
        managerB.applyUpdate(documentId, update, 'redis');
        resolveReceived();
      },
    });

    const before = Y.encodeStateVector(docA);
    docA.getText('content').insert(0, 'from-instance-a');
    const update = Y.encodeStateAsUpdate(docA, before);

    await redisA.publishUpdate(documentId, update);
    await received;
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(receivedUpdates).toHaveLength(1);
    expect(docB.getText('content').toString()).toBe('from-instance-a');

    await redisA.close();
    await redisB.close();
  });
});
