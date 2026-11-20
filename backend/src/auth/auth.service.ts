import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';

type TokenUser = { id: string; email: string; tokenVersion: number };

type RefreshPayload = { sub: string; email: string; ver?: number };

const PROFILE = { id: true, email: true, name: true, createdAt: true } as const;

export function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured');
  return secret;
}

function refreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured');
  return secret;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: dto.name?.trim() || null },
      select: { id: true, email: true, tokenVersion: true },
    });

    return this.generateTokens(user);
  }

  async validateUser(email: string, password: string): Promise<TokenUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    return { id: user.id, email: user.email, tokenVersion: user.tokenVersion };
  }

  login(user: TokenUser) {
    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken, { secret: refreshSecret() });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    });
    if (!user || (payload.ver ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Phiên đăng nhập đã kết thúc');
    }

    return { accessToken: this.signAccess(user) };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE });
    if (!user) throw new NotFoundException('User không tồn tại');
    return user;
  }

  updateProfile(userId: string, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: PROFILE,
    });
  }

  private signAccess(user: { id: string; email: string }) {
    return this.jwtService.sign(
      { sub: user.id, email: user.email },
      { secret: accessSecret(), expiresIn: '15m' },
    );
  }

  private generateTokens(user: TokenUser) {
    const refreshToken = this.jwtService.sign(
      { sub: user.id, email: user.email, ver: user.tokenVersion },
      { secret: refreshSecret(), expiresIn: '7d' },
    );
    return { accessToken: this.signAccess(user), refreshToken };
  }
}
