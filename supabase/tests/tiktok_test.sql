-- D1 TikTok: nộp trước hạn +TIKTOK_REWARD, đúng ngày hạn 0; link không trùng của người khác
\set ON_ERROR_STOP 1
insert into memberships(email, role, staff_id, stores) values ('nv1003@x.vn','employee','1003','{Topzone}'), ('nv1001@x.vn','employee','1001','{Topzone}') on conflict do nothing;
create temp table _tts as select value from settings where key = 'TIKTOK_START_DATE';
insert into settings(key, value) values ('TIKTOK_START_DATE', to_jsonb(vn_today()::text)) on conflict (key) do update set value = excluded.value;
delete from tiktok_submissions where staff_id in ('1001', '1003') and due >= vn_today();
select set_config('request.jwt.claims', '{"email":"nv1003@x.vn","role":"authenticated"}', false) \g /dev/null
set role authenticated;
do $$ declare r jsonb; t public.tiktok_submissions; begin
  r := public.tiktok_submit('1003', array['https://www.tiktok.com/@nv3/video/7571111111111111111'], array['https://www.facebook.com/nv3/posts/1']);
  select * into t from public.tiktok_submissions where staff_id = '1003' and due = (r ->> 'due')::date;
  if extract(dow from public.vn_today()) in (2, 5) then
    if t.status <> 'ĐÚNG HẠN' or t.reward <> 0 then raise exception 'đúng ngày hạn phải 0: % %', t.status, t.reward; end if;
  elsif t.status <> 'SỚM' or t.reward <> 100 then raise exception 'nộp sớm phải +100: % %', t.status, t.reward; end if;
  raise notice 'tiktok ok: % %', t.status, t.reward;
end $$;
select set_config('request.jwt.claims', '{"email":"nv1001@x.vn","role":"authenticated"}', false) \g /dev/null
do $$ begin
  perform public.tiktok_submit('1001', array['https://tiktok.com/@nv3/video/7571111111111111111/?is_from=x'], array['https://www.facebook.com/nv1/posts/9']);
  raise exception 'phải chặn link trùng của người khác';
exception when others then
  if sqlerrm not like '%nhân viên khác%' then raise; end if;
  raise notice 'chặn link trùng ok';
end $$;
reset role;
delete from tiktok_submissions where staff_id = '1003' and due >= vn_today();
delete from settings where key = 'TIKTOK_START_DATE';
insert into settings(key, value) select 'TIKTOK_START_DATE', value from _tts;
