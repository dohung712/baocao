-- D15b: theo Lịch QL chủ quản chốt 24/11: 📊 Cố vấn thi đua 07:30 (họp đầu ca 07:15–07:30), 📋 Cố vấn công việc trong ngày 21:00
-- (việc còn sót / thiếu, tình hình hoàn thành), 💚 Sức khoẻ nhân sự thứ 2 08:00. Lịch ca theo tuần (cập nhật trước 20:00 CN).

alter table public.advisor_reports drop constraint if exists advisor_reports_kind_check;
alter table public.advisor_reports add constraint advisor_reports_kind_check check (kind in ('biz', 'people', 'day'));

update public.settings set value = '["07:30"]'::jsonb, updated_at = now(), updated_by = 'lich-ql' where key = 'ADV_BIZ_TIMES';
update public.settings set value = '"08:00"'::jsonb, updated_at = now(), updated_by = 'lich-ql' where key = 'ADV_PEOPLE_TIME';
insert into public.settings(key, value, updated_by) values ('ADV_DAY_TIME', '"21:00"'::jsonb, 'lich-ql')
on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
