import { IsEmail, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { Role } from '@prisma/client';

export class ShareDocumentDto {
  /** Share by email (preferred) ... */
  @ValidateIf((dto: ShareDocumentDto) => !dto.userId)
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  /** ... or by user id. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsIn([Role.EDITOR, Role.VIEWER], { message: 'Quyền chỉ có thể là EDITOR hoặc VIEWER' })
  role: Role;
}
