/**
 * True for Prisma's unique-constraint failure (P2002).
 *
 * Every "does this already exist?" check is a read followed by a write, so two
 * requests can both pass it. The unique index is what actually prevents the
 * duplicate; this turns the resulting crash into the 409 the caller expects.
 */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { code?: unknown }).code === 'P2002';
