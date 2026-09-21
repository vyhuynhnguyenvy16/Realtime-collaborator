import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
type AuthenticatedRequest = Request & {
    user: {
        id: string;
        email: string;
    };
};
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    refresh(refreshToken: string): {
        accessToken: string;
    };
    me(request: AuthenticatedRequest): Express.User & {
        id: string;
        email: string;
    };
}
export {};
