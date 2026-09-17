import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthResponse } from '../auth/types/auth.types.js';
import {
  Role,
  VerificationStatus,
  type User,
} from '../../generated/prisma/client.js';
import { toSupplierProfileData } from '../suppliers/supplier-profile-data.js';
import {
  assertDeliveryAreasAvailable,
  assertNoRepeatedDeliveryAreas,
  toCoverageRows,
} from '../suppliers/supplier-coverage.js';
import { CreateSupplierApplicationDto } from './dto/create-supplier-application.dto.js';
import { isUniqueViolation } from '../../common/prisma-errors.js';

const EMAIL_TAKEN = 'A user with this email address already exists';

export interface SupplierApplicationResult {
  supplierProfileId: string;
  verificationStatus: VerificationStatus;
  /**
   * Null when the application was saved but signing in failed afterwards. The
   * account exists, so the applicant can simply sign in.
   */
  session: AuthResponse | null;
}

/**
 * A new supplier's first contact: the account, the depot and its initial
 * coverage are created together, or not at all. The depot starts PENDING and
 * stays that way until an admin verifies it.
 */
@Injectable()
export class SupplierApplicationsService {
  private readonly logger = new Logger(SupplierApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async apply(
    dto: CreateSupplierApplicationDto,
  ): Promise<SupplierApplicationResult> {
    const email = dto.account.email.toLowerCase().trim();

    // Cheap checks first, so a malformed request never costs a password hash.
    assertNoRepeatedDeliveryAreas(dto.coverage);

    // Hashing is deliberately slow; doing it here keeps the transaction short.
    const passwordHash = await argon2.hash(dto.account.password);

    let user: User;
    let supplierProfileId: string;

    try {
      ({ user, supplierProfileId } = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.user.findUnique({ where: { email } });
          if (existing) {
            throw new ConflictException(EMAIL_TAKEN);
          }

          await assertDeliveryAreasAvailable(tx, dto.coverage);

          const created = await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName: dto.account.firstName.trim(),
              lastName: dto.account.lastName.trim(),
              phone: dto.account.phone?.trim() || null,
              role: Role.SUPPLIER,
            },
          });

          const profile = await tx.supplierProfile.create({
            data: {
              userId: created.id,
              ...toSupplierProfileData(dto.business),
              verificationStatus: VerificationStatus.PENDING,
            },
            select: { id: true },
          });

          await tx.supplierDeliveryArea.createMany({
            data: toCoverageRows(profile.id, dto.coverage),
          });

          return { user: created, supplierProfileId: profile.id };
        },
      ));
    } catch (err) {
      // Two applications racing for one email both pass the lookup; the unique
      // index stops the second. Nothing else written here can collide: the user
      // and profile are new, and repeated areas were rejected above.
      if (isUniqueViolation(err)) {
        throw new ConflictException(EMAIL_TAKEN);
      }
      throw err;
    }

    // Committed. From here a failure must not undo the application.
    let session: AuthResponse | null = null;
    try {
      session = await this.authService.startSession(user);
    } catch (err) {
      this.logger.error(
        `Supplier application ${supplierProfileId} was saved, but its session could not be started`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return {
      supplierProfileId,
      verificationStatus: VerificationStatus.PENDING,
      session,
    };
  }
}
