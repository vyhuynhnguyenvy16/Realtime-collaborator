import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DocumentsService } from '../src/documents/documents.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupTestContainers, type TestContainerEnvironment } from './test-utils/testcontainers-setup.js';

let containers: TestContainerEnvironment;
let prisma: PrismaService;
let documentsService: DocumentsService;

beforeAll(async () => {
  containers = await setupTestContainers();
  process.env.DATABASE_URL = containers.databaseUrl;
  prisma = new PrismaService();
  await prisma.$connect();
  documentsService = new DocumentsService(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  await containers.teardown();
});

describe('Document access control', () => {
  it('rejects a user without document access', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `owner-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `outsider-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    const document = await prisma.document.create({
      data: { ownerId: owner.id, title: 'Access test' },
    });

    await expect(
      documentsService.checkAccess(document.id, outsider.id, [Role.OWNER, Role.EDITOR, Role.VIEWER]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks VIEWER from update and remove', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `owner-viewer-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    const viewer = await prisma.user.create({
      data: {
        email: `viewer-${Date.now()}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    const document = await prisma.document.create({
      data: { ownerId: owner.id, title: 'Viewer test' },
    });
    await prisma.documentAccess.create({
      data: { documentId: document.id, userId: viewer.id, role: Role.VIEWER },
    });

    await expect(documentsService.update(document.id, viewer.id, 'forbidden')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(documentsService.remove(document.id, viewer.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
