-- B15: Báo cáo PG — PG (bộ phận trong PG_DEPTS, mặc định "PG") không tính sao, báo cáo số:
--   Hôm nay: số lượng, doanh thu · Bán kèm (PG_ADDONS: VAS, Bảo hiểm, PSDP, Tai nghe, Sim): số lượng + doanh thu từng món
--   Lũy kế tháng = số đầu kỳ (kind 'opening', nhập 1 lần khi bắt đầu giữa tháng) + các ngày đã báo cáo
-- Khi PG gửi, ghi thêm 1 dòng đánh dấu "📦 Báo cáo PG" (0 sao, status 'Báo cáo PG', compensation 'PG') vào daily_results
-- để mọi chỗ "đã / chưa báo cáo" (trang Báo cáo, Tổng quan, Telegram, Trợ lý, Nhân sự) tính PG là đã báo cáo,
-- mà không ảnh hưởng sao, tỉ lệ về số (chỉ tính status 'Về số' / 'Chưa về').

insert into public.settings(key, value) values
  ('PG_DEPTS', '["PG"]'::jsonb),
  ('PG_ADDONS', '["VAS", "Bảo hiểm", "PSDP", "Tai nghe", "Sim"]'::jsonb)
on conflict (key) do nothing;

create table if not exists public.pg_reports (
  id bigint generated always as identity primary key,
  staff_id text not null references public.staff(id) on update cascade on delete cascade,
  report_date date not null,                       -- ngày báo cáo; số đầu kỳ: ngày 1 của tháng
  kind text not null default 'day' check (kind in ('day', 'opening')),
  qty numeric not null default 0 check (qty >= 0),
  revenue numeric not null default 0 check (revenue >= 0),
  addons jsonb not null default '[]'::jsonb,       -- [{name, qty, revenue}]
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, report_date, kind)
);
create index if not exists pg_reports_date_idx on public.pg_reports(report_date);
alter table public.pg_reports enable row level security;
drop policy if exists pg_reports_read on public.pg_reports;
create policy pg_reports_read on public.pg_reports for select to authenticated using (public.can_see_staff(staff_id));
revoke all on public.pg_reports from anon;
revoke insert, update, delete, truncate on public.pg_reports from authenticated;
grant select on public.pg_reports to authenticated;

-- NV có thuộc bộ phận PG không
create or replace function public._is_pg(p_staff text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.id = p_staff and s.dept is not null
    and (coalesce((select value from public.settings where key = 'PG_DEPTS' and jsonb_typeof(value) = 'array'), '["PG"]'::jsonb) ? s.dept))
$$;
revoke execute on function public._is_pg(text) from public, anon, authenticated;

-- Tổng số lượng / doanh thu / bán kèm của các dòng trong tháng trước ngày p_date (gồm số đầu kỳ)
create or replace function public._pg_cum(p_staff text, p_date date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with m as (select date_trunc('month', p_date)::date d0),
  r as (select p.* from public.pg_reports p, m
        where p.staff_id = p_staff and p.report_date >= m.d0 and p.report_date < (m.d0 + interval '1 month')::date
          and (p.kind = 'opening' or p.report_date < p_date))
  select jsonb_build_object(
    'qty', coalesce((select sum(qty) from r), 0),
    'revenue', coalesce((select sum(revenue) from r), 0),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'qty', q, 'revenue', v) order by n) from (
        select a ->> 'name' n, sum(coalesce((a ->> 'qty')::numeric, 0)) q, sum(coalesce((a ->> 'revenue')::numeric, 0)) v
        from r cross join lateral jsonb_array_elements(r.addons) a group by 1) z), '[]'::jsonb))
$$;
revoke execute on function public._pg_cum(text, date) from public, anon, authenticated;

-- Form báo cáo PG
create or replace function public.pg_report_form(p_staff text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.memberships; v_m date := date_trunc('month', p_date)::date;
begin
  m := public._member_for_staff(p_staff);
  if not public._is_pg(p_staff) then raise exception 'Nhân viên này không thuộc bộ phận PG.'; end if;
  return jsonb_build_object(
    'addons', coalesce((select value from public.settings where key = 'PG_ADDONS' and jsonb_typeof(value) = 'array'), '["VAS", "Bảo hiểm", "PSDP", "Tai nghe", "Sim"]'::jsonb),
    'day', (select to_jsonb(p) from public.pg_reports p where p.staff_id = p_staff and p.report_date = p_date and p.kind = 'day'),
    'opening', (select to_jsonb(p) from public.pg_reports p where p.staff_id = p_staff and p.report_date = v_m and p.kind = 'opening'),
    'cum_before', public._pg_cum(p_staff, p_date),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', p.report_date, 'qty', p.qty, 'revenue', p.revenue, 'addons', p.addons) order by p.report_date desc)
              from public.pg_reports p where p.staff_id = p_staff and p.kind = 'day'
               and p.report_date >= v_m and p.report_date < (v_m + interval '1 month')::date), '[]'::jsonb),
    'locked', exists (select 1 from public.locked_dates where d = p_date));
