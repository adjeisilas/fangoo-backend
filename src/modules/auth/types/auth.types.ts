import { Role } from '../../../generated/prisma/client.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface SanitizedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: SanitizedUser;
  tokens: AuthTokens;
}
