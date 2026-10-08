-- Preserve historical PIN-reset audit rows when an administrator removes a
-- family. The immutable family UUID remains as the historical identifier.
-- No policy or role grant changes; family/student/answer/invite cascades already
-- exist through the Auth user. Apply explicitly to the verified family schema.
begin;
alter table public.sr_pin_reset_audit
  drop constraint sr_pin_reset_audit_family_id_fkey;
commit;
