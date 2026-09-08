import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Skeleton } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { acceptInviteSchema, type AcceptInviteFormValues } from '../schemas';
import { getInviteDetails } from '../api/authApi';
import { useAcceptInvite } from '../hooks/useAcceptInvite';

export function AcceptInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const acceptInviteMutation = useAcceptInvite();

  const inviteQuery = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInviteDetails(token),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AcceptInviteFormValues>({ resolver: zodResolver(acceptInviteSchema) });

  const onSubmit = async (values: AcceptInviteFormValues) => {
    try {
      await acceptInviteMutation.mutateAsync({
        token,
        password: values.password,
        fullName: values.fullName,
      });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Could not accept this invite.',
      });
    }
  };

  if (inviteQuery.isPending) {
    return (
      <AuthLayout title="Loading invite…">
        <Skeleton className="h-10 w-full" />
      </AuthLayout>
    );
  }

  if (inviteQuery.isError) {
    return (
      <AuthLayout title="Invite unavailable">
        <p className="text-sm text-neutral-600">
          {inviteQuery.error instanceof Error
            ? inviteQuery.error.message
            : 'This invite link is invalid.'}
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
    <AuthLayout title={`Join ${inviteQuery.data.organizationName}`}>
      <p className="mb-4 text-sm text-neutral-500">
        Setting up an account for <strong>{inviteQuery.data.email}</strong>.
      </p>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Your name" htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" {...register('fullName')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
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

        <Button type="submit" className="w-full" disabled={acceptInviteMutation.isPending}>
          {acceptInviteMutation.isPending ? 'Joining…' : 'Join team'}
        </Button>
      </form>
    </AuthLayout>
  );
}
