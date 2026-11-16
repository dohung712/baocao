-- C12 Cập nhật lũy kế tuần: thứ 2 hoặc QL mở khoá, ghi chênh lệch DT + môn, bảng điểm dùng số mới
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1001@x.vn','employee','1001','{Topzone}'), ('nv1003@x.vn','employee','1003','{Topzone}'), ('mgr@x.vn','manager',null,'{Topzone}') on conflict do nothing;
delete from settings where key = 'CUM_UNLOCK';
delete from item_measures where name in ('Laptop', 'Mở thẻ');
insert into monthly_targets(staff_id, month, revenue_target, items) values
  ('1003', date_trunc('month', public.vn_today() - 1)::date, 500, '[{"name":"Laptop","target":130.1},{"name":"Mở thẻ","target":4}]')
on conflict (staff_id, month) do update set items = excluded.items, revenue_target = excluded.revenue_target;
delete from item_adjustments where staff_id = '1003';
delete from revenue_entries where staff_id = '1003' and kind = 'adjust';
set role authenticated;
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare f jsonb; begin
  f := public.cum_form('1003');
  if (f -> 'items' -> 1 ->> 'measure') <> 'sl' or (f -> 'items' -> 0 ->> 'measure') <> 'dtqd' then raise exception 'đoán loại môn sai: %', f -> 'items'; end if;
  if extract(isodow from public.vn_today()) <> 1 then
    if (f -> 'window' ->> 'open')::boolean then raise exception 'ngoài thứ 2 phải khoá'; end if;
    begin perform public.cum_submit('1003', 10, '[]'); raise exception 'phải chặn khi khoá'; exception when others then if sqlerrm not like '%THỨ 2%' then raise; end if; end;
  end if;
  begin perform public.cum_unlock(now() + interval '1 hour', '{1003}'); raise exception 'NV không được mở khoá'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
  begin perform public.set_item_measure('Laptop', 'dtt'); raise exception 'NV không được chọn loại'; exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
select public.cum_unlock(now() + interval '1 hour', '{1003}') \g /dev/null
select public.set_item_measure('Laptop', 'dtt') \g /dev/null
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare f jsonb; r jsonb; b record; v_rev0 numeric; v_lap0 numeric; begin
  f := public.cum_form('1003');
  if not (f -> 'window' ->> 'open')::boolean then raise exception 'mở khoá rồi phải mở: %', f -> 'window'; end if;
  if (f -> 'items' -> 0 ->> 'measure') <> 'dtt' or (f -> 'items' -> 0 ->> 'guess')::boolean then raise exception 'loại môn QL chọn chưa áp'; end if;
  v_rev0 := (f ->> 'revenue_tool')::numeric; v_lap0 := (f -> 'items' -> 0 ->> 'tool')::numeric;
  r := public.cum_submit('1003', v_rev0 + 25.5, jsonb_build_array(jsonb_build_object('name', 'Laptop', 'value', v_lap0 + 40), jsonb_build_object('name', 'Mở thẻ', 'value', null)));
  if (r ->> 'changed')::int <> 2 then raise exception 'phải chỉnh 2 mục: %', r; end if;
  f := public.cum_form('1003');
  if (f ->> 'revenue_tool')::numeric <> v_rev0 + 25.5 or (f -> 'items' -> 0 ->> 'tool')::numeric <> v_lap0 + 40 or not (f ->> 'done')::boolean then raise exception 'số sau cập nhật sai: %', f; end if;
  r := public.cum_submit('1003', v_rev0 + 25.5, jsonb_build_array(jsonb_build_object('name', 'Laptop', 'value', v_lap0 + 40)));
  if (r ->> 'changed')::int <> 0 then raise exception 'nhập lại cùng số không được ghi thêm'; end if;
  begin perform public.cum_submit('1003', null, '[{"name":"Không có","value":1}]'); raise exception 'môn lạ phải lỗi'; exception when others then if sqlerrm not like '%không có trong%' then raise; end if; end;
  select * into b from public.score_board(date_trunc('month', public.vn_today() - 1)::date, public.vn_today() - 1, false) where staff_id = '1003';
  if not exists (select 1 from jsonb_array_elements(b.items_detail) x where x ->> 'name' = 'Laptop' and (x ->> 'actual')::numeric = v_lap0 + 40) then raise exception 'bảng điểm chưa dùng lũy kế mới: %', b.items_detail; end if;
end $$;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if extract(isodow from public.vn_today()) <> 1 and (public.cum_form('1001') -> 'window' ->> 'open')::boolean then raise exception 'mở khoá chỉ cho 1003, 1001 phải khoá'; end if;
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
select public.cum_unlock(null, '{}') \g /dev/null
reset role;
delete from item_adjustments where staff_id = '1003'; delete from revenue_entries where staff_id = '1003' and kind = 'adjust';
delete from item_measures where name = 'Laptop';
select 'cum_test OK';
