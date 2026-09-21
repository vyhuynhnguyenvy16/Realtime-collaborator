var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { ShareDocumentDto } from './dto/share-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';
import { DocumentsService } from './documents.service.js';
let DocumentsController = class DocumentsController {
    documentsService;
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    create(user, dto) {
        return this.documentsService.create(user.id, dto.title);
    }
    findAll(user) {
        return this.documentsService.findAllForUser(user.id);
    }
    findOne(id, user) {
        return this.documentsService.findOneForUser(id, user.id);
    }
    update(id, user, dto) {
        return this.documentsService.update(id, user.id, dto.title);
    }
    remove(id, user) {
        return this.documentsService.remove(id, user.id);
    }
    share(id, user, dto) {
        return this.documentsService.share(id, user.id, dto.userId, dto.role);
    }
};
__decorate([
    Post(),
    __param(0, CurrentUser()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateDocumentDto]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "create", null);
__decorate([
    Get(),
    __param(0, CurrentUser()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findAll", null);
__decorate([
    Get(':id'),
    __param(0, Param('id')),
    __param(1, CurrentUser()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findOne", null);
__decorate([
    Patch(':id'),
    __param(0, Param('id')),
    __param(1, CurrentUser()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, UpdateDocumentDto]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "update", null);
__decorate([
    Delete(':id'),
    __param(0, Param('id')),
    __param(1, CurrentUser()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "remove", null);
__decorate([
    Post(':id/share'),
    __param(0, Param('id')),
    __param(1, CurrentUser()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, ShareDocumentDto]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "share", null);
DocumentsController = __decorate([
    Controller('documents'),
    UseGuards(JwtAuthGuard),
    __metadata("design:paramtypes", [DocumentsService])
], DocumentsController);
export { DocumentsController };
//# sourceMappingURL=documents.controller.js.map