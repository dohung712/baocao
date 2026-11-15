-- D6 Quỹ: thêm, sửa, xoá theo quyền; nhật ký
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1001@x.vn','employee','1001','{Topzone}'), ('nv1003@x.vn','employee','1003','{Topzone}'), ('mgr@x.vn','manager',null,'{Topzone}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare a bigint; b bigint; begin
  a := (public.fund_save(null, 'thu', 'Nộp quỹ tháng', 500000, public.vn_today(), '💵 Thu Khác', 'NV 1', '') ->> 'id')::bigint;
  b := (public.fund_save(null, 'chi', 'Mua nước', 120000, public.vn_today(), '🍽️ Ăn uống', 'NV 1', 'test') ->> 'id')::bigint;
  perform public.fund_save(b, 'chi', 'Mua nước suối', 150000, public.vn_today(), '🍽️ Ăn uống', 'NV 1', '');   -- người tạo sửa trong 24h
  perform set_config('my.a', a::text, false); perform set_config('my.b', b::text, false);
  if (select amount from public.fund_tx where id = b) <> 150000 then raise exception 'sửa không ăn'; end if;
end $$;
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  perform public.fund_delete(current_setting('my.a')::bigint);
  raise exception 'NV khác không được xoá';
exception when others then if sqlerrm not like '%Chỉ quản lý%' then raise; end if; raise notice 'chặn NV khác xoá ok';
end $$;
select set_config('request.jwt.claims', '{"email":"mgr@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ declare n int; begin
  perform public.fund_delete(current_setting('my.b')::bigint);
  select count(*) into n from public.fund_log(10);
  if n < 4 then raise exception 'nhật ký thiếu: %', n; end if;
  if (select sum(case when kind = 'thu' then amount else -amount end) from public.fund_tx) <> 500000 then raise exception 'số dư sai'; end if;
  raise notice 'quỹ ok: nhật ký % dòng', n;
end $$;
reset role;
