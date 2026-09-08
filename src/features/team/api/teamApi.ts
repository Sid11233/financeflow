import { supabase } from '@/lib/supabase';
import { generateToken, sha256Hex } from '@/lib/hashToken';

const INVITE_EXPIRY_DAYS = 7;

export async function listTeamMembers() {
  const { data, error } = await supabase.rpc('list_org_members');
  if (error) throw error;
  return data ?? [];
}

export async function listInvites() {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export interface CreateInviteInput {
  email: string;
  organizationId: string;
  invitedBy: string;
  inviterName: string;
}

export async function createInvite({ email, organizationId, invitedBy, inviterName }: CreateInviteInput) {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('invites')
    .insert({
      organization_id: organizationId,
      email,
      token_hash: tokenHash,
      invited_by: invitedBy,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw error;

  const inviteUrl = `${window.location.origin}/accept-invite/${token}`;

  const { error: emailError } = await supabase.functions.invoke('send-email', {
    body: {
      template: 'team_invite',
      to: email,
      organizationId,
      variables: { inviterName, acceptUrl: inviteUrl, expiresInDays: INVITE_EXPIRY_DAYS },
    },
  });

  return { invite: data, emailSent: !emailError };
}

export async function revokeInvite(id: string) {
  const { error } = await supabase
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function removeMember(profileId: string) {
  const { error } = await supabase.from('profiles').delete().eq('id', profileId);
  if (error) throw error;
}
