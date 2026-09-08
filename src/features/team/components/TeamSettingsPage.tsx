import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTeamMembers } from '../hooks/useTeamMembers';
import { useInvites } from '../hooks/useInvites';
import { useInviteMember } from '../hooks/useInviteMember';
import { useRevokeInvite } from '../hooks/useRevokeInvite';
import { useRemoveMember } from '../hooks/useRemoveMember';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type InviteFormValues = z.infer<typeof inviteSchema>;

export function TeamSettingsPage() {
  const { profile, organization } = useAuth();
  const isOwner = profile?.role === 'owner';

  const membersQuery = useTeamMembers();
  const invitesQuery = useInvites();
  const inviteMemberMutation = useInviteMember();
  const revokeInviteMutation = useRevokeInvite();
  const removeMemberMutation = useRemoveMember();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteFormValues>({ resolver: zodResolver(inviteSchema) });

  const onInvite = async (values: InviteFormValues) => {
    if (!profile || !organization) return;

    try {
      const { emailSent } = await inviteMemberMutation.mutateAsync({
        email: values.email,
        organizationId: organization.id,
        invitedBy: profile.id,
        inviterName: profile.full_name ?? 'A teammate',
      });

      reset();
      setIsInviteOpen(false);
      setEmailWarning(
        emailSent ? null : 'The invite was created, but the email failed to send — share the link manually.',
      );
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Could not send invite.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Team</h1>
        {isOwner && (
          <Button
            onClick={() => {
              setEmailWarning(null);
              setIsInviteOpen(true);
            }}
          >
            Invite member
          </Button>
        )}
      </div>

      {emailWarning && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{emailWarning}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                {isOwner && <TableHead>&nbsp;</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.data?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.full_name ?? '—'}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'owner' ? 'accent' : 'neutral'}>{member.role}</Badge>
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      {member.id !== profile?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeMemberMutation.isPending}
                          onClick={() => removeMemberMutation.mutate(member.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Expires</TableHead>
                {isOwner && <TableHead>&nbsp;</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitesQuery.data?.length ? (
                invitesQuery.data.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                    {isOwner && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={revokeInviteMutation.isPending}
                          onClick={() => revokeInviteMutation.mutate(invite.id)}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={isOwner ? 3 : 2} className="text-neutral-400">
                    No pending invites.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isInviteOpen} onClose={() => setIsInviteOpen(false)}>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onInvite)} noValidate>
          <Field label="Email" htmlFor="invite-email" error={errors.email?.message}>
            <Input id="invite-email" type="email" {...register('email')} />
          </Field>
          {errors.root && <p className="mt-1 text-sm text-red-600">{errors.root.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMemberMutation.isPending}>
              {inviteMemberMutation.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
