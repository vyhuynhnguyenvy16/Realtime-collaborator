import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Role } from '@prisma/client';
export declare class DocumentsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(ownerId: string, title: string): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    findAllForUser(userId: string): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }[]>;
    findOneForUser(documentId: string, userId: string): Promise<{
        accesses: {
            id: string;
            userId: string;
            role: import("@prisma/client").$Enums.Role;
            documentId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    checkAccess(documentId: string, userId: string, allowedRoles: Role[]): Promise<{
        id: string;
        userId: string;
        role: import("@prisma/client").$Enums.Role;
        documentId: string;
    }>;
    update(documentId: string, userId: string, title: string): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    remove(documentId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    share(documentId: string, userId: string, targetUserId: string, role: Role): Promise<{
        id: string;
        userId: string;
        role: import("@prisma/client").$Enums.Role;
        documentId: string;
    }>;
}
