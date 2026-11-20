-- Bảo mật (đã áp tay ngày 19/11/2026 qua SQL Editor; file này ghi lại để repo khớp DB — chạy lại vô hại)
-- 1) Hook "Before User Created": chỉ tạo được tài khoản mới cho chủ quản, email đã cấp quyền (memberships), NV trong danh sách.
--    Bật ở Dashboard → Authentication → Hooks → Before User Created → public.hook_before_user_created
-- 2) Khách (anon) không còn quyền trên bảng / hàm nào; người đăng nhập giữ nguyên quyền.
-- 3) Bảng / hàm tạo mới sau này mặc định không cấp cho khách.

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text := lower(trim(coalesce(event->'user'->>'email', '')));
  v_code  text;
begin
  if v_email = 'dohung712@gmail.com' then return '{}'::jsonb; end if;
  if exists (select 1 from public.memberships m where lower(m.email) = v_email and m.active = true) then
    return '{}'::jsonb;
  end if;
  v_code := substring(v_email from '^nv(.+)@thidua351\.vn$');
  if v_code is not null and exists (select 1 from public.staff s where lower(s.id) = v_code) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Email này chưa được chủ quản cấp quyền. Liên hệ chủ quản để được thêm vào danh sách.'));
end;
$fn$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant  execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

revoke all on public.hot_bonuses, public.rank_rewards from anon;

do $do$
declare r record;
begin
  for r in select p.oid::regprocedure sig, has_function_privilege('authenticated', p.oid, 'execute') au
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'hook_before_user_created'
             and has_function_privilege('anon', p.oid, 'execute')
  loop
    if r.au then execute format('grant execute on function %s to authenticated', r.sig); end if;
    execute format('grant execute on function %s to service_role', r.sig);
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $do$;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
