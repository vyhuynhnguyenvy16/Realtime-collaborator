import { PrismaService } from './prisma/prisma.service.js';
export declare class AppController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getHealth(): Promise<{
        status: string;
        message: string;
        users: {
            id: string;
            email: string;
            passwordHash: string;
            createdAt: Date;
        }[];
    }>;
}
