-- Family-account schema for the phone-as-identifier, one-PIN-per-family flow.
-- NOT APPLIED. Do not run `supabase db push` while the older
-- 202609280001_sound_families.sql remains in this migration directory: that
-- older migration models one Auth user per student and would run first.
-- Review docs/SUPABASE_FAMILY_PLAN.md and apply this file explicitly only
-- after checking the intended project's public.sr_* namespace.
-- Auth users and PIN handling are created by trusted server code, not SQL here.

begin;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and left(c.relname, 3) = 'sr_'
  ) then
    raise exception 'Existing public.sr_* relation found; inspect it before applying family schema';
  end if;
end $$;

-- Exactly one Auth user owns each family. The phone is an unverified login
-- identifier; this table does not claim that the family owns that number.
create table public.sr_families (
  id uuid primary key references auth.users(id) on delete cascade,
  parent_name text not null check (char_length(btrim(parent_name)) between 2 and 80),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  pin_changed_at timestamptz not null default now(),
  pin_generation integer not null default 1 check (pin_generation > 0),
  login_paused boolean not null default false
);

create table public.sr_students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.sr_families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  grade smallint check (grade between 1 and 12),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, family_id)
);
create unique index sr_students_active_name_per_family
  on public.sr_students (family_id, lower(btrim(name)))
  where archived_at is null;
create index sr_students_family on public.sr_students (family_id, created_at);

-- Serialize profile creation on the family row so concurrent devices cannot
-- both pass an application-side 12-profile check.
create function public.sr_enforce_student_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if new.archived_at is not null then return new; end if;
  perform 1 from public.sr_families where id = new.family_id for update;
  select count(*) into v_count from public.sr_students
    where family_id = new.family_id and archived_at is null and id <> new.id;
  if v_count >= 12 then raise exception 'Maximum 12 active student profiles per family'; end if;
  return new;
end $$;
create trigger sr_limit_students_insert before insert
  on public.sr_students for each row execute function public.sr_enforce_student_limit();
create trigger sr_limit_students_reactivate before update of archived_at
  on public.sr_students for each row execute function public.sr_enforce_student_limit();

-- Append-only answers. The composite FK prevents a caller from pairing their
-- family ID with another family's student ID. Direct client INSERT is revoked:
-- a browser holding its own JWT could otherwise fabricate correct answers.
-- A trusted answer endpoint / restricted RPC must be reviewed before writes.
create table public.sr_family_attempts (
  id uuid primary key,
  family_id uuid not null,
  student_id uuid not null,
  item_id text not null check (char_length(item_id) between 1 and 200),
  item_snapshot jsonb not null check (
    jsonb_typeof(item_snapshot) = 'object'
    and octet_length(item_snapshot::text) <= 16384
  ),
  sound_family_id text not null,
  contrast_id text not null,
  mode text not null check (mode in ('odd', 'sort', 'listen', 'exam')),
  selected_id text not null,
  correct_id text not null,
  is_correct boolean not null,
  latency_ms integer not null check (latency_ms between 0 and 3600000),
  client_attempted_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (student_id, family_id)
    references public.sr_students (id, family_id) on delete cascade
);
create index sr_family_attempts_student_recent
  on public.sr_family_attempts (student_id, client_attempted_at desc, id);
create index sr_family_attempts_student_contrast
  on public.sr_family_attempts (student_id, contrast_id, received_at desc);

-- Supabase Auth access JWTs carry a stable session_id. This allowlist is
-- checked by RLS on every family data request. It is cleared by PIN reset, so
-- old access JWTs (and refreshed tokens for their old session) lose DB access.
create table public.sr_family_sessions (
  family_id uuid not null references public.sr_families(id) on delete cascade,
  session_id uuid not null,
  pin_generation integer not null,
  created_at timestamptz not null default now(),
  primary key (family_id, session_id)
);

