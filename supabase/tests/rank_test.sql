-- C13 Thưởng hạng: xếp riêng từng bộ phận, top 5 = 4000/3500/3000/2500/2000, chốt một lần
\set ON_ERROR_STOP 1
delete from rank_rewards where staff_id like 'rk%';
delete from star_adjustments where staff_id like 'rk%';
delete from revenue_entries where staff_id like 'rk%';
delete from monthly_targets where staff_id like 'rk%';
delete from staff where id like 'rk%';
insert into staff(id, name, dept) select 'rk' || g, 'RK' || g, 'TGDĐ' from generate_series(1, 6) g;
insert into staff(id, name, dept) values ('rkt1', 'RKT1', 'TestZ'), ('rkt2', 'RKT2', 'TestZ'), ('rkp1', 'RKP1', 'PG');
insert into settings(key, value) values ('RANK_REWARD_DEPTS', '["TGDĐ","TestZ"]') on conflict (key) do update set value = excluded.value;
insert into memberships(email, role, staff_id, stores) values ('own@x.vn','owner',null,'{}'), ('nv1001@x.vn','employee','1001','{Topzone}') on conflict do nothing;
insert into monthly_targets(staff_id, month, revenue_target, items) select id, date_trunc('month', public.vn_today())::date, 100, '[]' from staff where id like 'rk%';
insert into revenue_entries(staff_id, entry_date, amount, kind) select 'rk' || g, public.vn_today(), 10 * g, 'adjust' from generate_series(1, 6) g;
insert into revenue_entries(staff_id, entry_date, amount, kind) values ('rkt1', public.vn_today(), 30, 'adjust'), ('rkt2', public.vn_today(), 20, 'adjust'), ('rkp1', public.vn_today(), 90, 'adjust');
set role authenticated;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  begin perform public.rank_reward_preview(public.vn_today()); raise exception 'NV không được xem'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  begin perform public.rank_reward_close(public.vn_today()); raise exception 'NV không được chốt'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"email":"own@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare r record; n int; r1 jsonb; r2 jsonb; s0 int; begin
  -- Hạng riêng từng bộ phận, PG không có thưởng
  for r in select * from public.rank_reward_preview(public.vn_today()) where staff_id like 'rk%' loop
    if r.dept = 'PG' then raise exception 'PG không được xếp thưởng'; end if;
  end loop;
  select count(*) into n from public.rank_reward_preview(public.vn_today()) where staff_id like 'rk%' and dept = 'TGDĐ';
  if n <> 6 then raise exception 'TGDĐ phải có 6 người, có %', n; end if;
  if (select stars from public.rank_reward_preview(public.vn_today()) where staff_id = 'rk6') <> 4000 then raise exception 'rk6 phải hạng 1 = 4000'; end if;
  if (select stars from public.rank_reward_preview(public.vn_today()) where staff_id = 'rk2') <> 2000 then raise exception 'rk2 hạng 5 = 2000'; end if;
  if (select stars from public.rank_reward_preview(public.vn_today()) where staff_id = 'rk1') <> 0 then raise exception 'rk1 hạng 6 không thưởng'; end if;
  if (select rank from public.rank_reward_preview(public.vn_today()) where staff_id = 'rkt1') <> 1 or (select stars from public.rank_reward_preview(public.vn_today()) where staff_id = 'rkt1') <> 4000 then raise exception 'Bộ phận thứ hai xếp riêng, rkt1 hạng 1'; end if;
  if (select stars from public.rank_reward_preview(public.vn_today()) where staff_id = 'rkt2') <> 3500 then raise exception 'rkt2 hạng 2 = 3500'; end if;
  -- Chốt: cộng sao một lần
  select coalesce(sum(delta), 0) into s0 from public.star_adjustments where staff_id = 'rk6';
  r1 := public.rank_reward_close(public.vn_today());
  if (r1 ->> 'count')::int < 7 then raise exception 'chốt phải cộng cho ≥ 7 người: %', r1; end if;
  if (select coalesce(sum(delta), 0) from public.star_adjustments where staff_id = 'rk6') - s0 <> 4000 then raise exception 'rk6 chưa được +4000'; end if;
  r2 := public.rank_reward_close(public.vn_today());
  if (r2 ->> 'count')::int <> 0 then raise exception 'chốt lần 2 không được cộng thêm: %', r2; end if;
  if not (select closed from public.rank_reward_preview(public.vn_today()) where staff_id = 'rk6') then raise exception 'phải báo đã chốt'; end if;
end $$;
reset role;
update settings set value = '["TGDĐ","Topzone"]' where key = 'RANK_REWARD_DEPTS';
delete from rank_rewards where staff_id like 'rk%';
delete from star_adjustments where staff_id like 'rk%';
delete from revenue_entries where staff_id like 'rk%';
delete from monthly_targets where staff_id like 'rk%';
delete from staff where id like 'rk%';
\echo rank_test OK
