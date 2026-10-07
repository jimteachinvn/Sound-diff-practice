-- Apply after the family-profile schema. Reject concurrent reset workers.
begin;
create or replace function public.sr_begin_pin_reset(p_family_id uuid, p_admin_user_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_audit_id uuid; v_paused boolean;
begin
  select login_paused into v_paused from public.sr_families
    where id = p_family_id for update;
  if not found then raise exception 'Family missing'; end if;
  if v_paused then raise exception 'Reset already in progress; inspect audit before recovery'; end if;
  update public.sr_families set login_paused = true,
    pin_generation = pin_generation + 1, pin_changed_at = now()
    where id = p_family_id;
  delete from public.sr_family_sessions where family_id = p_family_id;
  insert into public.sr_pin_reset_audit (family_id, admin_user_id)
    values (p_family_id, p_admin_user_id) returning id into v_audit_id;
  return v_audit_id;
end $$;
revoke execute on function public.sr_begin_pin_reset(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sr_begin_pin_reset(uuid, uuid) to service_role;
commit;
