-- B2: môn thi đua tháng bị bỏ tích "Bật" (Quản lý → Môn & Sao) thì không còn trong báo cáo ngày của NV.
-- Chọn dòng môn theo bộ phận của NV trước (rồi Chung), dòng đó tắt thì ẩn môn. Xếp hạng điểm vẫn theo target tháng.
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
    select i.id, i.store, c.name, public._daily_target(c.tgt / public._work_days(p_staff, (select m from d))) target,
           coalesce(t.bonus_star, i.bonus_star) bonus_star, coalesce(t.penalty_star, i.penalty_star) penalty_star,
           i.is_x2, c.o::int sort, true active, i.created_at, i.is_x3, i.focus, i.low_target, i.store_target, i.store_pct, i.store_pct_at, c.o
    from contest c cross join s
    cross join lateral (select * from public.items i where i.name = c.name
                        order by (lower(i.store) = lower(s.dept)) desc, (i.store = 'Chung') desc, i.active desc, i.sort, i.id limit 1) i
    left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name
    where i.active   -- môn bị bỏ tích "Bật" ở Môn & Sao thì không hiện trong báo cáo ngày
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
  select id, store, name, target, bonus_star, penalty_star, is_x2, sort, active, created_at, is_x3, focus, low_target, store_target, store_pct, store_pct_at from (
    select f.id, f.store, f.name, f.target, f.bonus_star, f.penalty_star, f.is_x2, f.sort, f.active, f.created_at, f.is_x3,
           f.focus, f.low_target, f.store_target, f.store_pct, f.store_pct_at, f.o::bigint k from from_contest f
    union all
    select c.id, c.store, c.name, coalesce(t.target, c.target), coalesce(t.bonus_star, c.bonus_star), coalesce(t.penalty_star, c.penalty_star),
           c.is_x2, c.sort, c.active, c.created_at, c.is_x3, c.focus, c.low_target, c.store_target, c.store_pct, c.store_pct_at, c.ord
    from cand c left join public.staff_targets t on t.staff_id = p_staff and t.item_name = c.name where c.rn = 1
  ) z order by k
$$;
revoke execute on function public._staff_items(text, date) from public, anon, authenticated;
