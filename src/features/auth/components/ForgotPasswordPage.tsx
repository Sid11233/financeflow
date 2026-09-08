import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../schemas';
import { useRequestPasswordReset } from '../hooks/useRequestPasswordReset';

export function ForgotPasswordPage() {
  const [isSent, setIsSent] = useState(false);
  const requestResetMutation = useRequestPasswordReset();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    await requestResetMutation.mutateAsync(values.email);
    // Always show the same confirmation, whether or not the email belongs
    // to an account — this form must not be usable to discover which
    // emails are registered.
    setIsSent(true);
  };

  if (isSent) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-sm text-neutral-600">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
        <p className="mt-4 text-center text-sm text-neutral-500">
          <Link to="/login" className="text-accent underline">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>

        <Button type="submit" className="w-full" disabled={requestResetMutation.isPending}>
          {requestResetMutation.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-neutral-500">
        <Link to="/login" className="text-accent underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
