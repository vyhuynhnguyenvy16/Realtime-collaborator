import { CreateDocumentDto } from './dto/create-document.dto.js';
import { ShareDocumentDto } from './dto/share-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';
import { DocumentsService } from './documents.service.js';
type AuthUser = {
    id: string;
    email: string;
};
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    create(user: AuthUser, dto: CreateDocumentDto): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    findAll(user: AuthUser): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }[]>;
    findOne(id: string, user: AuthUser): Promise<{
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
    update(id: string, user: AuthUser, dto: UpdateDocumentDto): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    remove(id: string, user: AuthUser): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    share(id: string, user: AuthUser, dto: ShareDocumentDto): Promise<{
        id: string;
        userId: string;
        role: import("@prisma/client").$Enums.Role;
        documentId: string;
    }>;
}
export {};
