-- Returns the calling user's organization_id, read from profiles.
--
-- SECURITY DEFINER + a pinned search_path let this run with the function
-- owner's privileges, bypassing the caller's own RLS on profiles, so it can
-- be used inside every other table's RLS policy without recursion: a policy
-- calls auth_org_id() -> this function reads profiles directly (bypassing
-- profiles' own RLS, which would otherwise need to call auth_org_id() to
-- decide whether to allow that very read) -> returns a plain uuid the
-- policy compares organization_id against.
create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id
  from public.profiles
  where id = auth.uid()
$$;

revoke all on function public.auth_org_id() from public;
grant execute on function public.auth_org_id() to authenticated;

comment on function public.auth_org_id() is
  'Organization_id of the current auth.uid(), or null if they have no profile row yet. Use in RLS policies instead of repeating a subquery on profiles.';
