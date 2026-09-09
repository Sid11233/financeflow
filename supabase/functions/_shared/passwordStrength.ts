// Mirrors supabase/config.toml's `password_requirements = "lower_upper_letters_digits"`
// — that policy only governs Supabase's own native signup/password-reset
// flows. Every account this app actually creates goes through
// auth.admin.createUser() (create-organization, accept-invite), which is
// an admin-level operation that bypasses the configured password policy
// entirely — so the same rule has to be enforced here explicitly, or an
// admin-created account could end up with a weaker password than a
// password reset would ever allow.
const MIN_LENGTH = 8;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  return null;
}