create table public.sr_pin_reset_audit (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.sr_families(id),
  admin_user_id uuid not null references auth.users(id),
  status text not null default 'started' check (status in ('started','completed','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sr_pin_reset_audit_family on public.sr_pin_reset_audit (family_id, created_at desc);

create function public.sr_family_session_allowed(p_family_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_family_id = (select auth.uid()) and exists (
    select 1 from public.sr_families f
    join public.sr_family_sessions s on s.family_id = f.id
    where f.id = p_family_id and not f.login_paused
      and s.pin_generation = f.pin_generation
      and s.session_id::text = (select auth.jwt() ->> 'session_id')
  )
$$;

-- Only the trusted server may register a freshly authenticated session.
-- p_generation was read before password authentication and prevents a login
-- that raced with a reset from registering afterward.
create function public.sr_register_family_session(
  p_family_id uuid, p_session_id uuid, p_generation integer
) returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_generation integer; v_paused boolean;
begin
  select pin_generation, login_paused into v_generation, v_paused
    from public.sr_families where id = p_family_id for update;
  if not found or v_paused or v_generation <> p_generation then return false; end if;
  insert into public.sr_family_sessions (family_id, session_id, pin_generation)
    values (p_family_id, p_session_id, p_generation)
    on conflict (family_id, session_id) do nothing;
  return true;
end $$;

create function public.sr_begin_pin_reset(p_family_id uuid, p_admin_user_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_audit_id uuid; v_paused boolean;
begin
  select login_paused into v_paused from public.sr_families
    where id = p_family_id for update;
  if not found then raise exception 'Family missing'; end if;
  if v_paused then
    select id into v_audit_id from public.sr_pin_reset_audit
      where family_id = p_family_id and admin_user_id = p_admin_user_id
        and status = 'started'
      order by created_at desc limit 1;
    if v_audit_id is null then raise exception 'Reset in progress under another administrator'; end if;
    return v_audit_id;
  end if;
  update public.sr_families set login_paused = true,
    pin_generation = pin_generation + 1, pin_changed_at = now()
    where id = p_family_id;
  delete from public.sr_family_sessions where family_id = p_family_id;
  insert into public.sr_pin_reset_audit (family_id, admin_user_id)
    values (p_family_id, p_admin_user_id) returning id into v_audit_id;
  return v_audit_id;
end $$;

create function public.sr_finish_pin_reset(
  p_audit_id uuid, p_success boolean, p_phone_bucket_hash text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_family_id uuid;
begin
  if p_phone_bucket_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid authentication rate-limit key';
  end if;
  update public.sr_pin_reset_audit set status = case when p_success then 'completed' else 'failed' end,
    finished_at = now() where id = p_audit_id and status = 'started'
    returning family_id into v_family_id;
  if not found then raise exception 'Reset audit entry missing or already finished'; end if;
  delete from public.sr_auth_throttle where key_hash = p_phone_bucket_hash;
  update public.sr_families set login_paused = false where id = v_family_id;
end $$;

-- Server-only, durable rate bucket. Key hashes are HMACs of normalized phones
-- or trusted client IPs, so this table does not store those identifiers.
create table public.sr_auth_throttle (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts > 0),
  window_started_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index sr_auth_throttle_updated on public.sr_auth_throttle (updated_at);

create function public.sr_take_auth_attempt(
  p_key_hash text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_attempts integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 100
     or p_window_seconds not between 60 and 86400 then
    raise exception 'Invalid authentication rate-limit argument';
  end if;
  insert into public.sr_auth_throttle
    (key_hash, attempts, window_started_at, updated_at)
  values (p_key_hash, 1, now(), now())
  on conflict (key_hash) do update set
    attempts = case
      when sr_auth_throttle.window_started_at <= now() - (p_window_seconds * interval '1 second')
      then 1 else sr_auth_throttle.attempts + 1 end,
    window_started_at = case
      when sr_auth_throttle.window_started_at <= now() - (p_window_seconds * interval '1 second')
      then now() else sr_auth_throttle.window_started_at end,
    updated_at = now()
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end $$;

alter table public.sr_families enable row level security;
alter table public.sr_students enable row level security;
alter table public.sr_family_attempts enable row level security;
alter table public.sr_auth_throttle enable row level security;
alter table public.sr_family_sessions enable row level security;
alter table public.sr_pin_reset_audit enable row level security;

-- Do not rely on RLS alone for operation-level privileges. Supabase projects
-- can grant broad default table privileges to anon/authenticated roles.
revoke all on public.sr_families from public, anon, authenticated;
revoke all on public.sr_students from public, anon, authenticated;
revoke all on public.sr_family_attempts from public, anon, authenticated;
revoke all on public.sr_auth_throttle from public, anon, authenticated;
revoke all on public.sr_family_sessions from public, anon, authenticated;
revoke all on public.sr_pin_reset_audit from public, anon, authenticated;
revoke execute on function public.sr_enforce_student_limit() from public, anon, authenticated;
revoke execute on function public.sr_family_session_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.sr_register_family_session(uuid, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.sr_begin_pin_reset(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.sr_finish_pin_reset(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.sr_take_auth_attempt(text, integer, integer)
  from public, anon, authenticated;

-- This role bypasses RLS; it is reserved for narrow, audited server tasks.
grant all on public.sr_families, public.sr_students,
  public.sr_family_attempts, public.sr_auth_throttle,
  public.sr_family_sessions, public.sr_pin_reset_audit to service_role;
grant execute on function public.sr_take_auth_attempt(text, integer, integer)
  to service_role;
grant execute on function public.sr_family_session_allowed(uuid) to authenticated, service_role;
grant execute on function public.sr_register_family_session(uuid, uuid, integer)
  to service_role;
grant execute on function public.sr_begin_pin_reset(uuid, uuid) to service_role;
grant execute on function public.sr_finish_pin_reset(uuid, boolean, text) to service_role;

grant select on public.sr_families to authenticated;
grant select on public.sr_students to authenticated;
grant insert (id, family_id, name, grade) on public.sr_students to authenticated;
grant update (name, grade, archived_at) on public.sr_students to authenticated;
grant select on public.sr_family_attempts to authenticated;

create policy sr_family_read_own on public.sr_families
  for select to authenticated
  using (id = (select auth.uid()) and public.sr_family_session_allowed(id));

create policy sr_students_read_own on public.sr_students
  for select to authenticated
  using (family_id = (select auth.uid()) and public.sr_family_session_allowed(family_id));
create policy sr_students_add_own on public.sr_students
  for insert to authenticated
  with check (family_id = (select auth.uid()) and public.sr_family_session_allowed(family_id));
create policy sr_students_edit_own on public.sr_students
  for update to authenticated
  using (family_id = (select auth.uid()) and public.sr_family_session_allowed(family_id))
  with check (family_id = (select auth.uid()) and public.sr_family_session_allowed(family_id));

-- The denormalized family_id is constrained by the composite FK, so these
-- policies need no subquery into sr_students and cannot recurse through RLS.
create policy sr_attempts_read_own on public.sr_family_attempts
  for select to authenticated
  using (family_id = (select auth.uid()) and public.sr_family_session_allowed(family_id));

commit;
