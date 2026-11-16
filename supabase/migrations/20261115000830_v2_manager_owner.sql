-- A3: quản lý được toàn quyền như chủ quản (vai trò owner). Chủ quản đổi lại được trong Phân quyền.
-- Nâng tất cả quản lý đang hoạt động lên chủ quản (giữ nguyên bộ phận, mã NV).
update public.memberships set role = 'owner' where role = 'manager' and active;
insert into public.audit_log(actor, action, target, details)
select 'system', 'GRANT_OWNER', email, jsonb_build_object('from', 'manager') from public.memberships where role = 'owner' and email <> 'dohung712@gmail.com';

-- Luôn còn ít nhất 1 chủ quản đang hoạt động (không tự khoá mình khỏi tool)
create or replace function public._keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where role = 'owner' and active) then
    raise exception 'Phải còn ít nhất 1 chủ quản đang hoạt động.';
  end if;
  return null;
end $$;
drop trigger if exists memberships_keep_owner on public.memberships;
create constraint trigger memberships_keep_owner after update or delete on public.memberships
  deferrable initially deferred for each row execute function public._keep_one_owner();
