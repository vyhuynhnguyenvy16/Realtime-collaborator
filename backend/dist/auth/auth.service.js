var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ConflictException, Injectable, UnauthorizedException, } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
let AuthService = class AuthService {
    prisma;
    jwtService;
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async register(dto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existingUser) {
            throw new ConflictException('Email đã tồn tại');
        }
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                passwordHash,
            },
            select: {
                id: true,
                email: true,
            },
        });
        return this.generateTokens(user);
    }
    async validateUser(email, password) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
        }
        return { id: user.id, email: user.email };
    }
    login(user) {
        return this.generateTokens(user);
    }
    refresh(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.getRefreshSecret(),
            });
            if (!payload.sub || !payload.email) {
                throw new UnauthorizedException('Refresh token không hợp lệ');
            }
            const accessToken = this.jwtService.sign({ sub: payload.sub, email: payload.email }, {
                secret: this.getAccessSecret(),
                expiresIn: '15m',
            });
            return { accessToken };
        }
        catch {
            throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
        }
    }
    generateTokens(user) {
        const payload = { sub: user.id, email: user.email };
        const accessToken = this.jwtService.sign(payload, {
            secret: this.getAccessSecret(),
            expiresIn: '15m',
        });
        const refreshToken = this.jwtService.sign(payload, {
            secret: this.getRefreshSecret(),
            expiresIn: '7d',
        });
        return { accessToken, refreshToken };
    }
    getAccessSecret() {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
            throw new Error('JWT_ACCESS_SECRET is not configured');
        }
        return secret;
    }
    getRefreshSecret() {
        const secret = process.env.JWT_REFRESH_SECRET;
        if (!secret) {
            throw new Error('JWT_REFRESH_SECRET is not configured');
        }
        return secret;
    }
};
AuthService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaService,
        JwtService])
], AuthService);
export { AuthService };
//# sourceMappingURL=auth.service.js.map