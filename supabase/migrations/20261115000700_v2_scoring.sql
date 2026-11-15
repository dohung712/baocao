-- =====================================================================
-- Thi đua v2 — Xếp hạng điểm (Doanh thu 40% · Thi đua 40% · Phục vụ 20% − vi phạm),
-- doanh thu QĐ hằng ngày, target tháng, đánh giá phục vụ, vi phạm, điều chỉnh sao có lịch sử
-- =====================================================================

-- ---------- Bảng ----------
create table if not exists public.star_adjustments (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  delta integer not null,
  kind text not null default 'adjust' check (kind in ('adjust', 'reset')),
  reason text not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists star_adj_staff_idx on public.star_adjustments(staff_id, created_at desc);

create table if not exists public.revenue_entries (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  entry_date date not null,
  kind text not null default 'daily' check (kind in ('daily', 'adjust')),
  amount numeric not null,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists revenue_daily_once on public.revenue_entries(staff_id, entry_date) where kind = 'daily';
create index if not exists revenue_date_idx on public.revenue_entries(entry_date);

create table if not exists public.monthly_targets (
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  month date not null check (extract(day from month) = 1),
  revenue_target numeric check (revenue_target is null or revenue_target >= 0),
  items jsonb not null default '[]',            -- [{"name": "...", "target": 90}]
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (staff_id, month)
);

create table if not exists public.ratings (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  s5 integer not null default 0 check (s5 >= 0), s4 integer not null default 0 check (s4 >= 0),
  s3 integer not null default 0 check (s3 >= 0), s2 integer not null default 0 check (s2 >= 0),
  s1 integer not null default 0 check (s1 >= 0), complaints integer not null default 0 check (complaints >= 0),
  source text not null default 'QL' check (source in ('QL', 'NV')),
  note text,
  created_by text,
  updated_at timestamptz not null default now(),
  unique (staff_id, period_start, period_end)
);

create table if not exists public.violations (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  v_date date not null,
  type text not null,
  note text,
  points numeric not null default 2,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists violations_date_idx on public.violations(v_date);

-- Lịch sử mọi điều chỉnh liên quan điểm / doanh thu / sao
create table if not exists public.score_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text,
  staff_id text,
  kind text not null,           -- revenue | target | rating | violation | star | streak
  action text not null,
  detail jsonb not null default '{}',
  reason text
);
create index if not exists score_log_staff_idx on public.score_log(staff_id, at desc);

insert into public.settings(key, value) values
  ('W_REVENUE', '40'), ('W_CONTEST', '40'), ('W_SERVICE', '20'), ('VIOLATION_POINTS', '2'),
  ('RATING_DEDUCT', '{"s4":1,"s3":2,"s2":3,"s1":4,"complaints":5}'),
  ('REVENUE_UNIT', '"triệu đ"'),
  ('VIOLATION_TYPES', '["Sai quy trình bán hàng","Sai quy trình thu ngân / xuất hàng","Không đúng tác phong, đồng phục","Đi trễ / về sớm","Sai thông tin khách hàng","Khác"]'),
  ('HIDE', '{"employee":[],"manager":[]}')
on conflict (key) do nothing;
-- chuyển cài đặt ẩn trang cũ sang dạng mới
update public.settings set value = jsonb_build_object('employee', coalesce((select value from public.settings where key = 'HIDDEN_PAGES'), '[]'::jsonb), 'manager', '[]'::jsonb)
where key = 'HIDE' and value = '{"employee":[],"manager":[]}'::jsonb and exists (select 1 from public.settings where key = 'HIDDEN_PAGES' and jsonb_array_length(value) > 0);

-- ---------- RLS ----------
alter table public.star_adjustments enable row level security;
alter table public.revenue_entries enable row level security;
alter table public.monthly_targets enable row level security;
alter table public.ratings enable row level security;
alter table public.violations enable row level security;
alter table public.score_log enable row level security;
do $$
declare t text;
begin
  foreach t in array array['star_adjustments','revenue_entries','monthly_targets','ratings','violations','score_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_see_staff(staff_id))', t || '_read', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['star_adjustments','revenue_entries','monthly_targets','ratings','violations'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- Tổng sao: thêm điều chỉnh của quản lý ----------
create or replace function public.staff_total(p_staff text) returns integer
language sql stable security definer set search_path = '' as $$
  select s.base_star
    + coalesce((select sum(star_change)::int from public.daily_results where staff_id = s.id), 0)
    + coalesce((select sum(stars)::int from public.extra_proposals where staff_id = s.id and status = 'Đã duyệt'), 0)
    + coalesce((select sum(reward)::int from public.tiktok_submissions where staff_id = s.id), 0)
    + coalesce((select sum(delta)::int from public.star_adjustments where staff_id = s.id), 0)
  from public.staff s where s.id = p_staff
$$;
create or replace view public.staff_stars with (security_invoker = true) as
select s.*,
  s.base_star + coalesce(r.delta, 0) + coalesce(p.delta, 0) + coalesce(t.delta, 0) + coalesce(a.delta, 0) as total_star,
  coalesce(r.delta, 0) + coalesce(p.delta, 0) + coalesce(t.delta, 0) + coalesce(a.delta, 0) as delta_star
from public.staff s
left join (select staff_id, sum(star_change)::int delta from public.daily_results group by staff_id) r on r.staff_id = s.id
left join (select staff_id, sum(stars)::int delta from public.extra_proposals where status = 'Đã duyệt' group by staff_id) p on p.staff_id = s.id
left join (select staff_id, sum(reward)::int delta from public.tiktok_submissions group by staff_id) t on t.staff_id = s.id
left join (select staff_id, sum(delta)::int delta from public.star_adjustments group by staff_id) a on a.staff_id = s.id;
grant select on public.staff_stars to authenticated;

-- Chủ quản chỉnh tổng sao: ghi thành 1 dòng điều chỉnh (có lịch sử) thay vì sửa sao gốc
create or replace function public.set_staff_total(p_staff text, p_total integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_old int;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') or not public.can_see_staff(p_staff) then raise exception 'Không đủ quyền chỉnh sao.'; end if;
  v_old := public.staff_total(p_staff);
  if v_old is null then raise exception 'Nhân viên không tồn tại.'; end if;
  if p_total <> v_old then
    insert into public.star_adjustments(staff_id, delta, kind, reason, created_by) values (p_staff, p_total - v_old, 'adjust', 'Chỉnh tổng sao ' || v_old || ' → ' || p_total, m.email);
    insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, p_staff, 'star', 'set_total', jsonb_build_object('from', v_old, 'to', p_total));
  end if;
  return jsonb_build_object('status', 'success', 'total_star', p_total);
end $$;

-- Cộng / trừ sao nhiều nhân viên cùng lúc
create or replace function public.adjust_stars(p_staffs text[], p_delta integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; s text; n int := 0;
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý được chỉnh sao.'; end if;
  if coalesce(p_delta, 0) = 0 then raise exception 'Nhập số sao cộng / trừ.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Nhập lý do.'; end if;
  foreach s in array coalesce(p_staffs, '{}') loop
    continue when not public.can_see_staff(s);
    insert into public.star_adjustments(staff_id, delta, kind, reason, created_by) values (s, p_delta, 'adjust', btrim(p_reason), m.email);
    insert into public.score_log(actor, staff_id, kind, action, detail, reason) values (m.email, s, 'star', 'adjust', jsonb_build_object('delta', p_delta), btrim(p_reason));
    n := n + 1;
  end loop;
  return jsonb_build_object('status', 'success', 'message', format('Đã %s %s⭐ cho %s nhân viên', case when p_delta > 0 then 'cộng' else 'trừ' end, abs(p_delta), n));
end $$;

-- Reset kỳ mới: đưa tổng sao của các nhân viên về cùng một mức (ghi lịch sử từng người)
create or replace function public.reset_stars(p_staffs text[], p_value integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; s text; v_old int; n int := 0;
begin
  m := public._require_member();
  if m.role <> 'owner' then raise exception 'Chỉ chủ quản được reset sao.'; end if;
  foreach s in array coalesce(p_staffs, '{}') loop
    v_old := public.staff_total(s);
    continue when v_old is null or v_old = p_value;
    insert into public.star_adjustments(staff_id, delta, kind, reason, created_by)
    values (s, p_value - v_old, 'reset', coalesce(nullif(btrim(p_reason), ''), 'Reset kỳ mới') || ' (' || v_old || ' → ' || p_value || ')', m.email);
    insert into public.score_log(actor, staff_id, kind, action, detail, reason) values (m.email, s, 'star', 'reset', jsonb_build_object('from', v_old, 'to', p_value), p_reason);
    n := n + 1;
  end loop;
  return jsonb_build_object('status', 'success', 'message', format('Đã reset sao %s nhân viên về %s⭐', n, p_value));
end $$;

create or replace function public.reset_streaks(p_staffs text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; s text; n int := 0;
begin
  m := public._manager_scope(null, null);
  foreach s in array coalesce(p_staffs, '{}') loop
    continue when not public.can_see_staff(s);
    update public.staff set reset_date = public.vn_today(), updated_at = now() where id = s;
    insert into public.score_log(actor, staff_id, kind, action) values (m.email, s, 'streak', 'reset');
    n := n + 1;
  end loop;
  return jsonb_build_object('status', 'success', 'message', format('Đã reset chuỗi %s nhân viên', n));
end $$;

-- ---------- Doanh thu QĐ ----------
-- Nhập DT ngày: nhân viên tự nhập cho mình (ngày chưa khoá, trong tháng hiện tại hoặc tháng trước); quản lý nhập cho mọi người
create or replace function public.save_revenue(p_staff text, p_date date, p_amount numeric, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_old numeric;
begin
  m := public._member_for_staff(p_staff);
  if p_date > public.vn_today() then raise exception 'Không nhập doanh thu cho ngày tương lai.'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Doanh thu phải là số không âm.'; end if;
  if m.role = 'employee' then
    if exists (select 1 from public.locked_dates where d = p_date) then raise exception 'Ngày % đã khoá sổ.', to_char(p_date, 'DD/MM'); end if;
    if p_date < date_trunc('month', public.vn_today() - 5)::date then raise exception 'Chỉ nhập được doanh thu của tháng hiện tại.'; end if;
  end if;
  select amount into v_old from public.revenue_entries where staff_id = p_staff and entry_date = p_date and kind = 'daily';
  if v_old is not distinct from p_amount then return jsonb_build_object('status', 'success', 'changed', false); end if;
  insert into public.revenue_entries(staff_id, entry_date, kind, amount, created_by) values (p_staff, p_date, 'daily', p_amount, m.email)
  on conflict (staff_id, entry_date) where kind = 'daily' do update set amount = excluded.amount, updated_at = now(), created_by = excluded.created_by;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason)
  values (m.email, p_staff, 'revenue', case when v_old is null then 'enter' else 'edit' end, jsonb_build_object('date', p_date, 'from', v_old, 'to', p_amount), p_reason);
  return jsonb_build_object('status', 'success', 'changed', true);
end $$;

-- Điều chỉnh lũy kế (cộng / trừ) — chỉ quản lý, bắt buộc lý do
create or replace function public.adjust_revenue(p_staff text, p_date date, p_delta numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  m := public._manager_scope(p_staff, null);
  if coalesce(p_delta, 0) = 0 then raise exception 'Nhập số điều chỉnh.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Nhập lý do điều chỉnh.'; end if;
  insert into public.revenue_entries(staff_id, entry_date, kind, amount, note, created_by) values (p_staff, coalesce(p_date, public.vn_today()), 'adjust', p_delta, btrim(p_reason), m.email);
  insert into public.score_log(actor, staff_id, kind, action, detail, reason) values (m.email, p_staff, 'revenue', 'adjust', jsonb_build_object('date', coalesce(p_date, public.vn_today()), 'delta', p_delta), btrim(p_reason));
  return jsonb_build_object('status', 'success');
end $$;

create or replace function public.delete_revenue_adjust(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.revenue_entries;
begin
  select * into r from public.revenue_entries where id = p_id and kind = 'adjust';
  if r.id is null then raise exception 'Không tìm thấy điều chỉnh.'; end if;
  m := public._manager_scope(r.staff_id, null);
  delete from public.revenue_entries where id = p_id;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason) values (m.email, r.staff_id, 'revenue', 'delete_adjust', jsonb_build_object('date', r.entry_date, 'delta', r.amount), r.note);
  return jsonb_build_object('status', 'success');
end $$;

-- ---------- Target tháng (DT + môn thi đua) ----------
create or replace function public.save_monthly_target(p_staff text, p_month date, p_revenue numeric, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_month date := date_trunc('month', p_month)::date; v_old public.monthly_targets; v_items jsonb;
begin
  m := public._manager_scope(p_staff, null);
  select coalesce(jsonb_agg(jsonb_build_object('name', btrim(e ->> 'name'), 'target', (e ->> 'target')::numeric)), '[]'::jsonb) into v_items
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
  where btrim(coalesce(e ->> 'name', '')) <> '' and (e ->> 'target')::numeric > 0;
  select * into v_old from public.monthly_targets where staff_id = p_staff and month = v_month;
  insert into public.monthly_targets(staff_id, month, revenue_target, items, updated_by) values (p_staff, v_month, p_revenue, v_items, m.email)
  on conflict (staff_id, month) do update set revenue_target = excluded.revenue_target, items = excluded.items, updated_by = excluded.updated_by, updated_at = now();
  if v_old.staff_id is null or v_old.revenue_target is distinct from p_revenue or v_old.items <> v_items then
    insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, p_staff, 'target', 'save',
      jsonb_build_object('month', v_month, 'revenue_from', v_old.revenue_target, 'revenue_to', p_revenue, 'items', v_items));
  end if;
  return jsonb_build_object('status', 'success');
end $$;

-- ---------- Phục vụ ----------
create or replace function public.save_rating(p_staff text, p_start date, p_end date, p_counts jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_old public.ratings; g int[];
begin
  m := public._member_for_staff(p_staff);
  if p_end < p_start then raise exception 'Khoảng ngày không hợp lệ.'; end if;
  if p_start > public.vn_today() then raise exception 'Chưa tới kỳ này.'; end if;
  g := array[coalesce((p_counts ->> 's5')::int, 0), coalesce((p_counts ->> 's4')::int, 0), coalesce((p_counts ->> 's3')::int, 0),
             coalesce((p_counts ->> 's2')::int, 0), coalesce((p_counts ->> 's1')::int, 0), coalesce((p_counts ->> 'complaints')::int, 0)];
  if exists (select 1 from unnest(g) x where x < 0) then raise exception 'Số lượt không được âm.'; end if;
  if m.role = 'employee' and g[6] > 0 then raise exception 'Khiếu nại do quản lý ghi nhận.'; end if;
  select * into v_old from public.ratings where staff_id = p_staff and period_start = p_start and period_end = p_end;
  if m.role = 'employee' and v_old.id is not null and v_old.source = 'QL' then raise exception 'Kỳ này quản lý đã nhập, nhờ quản lý sửa nếu sai.'; end if;
  insert into public.ratings(staff_id, period_start, period_end, s5, s4, s3, s2, s1, complaints, source, note, created_by)
  values (p_staff, p_start, p_end, g[1], g[2], g[3], g[4], g[5], case when m.role = 'employee' then coalesce(v_old.complaints, 0) else g[6] end,
          case when m.role = 'employee' then 'NV' else 'QL' end, p_note, m.email)
  on conflict (staff_id, period_start, period_end) do update set s5 = excluded.s5, s4 = excluded.s4, s3 = excluded.s3, s2 = excluded.s2, s1 = excluded.s1,
    complaints = excluded.complaints, source = excluded.source, note = excluded.note, created_by = excluded.created_by, updated_at = now();
  insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, p_staff, 'rating', case when v_old.id is null then 'enter' else 'edit' end,
    jsonb_build_object('start', p_start, 'end', p_end, 'from', case when v_old.id is null then null else jsonb_build_object('s5', v_old.s5, 's4', v_old.s4, 's3', v_old.s3, 's2', v_old.s2, 's1', v_old.s1, 'complaints', v_old.complaints) end,
      'to', jsonb_build_object('s5', g[1], 's4', g[2], 's3', g[3], 's2', g[4], 's1', g[5], 'complaints', g[6])));
  return jsonb_build_object('status', 'success');
end $$;

create or replace function public.delete_rating(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; r public.ratings;
begin
  select * into r from public.ratings where id = p_id;
  if r.id is null then raise exception 'Không tìm thấy.'; end if;
  m := public._manager_scope(r.staff_id, null);
  delete from public.ratings where id = p_id;
  insert into public.score_log(actor, staff_id, kind, action, detail) values (m.email, r.staff_id, 'rating', 'delete', to_jsonb(r) - 'id');
  return jsonb_build_object('status', 'success');
end $$;

-- ---------- Vi phạm ----------
create or replace function public.add_violation(p_staff text, p_date date, p_type text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_pts numeric := public.setting_num('VIOLATION_POINTS', 2);
begin
  m := public._manager_scope(p_staff, null);
  if btrim(coalesce(p_type, '')) = '' then raise exception 'Chọn loại lỗi.'; end if;
  insert into public.violations(staff_id, v_date, type, note, points, created_by) values (p_staff, coalesce(p_date, public.vn_today()), btrim(p_type), nullif(btrim(coalesce(p_note, '')), ''), v_pts, m.email);
  insert into public.score_log(actor, staff_id, kind, action, detail, reason) values (m.email, p_staff, 'violation', 'add', jsonb_build_object('date', p_date, 'type', p_type, 'points', v_pts), p_note);
  return jsonb_build_object('status', 'success', 'message', format('Đã ghi lỗi (−%s điểm)', v_pts));
end $$;

create or replace function public.delete_violation(p_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v public.violations;
begin
  select * into v from public.violations where id = p_id;
  if v.id is null then raise exception 'Không tìm thấy.'; end if;
  m := public._manager_scope(v.staff_id, null);
  delete from public.violations where id = p_id;
  insert into public.score_log(actor, staff_id, kind, action, detail, reason) values (m.email, v.staff_id, 'violation', 'delete', jsonb_build_object('date', v.v_date, 'type', v.type, 'points', v.points), p_reason);
  return jsonb_build_object('status', 'success');
end $$;

-- ---------- Bảng điểm xếp hạng ----------
-- Khoảng ngày nằm trong 1 tháng. p_full = false: target tháng chia theo số ngày của khoảng (xem tiến độ); true: so với target cả tháng
create or replace function public.score_board(p_from date, p_to date, p_full boolean default false)
returns table (staff_id text, name text, dept text,
  revenue numeric, revenue_target numeric, rev_pct numeric, rev_score numeric,
  items_total int, items_done numeric, items_detail jsonb, contest_score numeric,
  s5 int, s4 int, s3 int, s2 int, s1 int, complaints int, service_raw numeric, service_score numeric,
  violations int, violation_points numeric, total numeric, rank int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.memberships; v_all boolean; v_month date := date_trunc('month', p_from)::date;
  v_f numeric; d jsonb; w_r numeric; w_c numeric; w_s numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then v_all := true;   -- máy chủ gửi Telegram
  else
    m := public._require_member();
    v_all := m.role = 'owner' or public.setting_text('EMPLOYEE_SEE_LEADERBOARD', 'false') = 'true';
  end if;
  v_f := case when p_full then 1 else least(1, (p_to - p_from + 1)::numeric / extract(day from (v_month + interval '1 month' - interval '1 day'))) end;
  select value into d from public.settings where key = 'RATING_DEDUCT';
  d := coalesce(d, '{"s4":1,"s3":2,"s2":3,"s1":4,"complaints":5}'::jsonb);
  w_r := public.setting_num('W_REVENUE', 40); w_c := public.setting_num('W_CONTEST', 40); w_s := public.setting_num('W_SERVICE', 20);
  return query
  with s as (
    select x.* from public.staff x where not x.hidden          -- xếp hạng trên toàn siêu thị, lọc phạm vi xem ở cuối
  ), tg as (
    select t.* from public.monthly_targets t where t.month = v_month
  ), rev as (
    select r.staff_id, sum(r.amount) amt from public.revenue_entries r where r.entry_date between p_from and p_to group by r.staff_id
  ), it as (
    select tg.staff_id, e ->> 'name' iname, (e ->> 'target')::numeric * v_f itarget,
      coalesce((select sum(dr.actual) from public.daily_results dr where dr.staff_id = tg.staff_id and dr.item_name = e ->> 'name'
                 and dr.report_date between p_from and p_to and dr.status in ('Về số', 'Chưa về')), 0) iact
    from tg cross join lateral jsonb_array_elements(tg.items) e
  ), con as (
    select it.staff_id, count(*)::int n, sum(least(1, it.iact / nullif(it.itarget, 0))) done,
      jsonb_agg(jsonb_build_object('name', it.iname, 'target', round(it.itarget, 2), 'actual', it.iact, 'pct', round(100 * it.iact / nullif(it.itarget, 0)))) det
    from it group by it.staff_id
  ), rt as (
    select r.staff_id, sum(r.s5)::int a5, sum(r.s4)::int a4, sum(r.s3)::int a3, sum(r.s2)::int a2, sum(r.s1)::int a1, sum(r.complaints)::int ak
    from public.ratings r where r.period_end >= p_from and r.period_start <= p_to group by r.staff_id
  ), vi as (
    select v.staff_id, count(*)::int n, sum(v.points) pts from public.violations v where v.v_date between p_from and p_to group by v.staff_id
  ), base as (
    select s.id, s.name, s.dept, coalesce(rev.amt, 0) revenue, tg.revenue_target * v_f rtarget,
      coalesce(con.n, 0) n, coalesce(con.done, 0) done, coalesce(con.det, '[]'::jsonb) det,
      coalesce(rt.a5, 0) a5, coalesce(rt.a4, 0) a4, coalesce(rt.a3, 0) a3, coalesce(rt.a2, 0) a2, coalesce(rt.a1, 0) a1, coalesce(rt.ak, 0) ak,
      coalesce(rt.a5, 0) - coalesce(rt.a4, 0) * coalesce((d ->> 's4')::numeric, 1) - coalesce(rt.a3, 0) * coalesce((d ->> 's3')::numeric, 2)
        - coalesce(rt.a2, 0) * coalesce((d ->> 's2')::numeric, 3) - coalesce(rt.a1, 0) * coalesce((d ->> 's1')::numeric, 4)
        - coalesce(rt.ak, 0) * coalesce((d ->> 'complaints')::numeric, 5) sraw,
      coalesce(vi.n, 0) vn, coalesce(vi.pts, 0) vpts
    from s left join tg on tg.staff_id = s.id left join rev on rev.staff_id = s.id left join con on con.staff_id = s.id
      left join rt on rt.staff_id = s.id left join vi on vi.staff_id = s.id
  ), mx as (
    -- người phục vụ cao nhất toàn siêu thị (kể cả ngoài phạm vi xem) = đủ điểm
    select greatest(max(sraw), 0) top from (
      select coalesce(sum(r.s5), 0) - coalesce(sum(r.s4), 0) * coalesce((d ->> 's4')::numeric, 1) - coalesce(sum(r.s3), 0) * coalesce((d ->> 's3')::numeric, 2)
        - coalesce(sum(r.s2), 0) * coalesce((d ->> 's2')::numeric, 3) - coalesce(sum(r.s1), 0) * coalesce((d ->> 's1')::numeric, 4)
        - coalesce(sum(r.complaints), 0) * coalesce((d ->> 'complaints')::numeric, 5) sraw
      from public.ratings r join public.staff x on x.id = r.staff_id and not x.hidden
      where r.period_end >= p_from and r.period_start <= p_to group by r.staff_id) z
  ), sc as (
    select b.*, round(100 * b.revenue / nullif(b.rtarget, 0), 1) rpct,
      round(w_r * least(1, coalesce(b.revenue / nullif(b.rtarget, 0), 0)), 2) rscore,
      round(case when b.n > 0 then w_c * b.done / b.n else 0 end, 2) cscore,
      round(case when mx.top > 0 then w_s * greatest(b.sraw, 0) / mx.top else 0 end, 2) sscore
    from base b cross join mx
  )
  , fin as (
    select sc.id, sc.name, sc.dept, sc.revenue, round(sc.rtarget, 2) rt, sc.rpct, sc.rscore, sc.n, round(sc.done, 2) dn, sc.det, sc.cscore,
      sc.a5, sc.a4, sc.a3, sc.a2, sc.a1, sc.ak, sc.sraw, sc.sscore, sc.vn, sc.vpts,
      round(sc.rscore + sc.cscore + sc.sscore - sc.vpts, 2) tot,
      (rank() over (order by sc.rscore + sc.cscore + sc.sscore - sc.vpts desc))::int rk
    from sc
  )
  select fin.id, fin.name, fin.dept, fin.revenue, fin.rt, fin.rpct, fin.rscore, fin.n, fin.dn, fin.det, fin.cscore,
    fin.a5, fin.a4, fin.a3, fin.a2, fin.a1, fin.ak, fin.sraw, fin.sscore, fin.vn, fin.vpts, fin.tot, fin.rk
  from fin where v_all or public.can_see_staff(fin.id)
  order by fin.tot desc, fin.name;
end $$;

grant execute on function public.adjust_stars(text[], integer, text), public.reset_stars(text[], integer, text), public.reset_streaks(text[]),
  public.save_revenue(text, date, numeric, text), public.adjust_revenue(text, date, numeric, text), public.delete_revenue_adjust(bigint),
  public.save_monthly_target(text, date, numeric, jsonb), public.save_rating(text, date, date, jsonb, text), public.delete_rating(bigint),
  public.add_violation(text, date, text, text), public.delete_violation(bigint, text), public.score_board(date, date, boolean) to authenticated;

-- Chép lại dữ liệu bản cũ cần xoá cả dữ liệu mới (điều chỉnh sao, doanh thu…) để tổng sao khớp
create or replace function public.migrate_legacy_all()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from public.star_adjustments where true;
  delete from public.revenue_entries where true;
  delete from public.monthly_targets where true;
  delete from public.ratings where true;
  delete from public.violations where true;
  return public.migrate_legacy();
end $$;
revoke execute on function public.migrate_legacy_all() from public, anon, authenticated;
