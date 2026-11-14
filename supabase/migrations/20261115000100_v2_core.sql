-- =====================================================================
-- Thi đua v2 — cấu trúc dữ liệu dạng bảng (thay cho 1 khối JSON app_state)
-- Bảng cũ (app_state, memberships, audit_log, change_requests) giữ nguyên.
-- =====================================================================

-- ---------- Tiện ích thời gian VN ----------
create or replace function public.vn_now() returns timestamp
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Ho_Chi_Minh') $$;
create or replace function public.vn_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- ---------- Bảng ----------
create table if not exists public.staff (
  id text primary key,
  name text not null,
  dept text not null default '',                 -- Bộ phận / nhóm (khớp memberships.stores)
  base_star integer not null default 0,          -- Sao gốc: tổng sao = sao gốc + biến động
  reset_date date,                               -- Ngày reset chuỗi
  assigned_items text[] not null default '{}',   -- Môn riêng (rỗng = dùng bộ môn của bộ phận)
  hidden boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id bigint generated always as identity primary key,
  store text not null default 'Chung',           -- 'Chung' hoặc tên bộ phận
  name text not null,
  target numeric not null default 1 check (target > 0),
  bonus_star integer not null default 200,
  penalty_star integer not null default 100,
  is_x2 boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store, name)
);

create table if not exists public.daily_results (
  id bigint generated always as identity primary key,
  report_date date not null,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  staff_name text not null default '',
  item_name text not null,
  actual numeric not null default 0,
  rate_pct numeric,                              -- % đạt (null với dòng kỷ luật)
  star_change integer not null default 0,
  status text not null,                          -- Về số | Chưa về | Nộp trễ | ...
  compensation text not null default 'DUNG_SAO', -- DUNG_SAO | TANG_CA | GHI_NHAN | PHAT_TRE | TIKTOK_PHAT
  submitted_by text,
  submitted_at timestamptz not null default now()
);
create index if not exists daily_results_date_idx on public.daily_results(report_date);
create index if not exists daily_results_staff_date_idx on public.daily_results(staff_id, report_date);
create index if not exists daily_results_staff_item_idx on public.daily_results(staff_id, item_name, report_date desc);

create table if not exists public.extra_proposals (
  id bigint generated always as identity primary key,
  report_date date not null,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  staff_name text not null default '',
  content text not null,
  stars integer not null default 0,
  status text not null default 'Chờ duyệt' check (status in ('Chờ duyệt','Đã duyệt','Từ chối')),
  created_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz
);
create index if not exists extra_proposals_staff_idx on public.extra_proposals(staff_id, report_date);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Cài đặt bí mật (token Telegram, khoá cron): trình duyệt không đọc được
create table if not exists public.private_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.locked_dates (
  d date primary key,
  locked_by text,
  locked_at timestamptz not null default now()
);

