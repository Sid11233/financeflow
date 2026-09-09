import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

// Mirrors supabase/functions/_shared/passwordStrength.ts — the actual
// enforcement lives server-side (that file's own comment explains why:
// admin.createUser bypasses config.toml's password policy entirely), this
// is purely so the form can tell the user immediately instead of after a
// round trip.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const signupSchema = z.object({
  firmName: z.string().min(1, 'Firm name is required'),
  fullName: z.string().min(1, 'Your name is required'),
  email: z.string().email('Enter a valid email address'),
  password: passwordSchema,
});
export type SignupFormValues = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    fullName: z.string().min(1, 'Your name is required'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type AcceptInviteFormValues = z.infer<typeof acceptInviteSchema>;
