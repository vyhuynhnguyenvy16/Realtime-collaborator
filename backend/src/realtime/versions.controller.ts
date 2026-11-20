import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DocumentsService } from '../documents/documents.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { YjsDocumentManager } from './yjs-document-manager.service.js';

class CreateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

const uuid = new ParseUUIDPipe({ version: '4' });
const ALL_ROLES = [Role.OWNER, Role.EDITOR, Role.VIEWER];
const WRITERS = [Role.OWNER, Role.EDITOR];
const VERSION_FIELDS = {
  id: true,
  label: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true, name: true } },
} as const;

/** Version history built on document snapshots. */
@Controller('documents/:id/versions')
@UseGuards(JwtAuthGuard)
export class VersionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly yjs: YjsDocumentManager,
    private readonly gateway: RealtimeGateway,
  ) {}

  /** Newest first. Versions without a label were saved automatically. */
  @Get()
  async list(@Param('id', uuid) id: string, @CurrentUser() user: AuthUser) {
    await this.documents.checkAccess(id, user.id, ALL_ROLES);
    return this.prisma.documentSnapshot.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: VERSION_FIELDS,
    });
  }

  @Post()
  async create(
    @Param('id', uuid) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVersionDto,
  ) {
    await this.documents.checkAccess(id, user.id, WRITERS);
    const snapshot = await this.yjs.createSnapshot(id, {
      label: dto.label?.trim() || 'Phiên bản đã lưu',
      userId: user.id,
    });
    return this.prisma.documentSnapshot.findUnique({ where: { id: snapshot.id }, select: VERSION_FIELDS });
  }

  /** The Yjs state of one version, for a read-only preview. */
  @Get(':versionId')
  async get(
    @Param('id', uuid) id: string,
    @Param('versionId', uuid) versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.documents.checkAccess(id, user.id, ALL_ROLES);
    const snapshot = await this.find(id, versionId);
    const { snapshotData, ...rest } = snapshot;
    return { ...rest, state: Array.from(new Uint8Array(snapshotData)) };
  }

  /** Saves the current content as a version, then brings back the chosen one for everyone. */
  @Post(':versionId/restore')
  async restore(
    @Param('id', uuid) id: string,
    @Param('versionId', uuid) versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.documents.checkAccess(id, user.id, WRITERS);
    const snapshot = await this.find(id, versionId);

    await this.yjs.createSnapshot(id, { label: 'Trước khi khôi phục', userId: user.id });
    const update = await this.yjs.restoreSnapshot(id, new Uint8Array(snapshot.snapshotData));
    await this.gateway.broadcastServerUpdate(id, update);
    return { restored: versionId };
  }

  private async find(documentId: string, versionId: string) {
    const snapshot = await this.prisma.documentSnapshot.findFirst({
      where: { id: versionId, documentId },
      select: { ...VERSION_FIELDS, snapshotData: true },
    });
    if (!snapshot) throw new NotFoundException('Phiên bản không tồn tại');
    return snapshot;
  }
}
