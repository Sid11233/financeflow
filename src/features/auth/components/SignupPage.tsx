import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { signupSchema, type SignupFormValues } from '../schemas';
import { useSignup } from '../hooks/useSignup';

export function SignupPage() {
  const navigate = useNavigate();
  const signupMutation = useSignup();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupFormValues) => {
    try {
      await signupMutation.mutateAsync(values);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Could not create your account.',
      });
    }
  };

  return (
    <AuthLayout title="Create your FinanceFlow account">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Firm name" htmlFor="firmName" error={errors.firmName?.message}>
          <Input id="firmName" autoComplete="organization" {...register('firmName')} />
        </Field>
        <Field label="Your name" htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" {...register('fullName')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </Field>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" className="w-full" disabled={signupMutation.isPending}>
          {signupMutation.isPending ? 'Creating your workspace…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-neutral-500">
        Already have an account?{' '}
        <Link to="/login" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
