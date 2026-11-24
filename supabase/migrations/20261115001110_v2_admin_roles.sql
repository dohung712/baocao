-- D18: phân cấp quyền (chủ quản chốt 24/11/2026)
--  • Admin = 1 tài khoản duy nhất (memberships.is_admin, role owner) — độc quyền: cấp quyền Quản lý, ẩn chức năng (HIDE), đặt mật khẩu
--  • Quản lý = role owner không phải Admin: đủ quyền như Admin trừ 3 việc trên (tài khoản Chủ quản cũ khác tự thành Quản lý)
--  • role manager (cũ, theo bộ phận) giờ cũng xem được toàn bộ NV
--  • Nhân viên: như cũ
-- Không ghi email trong mã (kho mã công khai): Admin nhận cờ bằng claim_admin() gọi từ chính tài khoản đó (chỉ được khi chưa có Admin).

alter table public.memberships add column if not exists is_admin boolean not null default false;
create unique index if not exists memberships_one_admin on public.memberships ((true)) where is_admin;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.role = 'owner' and m.is_admin from public.app_member() m), false)
$$;

-- Quản lý xem được toàn bộ NV (như Admin)
create or replace function public.can_see_staff(p_staff text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case m.role
    when 'owner' then true
    when 'manager' then true
    when 'employee' then m.staff_id = p_staff
    else false end
  from (select * from public.app_member()) m
$$;

-- Ẩn chức năng (HIDE): chỉ Admin. Các cài đặt khác: Admin + Quản lý (role owner) như trước
drop policy if exists settings_owner_write on public.settings;
create policy settings_owner_write on public.settings for all to authenticated
  using (public.is_owner() and (key <> 'HIDE' or public.is_admin()))
  with check (public.is_owner() and (key <> 'HIDE' or public.is_admin()));

-- Phân quyền: chỉ Admin được cấp / sửa / xoá tài khoản Quản lý (owner, manager) và cờ Admin.
-- Edge Function (service_role) và claim_admin không bị chặn.
create or replace function public._memberships_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or coalesce(current_setting('app.claim_admin', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if public.is_admin() then
    if tg_op = 'UPDATE' and old.is_admin and (not new.is_admin or not new.active or new.role <> 'owner') then
      raise exception 'Không tự gỡ quyền Admin được.';
    end if;
    if tg_op = 'DELETE' and old.is_admin then raise exception 'Không xoá tài khoản Admin được.'; end if;
    if tg_op <> 'DELETE' and new.is_admin and (tg_op = 'INSERT' or not old.is_admin) then raise exception 'Chỉ có 1 Admin.'; end if;
    return coalesce(new, old);
  end if;
  if (tg_op <> 'INSERT' and (old.role in ('owner', 'manager') or old.is_admin))
     or (tg_op <> 'DELETE' and (new.role in ('owner', 'manager') or new.is_admin)) then
    raise exception 'Chỉ Admin được cấp / sửa quyền Quản lý.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists memberships_guard on public.memberships;
create trigger memberships_guard before insert or update or delete on public.memberships
  for each row execute function public._memberships_guard();

-- Nhận cờ Admin (1 lần): người gọi phải là role owner và hệ thống chưa có Admin
create or replace function public.claim_admin() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role <> 'owner' then raise exception 'Chỉ tài khoản chủ quản nhận được quyền Admin.'; end if;
  if exists (select 1 from public.memberships where is_admin) then
    if m.is_admin then return jsonb_build_object('status', 'success', 'message', 'Bạn đã là Admin.'); end if;
    raise exception 'Hệ thống đã có Admin.';
  end if;
  perform set_config('app.claim_admin', '1', true);
  update public.memberships set is_admin = true where email = m.email;
  insert into public.audit_log(actor, action, target, details) values (m.email, 'CLAIM_ADMIN', m.email, '{}'::jsonb);
  return jsonb_build_object('status', 'success', 'message', 'Đã nhận quyền Admin.');
end $$;

revoke execute on function public.is_admin(), public.claim_admin(), public._memberships_guard() from public, anon;
grant execute on function public.is_admin(), public.claim_admin() to authenticated;
