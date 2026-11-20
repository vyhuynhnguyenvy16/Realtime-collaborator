import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentEventsService } from './document-events.service.js';
import { ShareDocumentDto } from './dto/share-document.dto.js';

const PUBLIC_USER = { select: { id: true, email: true, name: true } } as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DocumentEventsService,
  ) {}

  async create(ownerId: string, title: string) {
    const document = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.document.create({ data: { ownerId, title: title.trim() } });
      await tx.documentAccess.create({
        data: { documentId: created.id, userId: ownerId, role: Role.OWNER },
      });
      return created;
    });
    return { ...document, role: Role.OWNER };
  }

  /** Every document I can open, with my role and who owns it. */
  async findAllForUser(userId: string) {
    const accesses = await this.prisma.documentAccess.findMany({
      where: { userId },
      include: { document: { include: { owner: PUBLIC_USER } } },
      orderBy: { document: { updatedAt: 'desc' } },
    });
    return accesses.map(({ document, role }) => ({ ...document, role }));
  }

  async findOneForUser(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        owner: PUBLIC_USER,
        accesses: { include: { user: PUBLIC_USER }, orderBy: { role: 'asc' } },
      },
    });
    if (!document) {
      throw new NotFoundException('Document không tồn tại');
    }

    const mine = document.accesses.find((access) => access.userId === userId);
    if (!mine) {
      throw new ForbiddenException('Bạn không có quyền truy cập document này');
    }

    return { ...document, role: mine.role };
  }

  /** Throws 404 when the document does not exist, 403 when the role is not enough. */
  async checkAccess(documentId: string, userId: string, allowedRoles: Role[]) {
    const access = await this.prisma.documentAccess.findUnique({
      where: { documentId_userId: { documentId, userId } },
    });

    if (!access) {
      const exists = await this.prisma.document.count({ where: { id: documentId } });
      if (!exists) throw new NotFoundException('Document không tồn tại');
      throw new ForbiddenException('Bạn không có quyền truy cập document này');
    }
    if (!allowedRoles.includes(access.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    return access;
  }

  async update(documentId: string, userId: string, title: string) {
    await this.checkAccess(documentId, userId, [Role.OWNER, Role.EDITOR]);

    const document = await this.prisma.document.update({
      where: { id: documentId },
      data: { title: title.trim() },
    });
    this.events.emit({ type: 'renamed', documentId, title: document.title });
    return document;
  }

  async remove(documentId: string, userId: string) {
    await this.checkAccess(documentId, userId, [Role.OWNER]);
    await this.prisma.document.delete({ where: { id: documentId } });
    this.events.emit({ type: 'deleted', documentId });
  }

  async share(documentId: string, userId: string, dto: ShareDocumentDto) {
    await this.checkAccess(documentId, userId, [Role.OWNER]);

    const target = await this.prisma.user.findUnique({
      where: dto.userId ? { id: dto.userId } : { email: dto.email!.trim().toLowerCase() },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException(
        'Không tìm thấy tài khoản này. Người được mời cần đăng ký trước.',
      );
    }
    if (target.id === userId) {
      throw new BadRequestException('Không thể share document cho chính mình');
    }

    const existing = await this.prisma.documentAccess.findUnique({
      where: { documentId_userId: { documentId, userId: target.id } },
    });
    if (existing?.role === Role.OWNER) {
      throw new BadRequestException('Không thể đổi quyền của chủ sở hữu');
    }

    const access = await this.prisma.documentAccess.upsert({
      where: { documentId_userId: { documentId, userId: target.id } },
      create: { documentId, userId: target.id, role: dto.role },
      update: { role: dto.role },
      include: { user: PUBLIC_USER },
    });
    if (existing && existing.role !== dto.role) {
      this.events.emit({ type: 'role-changed', documentId, userId: target.id, role: dto.role });
    }
    return access;
  }

  async removeAccess(documentId: string, userId: string, targetUserId: string) {
    const leaving = userId === targetUserId;
    const actor = await this.checkAccess(
      documentId,
      userId,
      leaving ? [Role.OWNER, Role.EDITOR, Role.VIEWER] : [Role.OWNER],
    );
    if (leaving && actor.role === Role.OWNER) {
      throw new BadRequestException('Chủ sở hữu không thể rời document của mình');
    }

    const target = await this.prisma.documentAccess.findUnique({
      where: { documentId_userId: { documentId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Người này không có quyền truy cập');
    if (target.role === Role.OWNER) {
      throw new BadRequestException('Không thể gỡ quyền của chủ sở hữu');
    }

    await this.prisma.documentAccess.delete({ where: { id: target.id } });
    this.events.emit({ type: 'access-revoked', documentId, userId: targetUserId });
  }
}
