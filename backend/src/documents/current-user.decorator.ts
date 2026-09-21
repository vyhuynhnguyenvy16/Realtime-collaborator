import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

type CurrentUser = { id: string; email: string };

type AuthenticatedRequest = Request & { user: CurrentUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
