-- =====================================================================
-- F2: môn X3 (đạt ≥ TRIPLE_BONUS_RATE% → x3, ≥ DOUBLE_BONUS_RATE% → x2)
-- C10: NV xem BXH điểm toàn siêu thị (SCORE_SEE_ALL), chi tiết DT/môn chỉ của mình
-- =====================================================================
alter table public.items add column if not exists is_x3 boolean not null default false;
insert into public.settings(key, value, updated_by) values ('TRIPLE_BONUS_RATE', '200'::jsonb, 'system'), ('SCORE_SEE_ALL', 'true'::jsonb, 'system')
on conflict (key) do nothing;

create or replace function public._staff_items(p_staff text, p_date date default null)
returns setof public.items
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.staff where id = p_staff),
  d as (select date_trunc('month', coalesce(p_date, public.vn_today()))::date m),
  mt as (select t.items from public.monthly_targets t, d where t.staff_id = p_staff and t.month = d.m
           and jsonb_typeof(t.items) = 'array' and jsonb_array_length(t.items) > 0),
  contest as (
    select btrim(e ->> 'name') name, (e ->> 'target')::numeric tgt, o
    from mt, jsonb_array_elements(mt.items) with ordinality x(e, o)
    where btrim(coalesce(e ->> 'name', '')) <> '' and (e ->> 'target')::numeric > 0
  ),
  from_contest as (
    select i.id, i.store, c.name, round(c.tgt / public._work_days(p_staff, (select m from d)), 3) target,
           coalesce(t.bonus_star, i.bonus_star) bonus_star, coalesce(t.penalty_star, i.penalty_star) penalty_star,
           i.is_x2, c.o::int sort, true active, i.created_at, i.is_x3, c.o
    from contest c cross join s
    cross join lateral (select * from public.items i where i.name = c.name
                        order by i.active desc, (lower(i.store) = lower(s.dept)) desc, (i.store = 'Chung') desc, i.sort, i.id limit 1) i
    left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name
  ),
  cand as (
    select i.*,
      row_number() over (partition by i.name order by (lower(i.store) = lower(s.dept)) desc, i.sort, i.id) rn,
      min(i.sort::bigint * 1000000000 + i.id) over (partition by i.name) ord
    from public.items i, s
    where not exists (select 1 from contest) and i.active and (
      case when cardinality(s.assigned_items) > 0 then i.name = any(s.assigned_items)
      else i.store = 'Chung' or lower(i.store) = lower(s.dept) end)
  )
  select id, store, name, target, bonus_star, penalty_star, is_x2, sort, active, created_at, is_x3 from (
    select f.id, f.store, f.name, f.target, f.bonus_star, f.penalty_star, f.is_x2, f.sort, f.active, f.created_at, f.is_x3, f.o::bigint k from from_contest f
    union all
    select c.id, c.store, c.name, coalesce(t.target, c.target), coalesce(t.bonus_star, c.bonus_star), coalesce(t.penalty_star, c.penalty_star),
           c.is_x2, c.sort, c.active, c.created_at, c.is_x3, c.ord
    from cand c left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name where c.rn = 1
  ) z order by k