create table if not exists public.store_contest (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null default '',
  actual numeric not null default 0,
  target numeric not null default 0,
  rate_month numeric not null default 0,
  forecast numeric not null default 0,
  rank text not null default '-',
  branch text not null default 'TỔNG',
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.store_contest_snapshots (
  snap_date date primary key,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by text
);

create table if not exists public.notify_log (
  id bigint generated always as identity primary key,
  kind text not null,                 -- daily | weekly | test
  period text not null,               -- 2026-11-14 | 2026-W46
  ok boolean not null,
  detail text,
  sent_at timestamptz not null default now()
);
create unique index if not exists notify_log_once on public.notify_log(kind, period) where ok and kind <> 'test';

-- ---------- Cài đặt mặc định ----------
insert into public.settings(key, value) values
  ('STREAK_OVERTIME', '3'), ('STREAK_PENALTY_STAR', '5'), ('AUTO_STREAK_ENABLED', '"ON"'),
  ('DOUBLE_BONUS_RATE', '150'),
  ('PEN_T2_MIN', '4'), ('PEN_T3_MIN', '6'), ('PEN_T4_MIN', '8'),
  ('PEN_M1', '1'), ('PEN_M2', '1.5'), ('PEN_M3', '2'), ('PEN_M4', '5'),
  ('ITEM_RULES', '[]'),
  ('CUTOFF_TIME', '"22:20"'), ('LATE_STEP', '100'),
  ('STORE_NAME', '"Siêu thị 351 Nguyễn Hữu Thọ"'),
  ('EMPLOYEE_SEE_LEADERBOARD', 'false'),
  ('NOTIFY_ENABLED', 'false'), ('NOTIFY_CHAT_IDS', '[]'),
  ('NOTIFY_DAILY_TIME', '"22:35"'), ('NOTIFY_WEEKLY_DOW', '0'), ('NOTIFY_WEEKLY_TIME', '"22:45"')
on conflict (key) do nothing;

-- ---------- Quyền ----------
create or replace function public.app_member() returns public.memberships
language sql stable security definer set search_path = '' as $$
  select m.* from public.memberships m
  where m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.active
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce((public.app_member()).role = 'owner', false) $$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce((public.app_member()).role in ('owner','manager'), false) $$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$ select (public.app_member()).email is not null $$;
create or replace function public.can_see_staff(p_staff text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case m.role
    when 'owner' then true
    when 'manager' then exists (select 1 from public.staff s where s.id = p_staff and s.dept = any(m.stores))
    when 'employee' then m.staff_id = p_staff
    else false end
  from (select * from public.app_member()) m
$$;

create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language plpgsql stable set search_path = '' as $$
declare v jsonb; n numeric;
begin
  select value into v from public.settings where key = p_key;
  if v is null or v = 'null'::jsonb or v = '""'::jsonb then return p_default; end if;
  begin n := (v #>> '{}')::numeric; exception when others then return p_default; end;
  if n is null or n < 0 then return p_default; end if;
  return n;
end $$;
create or replace function public.setting_text(p_key text, p_default text) returns text
language sql stable set search_path = '' as $$
  select coalesce((select nullif(value #>> '{}', '') from public.settings where key = p_key), p_default)
$$;

create or replace function public.is_after_cutoff(p_date date, p_at timestamptz default now()) returns boolean
language sql stable set search_path = '' as $$
  select p_date < (p_at at time zone 'Asia/Ho_Chi_Minh')::date
      or (p_date = (p_at at time zone 'Asia/Ho_Chi_Minh')::date
          and to_char(p_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') > public.setting_text('CUTOFF_TIME', '22:20'))
$$;

-- ---------- Tổng sao (tính trực tiếp, không bao giờ lệch) ----------
create or replace view public.staff_stars with (security_invoker = true) as
select s.*,
  s.base_star + coalesce(r.delta, 0) + coalesce(p.delta, 0) as total_star,
  coalesce(r.delta, 0) + coalesce(p.delta, 0) as delta_star
from public.staff s
left join (select staff_id, sum(star_change)::int delta from public.daily_results group by staff_id) r on r.staff_id = s.id
left join (select staff_id, sum(stars)::int delta from public.extra_proposals where status = 'Đã duyệt' group by staff_id) p on p.staff_id = s.id;

create or replace function public.staff_total(p_staff text) returns integer
language sql stable security definer set search_path = '' as $$
  select s.base_star
    + coalesce((select sum(star_change)::int from public.daily_results where staff_id = s.id), 0)
    + coalesce((select sum(stars)::int from public.extra_proposals where staff_id = s.id and status = 'Đã duyệt'), 0)
  from public.staff s where s.id = p_staff
$$;

-- ---------- RLS ----------
alter table public.staff enable row level security;
alter table public.items enable row level security;
alter table public.daily_results enable row level security;
alter table public.extra_proposals enable row level security;
alter table public.settings enable row level security;
alter table public.private_settings enable row level security;
alter table public.locked_dates enable row level security;
alter table public.store_contest enable row level security;
alter table public.store_contest_snapshots enable row level security;
alter table public.notify_log enable row level security;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated using (public.can_see_staff(id));
drop policy if exists staff_owner_write on public.staff;
create policy staff_owner_write on public.staff for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists items_read on public.items;
create policy items_read on public.items for select to authenticated using (public.is_member());
drop policy if exists items_owner_write on public.items;
create policy items_owner_write on public.items for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists results_read on public.daily_results;
create policy results_read on public.daily_results for select to authenticated using (public.can_see_staff(staff_id));

drop policy if exists proposals_read on public.extra_proposals;
create policy proposals_read on public.extra_proposals for select to authenticated using (public.can_see_staff(staff_id));

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.is_member());
drop policy if exists settings_owner_write on public.settings;
create policy settings_owner_write on public.settings for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists locked_read on public.locked_dates;
create policy locked_read on public.locked_dates for select to authenticated using (public.is_member());
drop policy if exists locked_manager_write on public.locked_dates;
create policy locked_manager_write on public.locked_dates for all to authenticated using (public.is_manager()) with check (public.is_manager());

drop policy if exists contest_read on public.store_contest;
create policy contest_read on public.store_contest for select to authenticated using (public.is_member());
drop policy if exists snapshots_read on public.store_contest_snapshots;
create policy snapshots_read on public.store_contest_snapshots for select to authenticated using (public.is_member());

drop policy if exists notify_log_read on public.notify_log;
create policy notify_log_read on public.notify_log for select to authenticated using (public.is_manager());

-- memberships: mỗi người đọc được dòng của mình; chủ quản đọc/sửa tất cả
drop policy if exists memberships_self on public.memberships;
create policy memberships_self on public.memberships for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_owner());
drop policy if exists memberships_owner_write on public.memberships;
create policy memberships_owner_write on public.memberships for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists change_requests_read on public.change_requests;
create policy change_requests_read on public.change_requests for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or (public.is_manager() and public.can_see_staff(staff_id)));

drop policy if exists audit_owner_read on public.audit_log;
create policy audit_owner_read on public.audit_log for select to authenticated using (public.is_owner());

grant select on public.staff, public.items, public.daily_results, public.extra_proposals, public.settings,
  public.locked_dates, public.store_contest, public.store_contest_snapshots, public.notify_log,
  public.memberships, public.change_requests, public.audit_log, public.staff_stars to authenticated;
grant insert, update, delete on public.staff, public.items, public.settings, public.locked_dates, public.memberships to authenticated;
revoke all on public.private_settings from anon, authenticated;
revoke insert, update, delete on public.daily_results, public.extra_proposals, public.store_contest,
  public.store_contest_snapshots, public.notify_log, public.change_requests, public.audit_log from authenticated;
revoke all on public.staff, public.items, public.daily_results, public.extra_proposals, public.settings,
  public.locked_dates, public.store_contest, public.store_contest_snapshots, public.notify_log, public.staff_stars from anon;
