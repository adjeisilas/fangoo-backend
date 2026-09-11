const MIN_SECRET_LENGTH = 32;

/**
 * Fails the boot rather than letting the app fall back to a weak or shared
 * default. A signing secret that lives in source is not a secret — anyone with
 * the repository could mint a valid admin token.
 */
export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];
  const isProduction = config.NODE_ENV === 'production';

  const read = (key: string) => {
    const value = config[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  if (!read('DATABASE_URL')) {
    errors.push('DATABASE_URL is required.');
  }

  const accessSecret = read('JWT_ACCESS_SECRET');
  const refreshSecret = read('JWT_REFRESH_SECRET');

  for (const [key, value] of [
    ['JWT_ACCESS_SECRET', accessSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (!value) {
      errors.push(
        `${key} is required. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
      );
    } else if (value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters.`);
    }
  }

  // Reusing one secret for both tokens means a stolen access token can be
  // replayed as a refresh token.
  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
  }

  if (isProduction) {
    if (!read('CORS_ORIGIN')) {
      errors.push('CORS_ORIGIN is required in production.');
    }
    if (!read('PAYSTACK_SECRET_KEY')) {
      errors.push('PAYSTACK_SECRET_KEY is required in production.');
    }
    if (read('PAYSTACK_SECRET_KEY').startsWith('sk_test_')) {
      errors.push(
        'PAYSTACK_SECRET_KEY is a test key but NODE_ENV is production.',
      );
    }
    if (!read('PAYSTACK_CALLBACK_URL')) {
      errors.push('PAYSTACK_CALLBACK_URL is required in production.');
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
