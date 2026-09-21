import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
export class AppController {
  // Tiêm phụ thuộc (Inject) PrismaService qua constructor
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async getHealth() {
    const users = await this.prisma.user.findMany();
    return { 
      status: 'ok', 
      message: 'Database connected successfully!',
      users 
    };
  }
}