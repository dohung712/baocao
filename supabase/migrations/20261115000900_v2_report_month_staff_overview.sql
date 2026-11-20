-- B1: form báo cáo hiện lũy kế tháng / target tháng từng môn (NV hiểu target ngày lẻ như 0,02 nghĩa là gì)
-- F1b: Nhân sự 360° — số ngày đã báo cáo, ngày OFF, nộp trễ, vi phạm, lần báo cáo gần nhất, có quyền vào tool

-- ---------- 1) report_form: thêm monthTarget, monthDone (lũy kế đến hết hôm qua, cùng cách tính với Cập nhật lũy kế) ----------
create or replace function public.report_form(p_staff text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_m date := date_trunc('month', p_date)::date;
begin
  perform public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'target', i.target, 'bonus', i.bonus_star,
              'penalty', i.penalty_star, 'isX2', i.is_x2, 'isX3', i.is_x3, 'streak', public._item_streak(p_staff, i.name, p_date),
              'noPen', (i.penalty_star <= 0 or public._item_no_pen(p_staff, i.name)),
              'monthTarget', (select (e ->> 'target')::numeric
                                from public.monthly_targets t
                                cross join lateral jsonb_array_elements(case when jsonb_typeof(t.items) = 'array' then t.items else '[]'::jsonb end) e
                               where t.staff_id = p_staff and t.month = v_m and btrim(e ->> 'name') = i.name limit 1),
              'monthDone', public._cum_tool(p_staff, i.name, v_m, p_date - 1)))
              from public._staff_items(p_staff, p_date) i), '[]'::jsonb),
    'existing', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.daily_results r where r.staff_id = p_staff and r.report_date = p_date), '[]'::jsonb),
    'proposal', (select to_jsonb(p) from public.extra_proposals p where p.staff_id = p_staff and p.report_date = p_date order by id limit 1),
    'locked', exists (select 1 from public.locked_dates where d = p_date),
    'after_cutoff', public.is_after_cutoff(p_date),
    'total_star', public.staff_total(p_staff)
  ) into v;
  return v;
end $$;
revoke execute on function public.report_form(text, date) from public, anon;
grant execute on function public.report_form(text, date) to authenticated;

-- ---------- 2) staff_overview: số liệu nhân sự theo tháng (quản lý / chủ quản, trong phạm vi can_see_staff) ----------
create or replace function public.staff_overview(p_month date default null)
returns table (staff_id text, report_days int, off_days int, days_passed int, late int,
               violations int, vio_points numeric, last_report date, has_access boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.memberships;
  v_m date := date_trunc('month', coalesce(p_month, public.vn_today()))::date;
  v_end date := least((date_trunc('month', coalesce(p_month, public.vn_today())) + interval '1 month - 1 day')::date, public.vn_today());
begin
  m := public._require_member();
  if m.role not in ('owner', 'manager') then raise exception 'Chỉ quản lý xem được số liệu nhân sự.'; end if;
  -- Số ngày tính từ ngày báo cáo đầu tiên của NV (NV mới / ngày bắt đầu dùng v2) để tỷ lệ báo cáo không bị thấp oan
  return query
  select s.id,
    (select count(distinct dr.report_date)::int from public.daily_results dr
      where dr.staff_id = s.id and dr.report_date between v_m and v_end and coalesce(dr.compensation, '') not in ('PHAT_TRE', 'TIKTOK_PHAT')),
    (select count(*)::int from public.busy b where b.staff_id = s.id and b.type = 'OFF' and b.busy_date between f.st and v_end),
    greatest(0, v_end - f.st + 1)::int,
    (select count(*)::int from public.daily_results dr where dr.staff_id = s.id and dr.report_date between v_m and v_end and dr.compensation = 'PHAT_TRE'),
    (select count(*)::int from public.violations v where v.staff_id = s.id and v.v_date between v_m and v_end),
    (select coalesce(sum(v.points), 0) from public.violations v where v.staff_id = s.id and v.v_date between v_m and v_end),
    (select max(dr.report_date) from public.daily_results dr where dr.staff_id = s.id and coalesce(dr.compensation, '') not in ('PHAT_TRE', 'TIKTOK_PHAT')),
    exists (select 1 from public.memberships mm where mm.staff_id = s.id and mm.active)
  from public.staff s
  cross join lateral (select greatest(v_m, coalesce((select min(dr.report_date) from public.daily_results dr where dr.staff_id = s.id), v_m)) st) f
  where public.can_see_staff(s.id);
end $$;
revoke execute on function public.staff_overview(date) from public, anon;
grant execute on function public.staff_overview(date) to authenticated;
