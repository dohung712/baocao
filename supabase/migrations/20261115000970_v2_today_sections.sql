-- H1 Trang Hôm nay của NV gồm 4 mục (Việc · Doanh thu siêu thị · Thi đua siêu thị · Xếp hạng): NV bấm đồng đội để xem chi tiết điểm.
-- SCORE_SEE_ALL: false = chỉ của mình · true = cả siêu thị (chỉ điểm) · 'detail' = cả siêu thị + DT, từng môn của đồng đội (mặc định mới).
insert into public.settings(key, value) values ('SCORE_SEE_ALL', '"detail"'::jsonb)
on conflict (key) do update set value = '"detail"'::jsonb, updated_at = now() where public.settings.value = 'true'::jsonb;

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
    v_all := m.role = 'owner' or public.setting_text('SCORE_SEE_ALL', 'true') in ('true', 'detail');
    v_det := m.role = 'owner' or public.setting_text('SCORE_SEE_ALL', 'true') = 'detail';   -- 'detail': NV bấm đồng đội xem được DT + từng môn
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
                 and dr.report_date between p_from and p_to and dr.status in ('Về số', 'Chưa về')), 0)
      + coalesce((select sum(ia.delta) from public.item_adjustments ia where ia.staff_id = tg.staff_id and ia.item_name = e ->> 'name'
                 and ia.adj_date between p_from and p_to), 0) iact
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
  -- SCORE_SEE_ALL = true: NV chỉ thấy điểm của người khác (DT, môn chỉ của mình) · 'detail': thấy cả DT và từng môn của đồng đội
  select fin.id, fin.name, fin.dept,
    case when v_det or public.can_see_staff(fin.id) then fin.revenue end,
    case when v_det or public.can_see_staff(fin.id) then fin.rt end,
    case when v_det or public.can_see_staff(fin.id) then fin.rpct end, fin.rscore, fin.n, fin.dn,
    case when v_det or public.can_see_staff(fin.id) then fin.det else '[]'::jsonb end, fin.cscore,
    fin.a5, fin.a4, fin.a3, fin.a2, fin.a1, fin.ak, fin.sraw, fin.sscore, fin.vn, fin.vpts, fin.tot, fin.rk
  from fin where v_all or public.can_see_staff(fin.id)
  order by fin.tot desc, fin.name;
end $$;

grant execute on function public.score_board(date, date, boolean) to authenticated;
revoke execute on function public.score_board(date, date, boolean) from anon;
