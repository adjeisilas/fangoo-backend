import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../types/auth.types.js';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          let token: string | null = null;
          if (req.cookies && req.cookies.refresh_token) {
            token = req.cookies.refresh_token;
          } else if (req.body && req.body.refreshToken) {
            token = req.body.refreshToken;
          } else if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer ')
          ) {
            token = req.headers.authorization.substring(7);
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    let refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!refreshToken && req.headers.authorization) {
      refreshToken = req.headers.authorization.replace('Bearer ', '').trim();
    }

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