end $$;
revoke execute on function public.pg_report_form(text, date) from public, anon;
grant execute on function public.pg_report_form(text, date) to authenticated;

-- Lưu báo cáo PG (kind 'day') hoặc số đầu kỳ của tháng (kind 'opening')
create or replace function public.pg_report_save(p_staff text, p_date date, p_qty numeric, p_revenue numeric,
                                                 p_addons jsonb default '[]'::jsonb, p_kind text default 'day')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_allowed jsonb; v_add jsonb := '[]'::jsonb; e jsonb; q numeric; v numeric; v_date date; v_names text[] := '{}';
begin
  m := public._member_for_staff(p_staff);
  if not public._is_pg(p_staff) then raise exception 'Nhân viên này không thuộc bộ phận PG.'; end if;
  if p_kind not in ('day', 'opening') then raise exception 'Loại báo cáo không hợp lệ.'; end if;
  if p_date is null or p_date > public.vn_today() then raise exception 'Ngày báo cáo không hợp lệ.'; end if;
  v_date := case when p_kind = 'opening' then date_trunc('month', p_date)::date else p_date end;
  if p_kind = 'day' and exists (select 1 from public.locked_dates where d = p_date) then
    raise exception 'Ngày % đã khoá chốt sổ.', to_char(p_date, 'DD/MM/YYYY');
  end if;
  if p_qty is null or p_revenue is null then raise exception 'Nhập số lượng và doanh thu (không bán được ghi 0).'; end if;
  if p_qty < 0 or p_revenue < 0 then raise exception 'Số lượng / doanh thu không được âm.'; end if;
  v_allowed := coalesce((select value from public.settings where key = 'PG_ADDONS' and jsonb_typeof(value) = 'array'), '["VAS", "Bảo hiểm", "PSDP", "Tai nghe", "Sim"]'::jsonb);
  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_addons) = 'array' then p_addons else '[]'::jsonb end) x loop
    if not (v_allowed ? coalesce(e ->> 'name', '')) then raise exception 'Món bán kèm không hợp lệ: %', coalesce(e ->> 'name', '?'); end if;
    if (e ->> 'name') = any(v_names) then raise exception 'Món bán kèm bị trùng: %', e ->> 'name'; end if;
    begin q := coalesce(nullif(e ->> 'qty', '')::numeric, 0); v := coalesce(nullif(e ->> 'revenue', '')::numeric, 0);
    exception when others then raise exception 'Số của món % không hợp lệ.', e ->> 'name'; end;
    if q < 0 or v < 0 then raise exception 'Số của món % không được âm.', e ->> 'name'; end if;
    v_names := v_names || (e ->> 'name');
    if q > 0 or v > 0 then v_add := v_add || jsonb_build_object('name', e ->> 'name', 'qty', q, 'revenue', v); end if;
  end loop;
  insert into public.pg_reports(staff_id, report_date, kind, qty, revenue, addons, created_by)
  values (p_staff, v_date, p_kind, p_qty, p_revenue, v_add, m.email)
  on conflict (staff_id, report_date, kind) do update
    set qty = excluded.qty, revenue = excluded.revenue, addons = excluded.addons, created_by = excluded.created_by, updated_at = now();
  if p_kind = 'day' then   -- dòng đánh dấu "đã báo cáo" (0 sao) cho các thống kê dùng daily_results
    delete from public.daily_results where staff_id = p_staff and report_date = p_date and compensation = 'PG';
    insert into public.daily_results(report_date, staff_id, staff_name, item_name, actual, rate_pct, star_change, status, compensation, submitted_by)
    values (p_date, p_staff, coalesce((select name from public.staff where id = p_staff), ''), '📦 Báo cáo PG', p_qty, null, 0, 'Báo cáo PG', 'PG', m.email);
  end if;
  insert into public.audit_log(actor, action, target, details)
  values (m.email, case when p_kind = 'day' then 'PG_REPORT' else 'PG_OPENING' end, p_staff,
          jsonb_build_object('date', v_date, 'qty', p_qty, 'revenue', p_revenue, 'addons', v_add));
  return jsonb_build_object('status', 'success',
    'message', case when p_kind = 'day' then 'Đã gửi báo cáo PG ngày ' || to_char(p_date, 'DD/MM') else 'Đã lưu số đầu kỳ tháng ' || to_char(v_date, 'MM/YYYY') end,
    'cum', public._pg_cum(p_staff, p_date + 1));
end $$;
revoke execute on function public.pg_report_save(text, date, numeric, numeric, jsonb, text) from public, anon;
grant execute on function public.pg_report_save(text, date, numeric, numeric, jsonb, text) to authenticated;
