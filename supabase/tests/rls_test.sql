\set ON_ERROR_STOP 0
insert into memberships(email, role, staff_id, stores) values
 ('mgr@x.vn','manager',null,'{Topzone}'), ('nv1001@x.vn','employee','1001','{Topzone}'), ('nv1000@x.vn','employee','1000','{"Thế Giới Di Động"}')
on conflict do nothing;
create or replace function pg_temp.as_user(e text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('email',e)::text, false) $$;
set role authenticated;
select pg_temp.as_user('nv1001@x.vn');
select 'emp sees staff', count(*) from staff;
select 'emp sees results of others', count(*) from daily_results where staff_id <> '1001';
select 'emp sees items', count(*) from items;
-- nộp cho người khác -> lỗi
select submit_daily_report('1000', current_date, '[]');
-- form + nộp cho mình
select jsonb_array_length(report_form('1001', current_date)->'items') as n_items;
select submit_daily_report('1001', current_date, (select jsonb_agg(jsonb_build_object('itemName', x->>'name', 'actual', x->'target')) from jsonb_array_elements(report_form('1001', current_date)->'items') x))->>'status' as first_submit;
-- sửa trực tiếp bảng -> bị chặn
update daily_results set star_change = 99999 where staff_id='1001';
select 'after illegal update max star', max(star_change) from daily_results where staff_id='1001';
insert into settings(key,value) values ('X','1');
select 'leaderboard rows (emp, setting off)', count(*) from leaderboard(current_date - 30, current_date);
reset role;
update settings set value='true' where key='EMPLOYEE_SEE_LEADERBOARD';
set role authenticated;
select 'leaderboard rows (emp, setting on)', count(*) from leaderboard(current_date - 30, current_date);
-- ngày cũ đã có báo cáo + sau giờ chốt -> cần duyệt
select submit_daily_report('1001', '2026-10-20', (select jsonb_agg(jsonb_build_object('itemName', x->>'name', 'actual', 0)) from jsonb_array_elements(report_form('1001', '2026-10-20')->'items') x))->>'status' as old_day;
select submit_daily_report('1001', '2026-10-20', (select jsonb_agg(jsonb_build_object('itemName', x->>'name', 'actual', 0)) from jsonb_array_elements(report_form('1001', '2026-10-20')->'items') x), '', 0, 'Nhập nhầm số')->>'status' as with_reason;
select 'my requests', count(*) from change_requests;
select pg_temp.as_user('mgr@x.vn');
select 'mgr sees staff', count(*) from staff;
select review_change((select id from change_requests limit 1), true)->>'message';
select delete_report_day('1000', '2026-10-20');
select delete_report_day('1001', '2026-10-01');
select pg_temp.as_user('nobody@x.vn');
select 'stranger staff', count(*) from staff;
select report_form('1001', current_date);
reset role;
select 'audit', action, count(*) from audit_log group by action order by 2;
