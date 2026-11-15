-- F2c gợi ý sao + thưởng nóng (chạy sau x3_test.sql)
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1003@x.vn','employee','1003','{Topzone}') on conflict do nothing;
select set_config('request.jwt.claims', '{"email":"dohung712@gmail.com","role":"authenticated"}', false) \g /dev/null
set role authenticated;
select public.apply_star_suggestions('Topzone', '[{"name":"AppleCare","bonus":300,"penalty":150,"low":true,"focus":false,"store_target":10,"store_pct":20},{"name":"Sim","bonus":500,"penalty":250,"focus":true}]'::jsonb) ->> 'message' msg;
reset role;
do $$ begin
  if not exists (select 1 from items where store = 'Topzone' and name = 'AppleCare' and bonus_star = 300 and penalty_star = 150 and low_target and store_target = 10) then raise exception 'apply AppleCare sai'; end if;
  if not exists (select 1 from items where store = 'Topzone' and name = 'Sim' and bonus_star = 500 and focus) then raise exception 'Sim (môn Chung) chưa tạo bản riêng cho Topzone'; end if;
  if not exists (select 1 from items where store = 'Chung' and name = 'Sim' and bonus_star <> 500) then raise exception 'môn Chung bị đổi'; end if;
end $$;
delete from daily_results where staff_id = '1003' and report_date = '2026-10-21';
insert into daily_results(report_date, staff_id, staff_name, item_name, actual, rate_pct, star_change, status, compensation)
values ('2026-10-21', '1003', 'NV 3', 'AppleCare', 3, 150, 300, 'Về số', ''), ('2026-10-21', '1003', 'NV 3', 'Ốp lưng', 1, 16, 0, 'Chưa về', 'GHI_NHAN');
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
set role authenticated;
do $$ declare a jsonb; b jsonb; begin
  a := public.check_hot_bonus('1003', '2026-10-21'); b := public.check_hot_bonus('1003', '2026-10-21');
  if jsonb_array_length(a -> 'hot') <> 1 or jsonb_array_length(b -> 'hot') <> 0 then raise exception 'thưởng nóng sai: % / %', a, b; end if;
  raise notice 'hot ok: %', a -> 'hot' -> 0 ->> 'reason';
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare t0 int; t1 int; h bigint; begin
  select id into h from public.hot_bonuses where staff_id = '1003' and report_date = '2026-10-21';
  t0 := public.staff_total('1003');
  perform public.review_hot_bonus(h, true, null);
  t1 := public.staff_total('1003');
  if t1 - t0 <> 2000 then raise exception 'duyệt thưởng nóng: tổng sao % → %', t0, t1; end if;
  raise notice 'duyệt ok: +%', t1 - t0;
end $$;
reset role;
delete from daily_results where staff_id = '1003' and report_date = '2026-10-21';
