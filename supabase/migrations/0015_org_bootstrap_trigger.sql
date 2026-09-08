-- Bootstraps a brand-new organization: creates the owner's profile row and
-- seeds the default document_types. Must be SECURITY DEFINER because at
-- the moment an organization is inserted, its owner has no profile yet, so
-- auth_org_id() resolves to null and the ordinary "org isolation" policies
-- on profiles/document_types (0014) would reject these inserts if run as
-- the calling user.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, organization_id, full_name, role)
  values (
    new.owner_id,
    new.id,
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = new.owner_id),
    'owner'
  );

  insert into public.document_types (organization_id, name, sort_order)
  values
    (new.id, 'Bank Statement', 1),
    (new.id, 'Sales Invoices', 2),
    (new.id, 'Purchase Invoices', 3),
    (new.id, 'Payroll Report', 4),
    (new.id, 'Expense Receipts', 5),
    (new.id, 'Credit Card Statement', 6);

  return new;
end;
$$;

comment on function public.handle_new_organization() is
  'Creates the owner profile and default document_types for a newly created organization. Assumes one profile per auth user (profiles.id is that user''s primary key), so each user can own/join exactly one organization in this schema.';

-- Postgres has no `create trigger if not exists`, so drop first.
drop trigger if exists organizations_after_insert on public.organizations;
create trigger organizations_after_insert
  after insert on public.organizations
  for each row
  execute function public.handle_new_organization();
