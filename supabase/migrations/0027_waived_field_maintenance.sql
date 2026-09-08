-- Split from 0026 solely because this file is the first one allowed to
-- reference the literal 'waived' added there (see the comment in 0026).
--
-- Keeps waived_at/waived_reason consistent with status without relying on
-- every caller to remember to clear them: set waived_at the moment status
-- becomes 'waived' (if not already set, so re-saving a still-waived row
-- doesn't reset the timestamp), and clear both the moment it becomes
-- anything else (e.g. a new document arrives and the item moves back to
-- 'received', or an accountant un-waives it by hand).
create or replace function public.maintain_required_document_waived_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'waived' then
    if new.waived_at is null then
      new.waived_at := now();
    end if;
  else
    new.waived_at := null;
    new.waived_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists required_documents_maintain_waived_fields on public.required_documents;
create trigger required_documents_maintain_waived_fields
  before insert or update on public.required_documents
  for each row
  execute function public.maintain_required_document_waived_fields();

alter table public.required_documents
  drop constraint if exists required_documents_waived_consistency;
alter table public.required_documents
  add constraint required_documents_waived_consistency
  check (
    (status = 'waived' and waived_at is not null)
    or (status <> 'waived' and waived_at is null and waived_reason is null)
  );
