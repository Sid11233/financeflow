-- pgcrypto provides gen_random_uuid() for primary keys and digest() for
-- server-side sha256 hashing (used when hashing request_tokens on lookup).
create extension if not exists pgcrypto with schema extensions;