$$;
revoke execute on function public._staff_items(text, date) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_form(p_staff text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  perform public._require_member();
  if not public.can_see_staff(p_staff) then raise exception 'Ngoài phạm vi của bạn.'; end if;
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'target', i.target, 'bonus', i.bonus_star,
              'penalty', i.penalty_star, 'isX2', i.is_x2, 'isX3', i.is_x3, 'streak', public._item_streak(p_staff, i.name, p_date))) from public._staff_items(p_staff, p_date) i), '[]'::jsonb),
    'existing', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.daily_results r where r.staff_id = p_staff and r.report_date = p_date), '[]'::jsonb),
    'proposal', (select to_jsonb(p) from public.extra_proposals p where p.staff_id = p_staff and p.report_date = p_date order by id limit 1),
    'locked', exists (select 1 from public.locked_dates where d = p_date),
    'after_cutoff', public.is_after_cutoff(p_date),
    'total_star', public.staff_total(p_staff)
  ) into v;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public._compute_report(p_staff text, p_date date, p_reports jsonb, p_extra_item text, p_extra_stars integer, p_actor text, p_at timestamp with time zone, p_dry boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.staff;
  it public.items;
  v_items public.items[];
  inp jsonb := '{}'::jsonb;
  e jsonb; v_name text; v_comp text; v_actual numeric;
  rows jsonb := '[]'::jsonb; row jsonb;
  v_rate numeric; v_star int; v_status text;
  v_old int; v_pool numeric; v_total int;
  v_rules jsonb; v_rule jsonb;
  v_streak int; v_ot numeric; v_pen numeric; v_mult numeric; v_needed int;
  v_late record; v_count int; v_step int;
  v_extra text := btrim(coalesce(p_extra_item, ''));
  v_extra_stars int := greatest(0, least(100000, coalesce(p_extra_stars, 0)));
  v_prop record;
  i int;
  v_tt_start date; v_tt_pen int; v_due date; v_tt public.tiktok_submissions;
begin
  select * into st from public.staff where id = p_staff;
  if st.id is null then raise exception 'Nhân viên không tồn tại.'; end if;
  if p_date is null or p_date > (p_at at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Ngày báo cáo không hợp lệ.'; end if;
  v_items := array(select x from public._staff_items(p_staff, p_date) x);
  if coalesce(array_length(v_items, 1), 0) = 0 then raise exception 'Nhân viên chưa có môn thi đua.'; end if;
  -- Đọc & kiểm tra số liệu gửi lên
  for e in select * from jsonb_array_elements(coalesce(p_reports, '[]'::jsonb)) loop
    v_comp := coalesce(e ->> 'compensation', '');
    continue when v_comp in ('PHAT_TRE', 'TIKTOK_PHAT');
    v_name := e ->> 'itemName';
    if v_name is null or inp ? v_name or not exists (select 1 from unnest(v_items) x where x.name = v_name) then
      raise exception 'Môn thi đua không hợp lệ hoặc bị trùng: %', coalesce(v_name, '?');
    end if;
    begin v_actual := (e ->> 'actual')::numeric; exception when others then v_actual := null; end;
    if v_actual is null or v_actual < 0 then raise exception 'Thực đạt phải là số không âm (%).', v_name; end if;
    inp := inp || jsonb_build_object(v_name, jsonb_build_object('actual', v_actual, 'comp', v_comp));
  end loop;
  if (select count(*) from jsonb_object_keys(inp)) <> array_length(v_items, 1) then
    raise exception 'Cần nhập đầy đủ % môn được giao.', array_length(v_items, 1);
  end if;
  -- Bước 1: % đạt, sao thưởng
  foreach it in array v_items loop
    v_actual := (inp -> it.name ->> 'actual')::numeric;
    v_rate := v_actual / nullif(it.target, 0);
    if v_rate >= 1 then
      v_star := it.bonus_star * case when it.is_x3 and v_rate >= public.setting_num('TRIPLE_BONUS_RATE', 200) / 100 then 3
                                    when (it.is_x2 or it.is_x3) and v_rate >= public.setting_num('DOUBLE_BONUS_RATE', 150) / 100 then 2 else 1 end;
      v_status := 'Về số'; v_comp := 'DUNG_SAO';
    else
      v_star := 0; v_status := 'Chưa về';
      v_comp := case when inp -> it.name ->> 'comp' = 'TANG_CA' then 'TANG_CA' else 'DUNG_SAO' end;
    end if;
    rows := rows || jsonb_build_object('itemName', it.name, 'target', it.target, 'actual', v_actual,
      'rate', round(coalesce(v_rate, 0) * 100), 'starChange', v_star, 'status', v_status,
      'compensation', v_comp, 'streak', 0, 'needed', 0, 'isX2', it.is_x2, 'isX3', it.is_x3);
  end loop;
  -- Bước 2: chuỗi, tăng ca, trừ sao theo quỹ
  select coalesce(sum(star_change), 0) into v_old from public.daily_results
   where staff_id = p_staff and report_date = p_date;
  v_total := coalesce(public.staff_total(p_staff), 0);
  v_pool := v_total - v_old + (select coalesce(sum(greatest(0, (r ->> 'starChange')::int)), 0) from jsonb_array_elements(rows) r);
  select coalesce(value, '[]'::jsonb) into v_rules from public.settings where key = 'ITEM_RULES';
  if v_rules is null or jsonb_typeof(v_rules) <> 'array' then v_rules := '[]'::jsonb; end if;
  for i in 0 .. jsonb_array_length(rows) - 1 loop
    row := rows -> i;
    continue when row ->> 'status' = 'Về số';
    it := v_items[i + 1];
    v_streak := public._item_streak(p_staff, it.name, p_date);
    select r into v_rule from jsonb_array_elements(v_rules) r
     where (r ->> 'item' = '*' or r ->> 'item' = it.name)
       and (coalesce(jsonb_array_length(r -> 'staffIds'), 0) = 0 or (r -> 'staffIds') ? p_staff)
       and (coalesce(jsonb_array_length(r -> 'stores'), 0) = 0 or (r -> 'stores') ? st.dept)
     order by (case when coalesce(jsonb_array_length(r -> 'staffIds'), 0) > 0 then 100 else 0 end)
            + (case when coalesce(jsonb_array_length(r -> 'stores'), 0) > 0 then 10 else 0 end)
            + (case when r ->> 'item' <> '*' then 1 else 0 end) desc
     limit 1;
    v_ot := case when nullif(v_rule ->> 'ot', '') is not null then (v_rule ->> 'ot')::numeric else public.setting_num('STREAK_OVERTIME', 3) end;
    v_pen := case when coalesce((v_rule ->> 'noPen')::boolean, false) then 1e9
                  when nullif(v_rule ->> 'pen', '') is not null then (v_rule ->> 'pen')::numeric
                  else public.setting_num('STREAK_PENALTY_STAR', 5) end;
    v_mult := public.setting_num('PEN_M1', 1);
    if v_streak >= public.setting_num('PEN_T4_MIN', 8) then v_mult := public.setting_num('PEN_M4', 5);
    elsif v_streak >= public.setting_num('PEN_T3_MIN', 6) then v_mult := public.setting_num('PEN_M3', 2);
    elsif v_streak >= public.setting_num('PEN_T2_MIN', 4) then v_mult := public.setting_num('PEN_M2', 1.5); end if;
    v_needed := round(it.penalty_star * v_mult);
    v_comp := row ->> 'compensation'; v_star := 0;
    if v_streak < v_ot and v_streak < v_pen then v_comp := 'GHI_NHAN';
    elsif v_streak < v_pen then v_comp := 'TANG_CA';
    else
      if v_streak < v_ot then v_comp := 'DUNG_SAO'; end if;
      if v_comp = 'DUNG_SAO' then
        if v_pool >= v_needed then v_star := -v_needed; v_pool := v_pool - v_needed; else v_comp := 'TANG_CA'; end if;
      end if;
    end if;
    rows := jsonb_set(rows, array[i::text], row || jsonb_build_object('compensation', v_comp, 'starChange', v_star, 'streak', v_streak, 'needed', v_needed));
  end loop;
  -- Bước 3: kỷ luật nộp trễ
  select * into v_late from public.daily_results
   where staff_id = p_staff and report_date = p_date and compensation = 'PHAT_TRE' order by id limit 1;
  if v_late.id is not null then
    rows := rows || jsonb_build_object('itemName', v_late.item_name, 'actual', v_late.actual, 'rate', null,
      'starChange', v_late.star_change, 'status', v_late.status, 'compensation', 'PHAT_TRE', 'streak', 0);
  elsif public.is_after_cutoff(p_date, p_at) then
    v_step := public.setting_num('LATE_STEP', 100)::int;
    select 1 + count(*) into v_count from public.daily_results
     where staff_id = p_staff and report_date <> p_date and compensation = 'PHAT_TRE'
       and date_trunc('month', report_date) = date_trunc('month', p_date::timestamp);
    rows := rows || jsonb_build_object('itemName', '[Kỷ Luật] Báo cáo sau ' || replace(public.setting_text('CUTOFF_TIME', '22:20'), ':', 'h') || ' (Lần ' || v_count || ')',
      'actual', 1, 'rate', null, 'starChange', -v_step * v_count, 'status', 'Nộp trễ', 'compensation', 'PHAT_TRE', 'streak', 0);
  end if;
  -- Bước 4: phạt TikTok trễ hạn — mỗi kỳ (Thứ 3/Thứ 6) chưa nộp bị trừ trên báo cáo của từng ngày cho tới khi nộp
  v_tt_start := nullif(public.setting_text('TIKTOK_START_DATE', ''), '')::date;
  if v_tt_start is not null then
    v_tt_pen := public.setting_num('TIKTOK_PENALTY', 300)::int;
    for v_due in select d from public.tiktok_due_dates(v_tt_start, p_date - 1) d loop
      select * into v_tt from public.tiktok_submissions where staff_id = p_staff and due = v_due;
      continue when v_tt.id is not null and v_tt.status = 'MIỄN';
      if v_tt.id is null or v_tt.submit_date >= p_date then
        rows := rows || jsonb_build_object('itemName', '[Kỷ Luật] TikTok trễ hạn ' || case extract(dow from v_due) when 2 then 'Thứ 3' else 'Thứ 6' end || ' ' || to_char(v_due, 'DD/MM'),
          'actual', 0, 'rate', null, 'starChange', -v_tt_pen, 'status', 'Phạt TikTok', 'compensation', 'TIKTOK_PHAT', 'streak', 0);
      end if;
    end loop;
  end if;
  if p_dry then
    return jsonb_build_object('status', 'preview', 'rows', rows, 'total_before', v_total,
      'day_change', (select coalesce(sum((r ->> 'starChange')::int), 0) from jsonb_array_elements(rows) r),
      'old_day_change', v_old);
  end if;
  -- Ghi: thay toàn bộ báo cáo của ngày (giữ dòng phạt TikTok)
  delete from public.daily_results where staff_id = p_staff and report_date = p_date;
  insert into public.daily_results(report_date, staff_id, staff_name, item_name, actual, rate_pct, star_change, status, compensation, submitted_by, submitted_at)
  select p_date, p_staff, st.name, r ->> 'itemName', coalesce((r ->> 'actual')::numeric, 0), (r ->> 'rate')::numeric,
         coalesce((r ->> 'starChange')::int, 0), r ->> 'status', r ->> 'compensation', p_actor, p_at
  from jsonb_array_elements(rows) r;
  -- Đề xuất bán thêm (giữ nguyên nếu đã được duyệt / từ chối)
  select * into v_prop from public.extra_proposals where staff_id = p_staff and report_date = p_date order by id limit 1;
  if v_prop.id is not null then
    if v_prop.status = 'Chờ duyệt' then
      if v_extra = '' then delete from public.extra_proposals where id = v_prop.id;
      else update public.extra_proposals set content = v_extra, stars = v_extra_stars, staff_name = st.name where id = v_prop.id; end if;
    end if;
  elsif v_extra <> '' then
    insert into public.extra_proposals(report_date, staff_id, staff_name, content, stars) values (p_date, p_staff, st.name, v_extra, v_extra_stars);
  end if;
  insert into public.audit_log(actor, action, target, details) values (p_actor, 'SUBMIT_DAILY', p_staff, jsonb_build_object('date', p_date));
  return jsonb_build_object('status', 'success', 'rows', rows, 'total_star', public.staff_total(p_staff),
    'day_change', (select coalesce(sum((r ->> 'starChange')::int), 0) from jsonb_array_elements(rows) r));
end $function$;

create or replace function public.score_board(p_from date, p_to date, p_full boolean default false)
returns table (staff_id text, name text, dept text,
  revenue numeric, revenue_target numeric, rev_pct numeric, rev_score numeric,
  items_total int, items_done numeric, items_detail jsonb, contest_score numeric,
  s5 int, s4 int, s3 int, s2 int, s1 int, complaints int, service_raw numeric, service_score numeric,
  violations int, violation_points numeric, total numeric, rank int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.memberships; v_all boolean; v_det boolean := false; v_month date := date_trunc('month', p_from)::date;
  v_f numeric; d jsonb; w_r numeric; w_c numeric; w_s numeric;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then v_all := true; v_det := true;   -- máy chủ gửi Telegram
  else
    m := public._require_member();
    v_all := m.role = 'owner' or public.setting_text('SCORE_SEE_ALL', 'true') = 'true';
    v_det := m.role = 'owner';
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
  -- NV xem toàn siêu thị: chỉ thấy điểm của người khác; số DT và chi tiết môn chỉ của mình (quản lý: trong phạm vi)
  select fin.id, fin.name, fin.dept,
    case when v_det or public.can_see_staff(fin.id) then fin.revenue end,
    case when v_det or public.can_see_staff(fin.id) then fin.rt end,
    case when v_det or public.can_see_staff(fin.id) then fin.rpct end, fin.rscore, fin.n, fin.dn,
    case when v_det or public.can_see_staff(fin.id) then fin.det else '[]'::jsonb end, fin.cscore,
    fin.a5, fin.a4, fin.a3, fin.a2, fin.a1, fin.ak, fin.sraw, fin.sscore, fin.vn, fin.vpts, fin.tot, fin.rk
  from fin where v_all or public.can_see_staff(fin.id)
  order by fin.tot desc, fin.name;
end $$;
