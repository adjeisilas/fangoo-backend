import { VerificationStatus } from '../../generated/prisma/client.js';
import type { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto.js';

/**
 * The business fields of a depot, normalised for storage. Shared by profile
 * creation and supplier applications so both store a depot the same way.
 */
export const toSupplierProfileData = (dto: CreateSupplierProfileDto) => ({
  companyName: dto.companyName.trim(),
  businessRegNumber: dto.businessRegNumber?.trim() || null,
  taxId: dto.taxId?.trim() || null,
  description: dto.description?.trim() || null,
  address: dto.address.trim(),
  city: dto.city.trim(),
  postalCode: dto.postalCode?.trim() || null,
  contactPhone: dto.contactPhone.trim(),
  contactEmail: dto.contactEmail.toLowerCase().trim(),
});

/** What an admin checks when verifying a depot: who the business legally is. */
const IDENTITY_FIELDS = ['companyName', 'businessRegNumber', 'taxId'] as const;

type IdentityFields = Record<(typeof IDENTITY_FIELDS)[number], string | null>;

const normalise = (value: string | null | undefined) => value?.trim() || null;

/**
 * A verified depot that changes its legal identity goes back to review, so a
 * badge earned under one business can never be carried over to another.
 * Fields left out of `changes` are not being changed.
 */
export const reverificationFor = (
  profile: IdentityFields & { verificationStatus: VerificationStatus },
  changes: Partial<Record<keyof IdentityFields, string | null | undefined>>,
) => {
  if (profile.verificationStatus !== VerificationStatus.VERIFIED) return {};

  const changed = IDENTITY_FIELDS.some(
    (field) =>
      changes[field] !== undefined &&
      normalise(changes[field]) !== normalise(profile[field]),
  );

  return changed
    ? { verificationStatus: VerificationStatus.PENDING, verifiedAt: null }
    : {};
};
