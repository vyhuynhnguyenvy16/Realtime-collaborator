import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, title: string) {
    return this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const document = await transaction.document.create({
        data: { ownerId, title },
      });

      await transaction.documentAccess.create({
        data: {
          documentId: document.id,
          userId: ownerId,
          role: Role.OWNER,
        },
      });

      return document;
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.document.findMany({
      where: { accesses: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOneForUser(documentId: string, userId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        accesses: { some: { userId } },
      },
      include: { accesses: true },
    });

    if (!document) {
      throw new ForbiddenException('Bạn không có quyền truy cập document này');
    }

    return document;
  }

  async checkAccess(documentId: string, userId: string, allowedRoles: Role[]) {
    const access = await this.prisma.documentAccess.findUnique({
      where: { documentId_userId: { documentId, userId } },
    });

    if (!access || !allowedRoles.includes(access.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    return access;
  }

  async update(documentId: string, userId: string, title: string) {
    await this.checkAccess(documentId, userId, [Role.OWNER, Role.EDITOR]);

    return this.prisma.document.update({
      where: { id: documentId },
      data: { title },
    });
  }

  async remove(documentId: string, userId: string) {
    await this.checkAccess(documentId, userId, [Role.OWNER]);

    return this.prisma.document.delete({ where: { id: documentId } });
  }

  async share(
    documentId: string,
    userId: string,
    targetUserId: string,
    role: Role,
  ) {
    await this.checkAccess(documentId, userId, [Role.OWNER]);

    if (userId === targetUserId) {
      throw new BadRequestException('Không thể share document cho chính mình');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User không tồn tại');
    }

    return this.prisma.documentAccess.upsert({
      where: { documentId_userId: { documentId, userId: targetUserId } },
      create: { documentId, userId: targetUserId, role },
      update: { role },
    });
  }
}
