import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { ShareDocumentDto } from './dto/share-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';
import { DocumentsService } from './documents.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(user.id, dto.title);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.documentsService.findAllForUser(user.id);
  }

  @Get(':id')
  findOne(@Param('id', uuid) id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.findOneForUser(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', uuid) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(id, user.id, dto.title);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', uuid) id: string, @CurrentUser() user: AuthUser) {
    await this.documentsService.remove(id, user.id);
  }

  @Post(':id/share')
  share(
    @Param('id', uuid) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ShareDocumentDto,
  ) {
    return this.documentsService.share(id, user.id, dto);
  }

  /** Owner removes someone, or a member leaves a document shared with them. */
  @Delete(':id/access/:userId')
  @HttpCode(204)
  async removeAccess(
    @Param('id', uuid) id: string,
    @Param('userId', uuid) targetUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.documentsService.removeAccess(id, user.id, targetUserId);
  }
}
