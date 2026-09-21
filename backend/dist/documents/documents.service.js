var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '@prisma/client';
let DocumentsService = class DocumentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(ownerId, title) {
        return this.prisma.$transaction(async (transaction) => {
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
    findAllForUser(userId) {
        return this.prisma.document.findMany({
            where: { accesses: { some: { userId } } },
            orderBy: { updatedAt: 'desc' },
        });
    }
    async findOneForUser(documentId, userId) {
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
    async checkAccess(documentId, userId, allowedRoles) {
        const access = await this.prisma.documentAccess.findUnique({
            where: { documentId_userId: { documentId, userId } },
        });
        if (!access || !allowedRoles.includes(access.role)) {
            throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
        }
        return access;
    }
    async update(documentId, userId, title) {
        await this.checkAccess(documentId, userId, [Role.OWNER, Role.EDITOR]);
        return this.prisma.document.update({
            where: { id: documentId },
            data: { title },
        });
    }
    async remove(documentId, userId) {
        await this.checkAccess(documentId, userId, [Role.OWNER]);
        return this.prisma.document.delete({ where: { id: documentId } });
    }
    async share(documentId, userId, targetUserId, role) {
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
};
DocumentsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService])
], DocumentsService);
export { DocumentsService };
//# sourceMappingURL=documents.service.js.map