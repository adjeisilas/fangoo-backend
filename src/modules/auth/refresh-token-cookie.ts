import type { Response } from 'express';

/**
 * Sets the httpOnly refresh-token cookie. Shared by every endpoint that starts a
 * session, so they cannot drift apart on the cookie's security settings.
 */
export function writeRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}
