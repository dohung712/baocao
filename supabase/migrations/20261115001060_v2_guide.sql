-- D16: 📖 Hướng dẫn sống — theo dõi ai đã đọc "Có gì mới", ai đã xong bài Nhập môn (nội dung ở v2/guide.json).
--  guide_progress: kind = news (id mục Có gì mới) · onboard (id bước nhập môn; 'done' = xong cả bài) · seen ('first' = lần đầu mở tool)

create table if not exists public.guide_progress (
  email text not null,
  kind text not null check (kind in ('news', 'onboard', 'seen')),
  item text not null check (length(item) between 1 and 80),
  at timestamptz not null default now(),
  primary key (email, kind, item)
);
alter table public.guide_progress enable row level security;
drop policy if exists guide_progress_read on public.guide_progress;
create policy guide_progress_read on public.guide_progress for select to authenticated
  using (public.is_member() and (email = (public.app_member()).email or public.is_manager()));
revoke all on public.guide_progress from anon;
revoke insert, update, delete on public.guide_progress from authenticated;
grant select on public.guide_progress to authenticated;

-- ghi "đã đọc / đã làm" cho chính mình
create or replace function public.guide_ack(p_kind text, p_items text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare m public.memberships; n int;
begin
  m := public._require_member();
  if p_kind not in ('news', 'onboard', 'seen') then raise exception 'Loại không hợp lệ.'; end if;
  insert into public.guide_progress(email, kind, item)
  select m.email, p_kind, left(x, 80) from unnest(coalesce(p_items, '{}')) x where length(btrim(x)) > 0
  limit 50
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- QL: danh sách tài khoản đang hoạt động (trong phạm vi được xem) + tiến độ đọc hướng dẫn
create or replace function public.guide_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý xem được.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'email', x.email, 'role', x.role, 'staff_id', x.staff_id,
      'name', (select s.name from public.staff s where s.id = x.staff_id),
      'first', (select g.at from public.guide_progress g where g.email = x.email and g.kind = 'seen' and g.item = 'first'),
      'news', coalesce((select jsonb_agg(g.item) from public.guide_progress g where g.email = x.email and g.kind = 'news'), '[]'::jsonb),
      'onboard', coalesce((select jsonb_agg(g.item) from public.guide_progress g where g.email = x.email and g.kind = 'onboard'), '[]'::jsonb))
      order by x.role, x.email)
    from public.memberships x
    where x.active and (m.role = 'owner' or x.staff_id is null or public.can_see_staff(x.staff_id))), '[]'::jsonb);
end $$;

revoke execute on function public.guide_ack(text, text[]), public.guide_overview() from public, anon;
grant execute on function public.guide_ack(text, text[]), public.guide_overview() to authenticated;
