-- Adds a 'waived' terminal status to required_documents: the client told
-- the accountant (via a call, an email, whatever channel) that a document
-- doesn't apply this period (e.g. "we ran no payroll in August"), so the
-- checklist item should count as resolved without ever having a file
-- attached to it.
--
-- This is deliberately its own migration/transaction, containing nothing
-- but the enum addition and plain columns. Postgres refuses to let a newly
-- added enum value be referenced anywhere in the same transaction that
-- added it (confirmed empirically against this project's linked database:
-- even a CHECK constraint literal comparing status = 'waived' right after
-- the ALTER TYPE fails with "unsafe use of new value ... (SQLSTATE
-- 55P04)"). Anything that mentions the literal 'waived' — the maintenance
-- trigger, the consistency constraint — lives in the next migration
-- instead, so it runs only after this one has committed.
alter type public.required_document_status add value if not exists 'waived';

alter table public.required_documents
  add column if not exists waived_reason text,
  add column if not exists waived_at timestamptz;

comment on column public.required_documents.waived_reason is
  'Free-text reason captured when status is set to ''waived'' — why this document does not apply this period. Optional: an accountant may waive an item without typing a reason.';
comment on column public.required_documents.waived_at is
  'Set automatically when status transitions to ''waived'' and cleared automatically when it transitions away — see maintain_required_document_waived_fields() in the next migration. Never set directly by the app.';
