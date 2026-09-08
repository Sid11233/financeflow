import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../schemas';
import { useUpdatePassword } from '../hooks/useUpdatePassword';
import { supabase } from '@/lib/supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const updatePasswordMutation = useUpdatePassword();
  const [isReady, setIsReady] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  useEffect(() => {
    let isMounted = true;

    // Supabase parses the recovery link's URL fragment during client init
    // and fires PASSWORD_RECOVERY once that session is established — but
    // if it already fired before this component mounted, catch that by
    // also checking directly for a current session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && isMounted) setIsReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (data.session) setIsReady(true);
      else setIsInvalid(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    try {
      await updatePasswordMutation.mutateAsync(values.password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Could not update your password.',
      });
    }
  };

  if (isInvalid) {
    return (
      <AuthLayout title="Link expired">
        <p className="text-sm text-neutral-600">This password reset link is invalid or has expired.</p>
        <p className="mt-4 text-center text-sm text-neutral-500">
          <Link to="/forgot-password" className="text-accent underline">
            Request a new link
          </Link>
        </p>
      </AuthLayout>
    );
  }

  if (!isReady) {
    return (
      <AuthLayout title="Reset your password">
        <p className="text-sm text-neutral-500">Checking your link…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="New password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
        </Field>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" className="w-full" disabled={updatePasswordMutation.isPending}>
          {updatePasswordMutation.isPending ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
