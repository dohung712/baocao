-- D16b: Hướng dẫn chỉ xem khi đăng nhập, theo vai trò (xem phần của mình + vai trò thấp hơn: Giám đốc ⊃ Quản lý ⊃ Nhân viên).
-- Nội dung KHÔNG nằm trong kho mã công khai: lưu ở guide_content (không ai đọc trực tiếp được), chủ quản nạp bằng guide_set,
-- mọi người đọc qua guide_get — chỉ trả về thẻ / tin / bài nhập môn / lịch QL trong phạm vi vai trò.

create table if not exists public.guide_content (
  id integer primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.guide_content enable row level security;   -- không có policy: chỉ đọc qua guide_get
revoke all on public.guide_content from anon, authenticated;

-- hạng vai trò: nv 1 · ql 2 · gd 3
create or replace function public._guide_rank(p text) returns integer
language sql immutable set search_path = '' as $$ select case p when 'gd' then 3 when 'ql' then 2 when 'nv' then 1 else 99 end $$;

create or replace function public.guide_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships; d jsonb; v_my int;
begin
  m := public._require_member();
  select data into d from public.guide_content where id = 1;
  if d is null then return null; end if;
  v_my := case m.role when 'owner' then 3 when 'manager' then 2 else 1 end;
  return jsonb_build_object(
    'version', d -> 'version', 'roles', d -> 'roles', 'my', v_my,
    'cards', coalesce((select jsonb_agg(c) from jsonb_array_elements(d -> 'cards') c
                       where exists (select 1 from jsonb_array_elements_text(c -> 'roles') r where public._guide_rank(r) <= v_my)), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(n) from jsonb_array_elements(d -> 'news') n
                       where exists (select 1 from jsonb_array_elements_text(n -> 'roles') r where public._guide_rank(r) <= v_my)), '[]'::jsonb),
    'onboard', jsonb_build_object('nv', coalesce(d -> 'onboard' -> 'nv', '[]'::jsonb))
               || case when v_my >= 2 then jsonb_build_object('ql', coalesce(d -> 'onboard' -> 'ql', '[]'::jsonb)) else '{}'::jsonb end,
    'qlday', case when v_my >= 2 then coalesce(d -> 'qlday', '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.guide_set(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role <> 'owner' then raise exception 'Chỉ chủ quản được nạp nội dung hướng dẫn.'; end if;
  if jsonb_typeof(p -> 'cards') <> 'array' or jsonb_typeof(p -> 'news') <> 'array' or jsonb_typeof(p -> 'onboard') <> 'object' then
    raise exception 'File hướng dẫn không đúng dạng (thiếu cards / news / onboard).';
  end if;
  if length(p::text) > 400000 then raise exception 'File hướng dẫn quá lớn.'; end if;
  insert into public.guide_content(id, data, updated_at, updated_by) values (1, p, now(), m.email)
  on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = m.email;
  return jsonb_build_object('status', 'success', 'message', format('Đã nạp hướng dẫn bản %s: %s thẻ, %s tin', p ->> 'version', jsonb_array_length(p -> 'cards'), jsonb_array_length(p -> 'news')));
end $$;

revoke execute on function public._guide_rank(text) from public, anon;
revoke execute on function public.guide_get(), public.guide_set(jsonb) from public, anon;
grant execute on function public.guide_get(), public.guide_set(jsonb) to authenticated;
