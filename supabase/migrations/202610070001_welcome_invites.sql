-- Follow-up to 202610060001_family_profiles.sql. NOT APPLIED.
-- The invite grants a welcome greeting only; normal family sign-in still applies.
begin;

do $$
begin
  if to_regclass('public.sr_students') is null or to_regclass('public.sr_families') is null then
    raise exception 'Apply and verify the family-profile migration first';
  end if;
  if to_regclass('public.sr_welcome_invites') is not null then
    raise exception 'Existing welcome invite table found; inspect before applying';
  end if;
end $$;

create table public.sr_welcome_invites (
  student_id uuid primary key,
  family_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  greeting text not null check (char_length(btrim(greeting)) between 2 and 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  foreign key (student_id, family_id) references public.sr_students (id, family_id) on delete cascade
);
create index sr_welcome_invites_expiry on public.sr_welcome_invites (expires_at);

alter table public.sr_welcome_invites enable row level security;
revoke all on public.sr_welcome_invites from public, anon, authenticated;
grant all on public.sr_welcome_invites to service_role;

commit;
