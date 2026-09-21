import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
type AuthUser = {
    id: string;
    email: string;
};
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    validateUser(email: string, password: string): Promise<AuthUser>;
    login(user: AuthUser): {
        accessToken: string;
        refreshToken: string;
    };
    refresh(refreshToken: string): {
        accessToken: string;
    };
    private generateTokens;
    private getAccessSecret;
    private getRefreshSecret;
}
export {};
