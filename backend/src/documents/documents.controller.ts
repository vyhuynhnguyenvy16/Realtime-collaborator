import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { ShareDocumentDto } from './dto/share-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';
import { DocumentsService } from './documents.service.js';

type AuthUser = { id: string; email: string };

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
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.findOneForUser(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(id, user.id, dto.title);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentsService.remove(id, user.id);
  }

  @Post(':id/share')
  share(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ShareDocumentDto,
  ) {
    return this.documentsService.share(id, user.id, dto.userId, dto.role);
  }
}
