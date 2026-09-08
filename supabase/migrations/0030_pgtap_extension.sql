-- pgTAP powers the tests in supabase/tests/database/ (run via
-- `supabase test db`). Enabled here, the same way pgcrypto is in 0001, so
-- `supabase db reset` (which every test run starts from) always has it
-- available. It adds only testing/assertion functions, no runtime attack
-- surface, and is schema-qualified out of public for the same reason as
-- pgcrypto.
create extension if not exists pgtap with schema extensions;
