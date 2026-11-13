-- Enable Row Level Security on every application table and revoke all access for
-- Supabase's client-facing roles. With RLS enabled and no policies, the public
-- REST/Realtime APIs (anon key / authenticated JWT) see nothing. All access goes
-- through the authenticated Next.js server (table-owner connection), which
-- enforces authorization in code.
--
-- Every later migration that creates tables MUST end with:
--   select app_lockdown_rls();
create or replace function app_lockdown_rls() returns void
language plpgsql as $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke execute on function app_lockdown_rls() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke execute on function app_lockdown_rls() from authenticated';
  end if;
end $$;

select app_lockdown_rls();
