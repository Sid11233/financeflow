import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { loginSchema, type LoginFormValues } from '../schemas';
import { useLogin } from '../hooks/useLogin';

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync(values);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Could not sign in.',
      });
    }
  };

  return (
    <AuthLayout title="Sign in to FinanceFlow">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </Field>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-neutral-500">
        <Link to="/forgot-password" className="text-accent underline">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-neutral-500">
        Don&apos;t have an account?{' '}
        <Link to="/signup" className="text-accent underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
