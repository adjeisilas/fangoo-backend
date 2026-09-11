import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SanitizedUser } from '../types/auth.types.js';

export const CurrentUser = createParamDecorator(
  (data: keyof SanitizedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as SanitizedUser;
    return data ? user?.[data] : user;
  },
);
