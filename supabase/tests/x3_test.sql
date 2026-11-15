-- F2 X2/X3 + C10 BXH điểm toàn siêu thị (chạy sau scoring_test.sql)
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1003@x.vn','employee','1003','{Topzone}') on conflict do nothing;
update items set is_x2 = false, is_x3 = true where store = 'Topzone' and name = 'AppleCare';
create or replace function pg_temp.star_for(p_actual numeric) returns int language plpgsql as $$
declare r jsonb; p jsonb; begin
  select jsonb_agg(jsonb_build_object('itemName', i.name, 'actual', case when i.name = 'AppleCare' then p_actual else 0 end)) into p
    from public._staff_items('1003', '2026-10-20') i;
  perform set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', true);
  set local role authenticated;
  r := public.preview_daily_report('1003', '2026-10-20', p);
  reset role;
  return (select (e ->> 'starChange')::int from jsonb_array_elements(r -> 'rows') e where e ->> 'itemName' = 'AppleCare');
end $$;
do $$
declare t numeric; b int; s1 int; s2 int; s3 int;
begin
  select target, bonus_star into t, b from public._staff_items('1003', '2026-10-20') where name = 'AppleCare';
  s1 := pg_temp.star_for(t * 1.2); s2 := pg_temp.star_for(t * 1.6); s3 := pg_temp.star_for(t * 2.1);
  if s1 <> b or s2 <> 2 * b or s3 <> 3 * b then raise exception 'X3 sai: % % % (thưởng %)', s1, s2, s3, b; end if;
  raise notice 'X3 ok: 120%%=% 160%%=% 210%%=%', s1, s2, s3;
end $$;
-- NV xem toàn siêu thị: thấy điểm mọi người, chỉ thấy DT/chi tiết môn của mình
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
set role authenticated;
do $$
declare n_all int; n_rev int; mine numeric;
begin
  select count(*), count(revenue) into n_all, n_rev from public.score_board(date_trunc('month', current_date)::date, current_date, false);
  select revenue into mine from public.score_board(date_trunc('month', current_date)::date, current_date, false) where staff_id = '1001';
  if n_all < 2 or n_rev <> 1 or mine is null then raise exception 'BXH NV sai: % dòng, % dòng có DT, DT của mình %', n_all, n_rev, mine; end if;
  raise notice 'BXH NV ok: % dòng, chỉ 1 dòng có DT', n_all;
end $$;
reset role;
update items set is_x3 = false, is_x2 = true where store = 'Topzone' and name = 'AppleCare';
