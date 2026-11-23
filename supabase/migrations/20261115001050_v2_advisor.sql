-- D15: 🧠 Cố vấn AI cho Giám đốc (Edge Function "advisor"): 📊 báo cáo thi đua, 💚 sức khoẻ nhân sự, 💬 hỏi đáp.
-- advisor_reports: các bản báo cáo AI đã viết (QL xem lại trên trang Cố vấn). Lịch: pg_cron "thidua-advisor" 10 phút.

create table if not exists public.advisor_reports (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('biz', 'people')),
  text text not null,
  by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists advisor_reports_kind_idx on public.advisor_reports(kind, created_at desc);
alter table public.advisor_reports enable row level security;
drop policy if exists advisor_reports_read on public.advisor_reports;
create policy advisor_reports_read on public.advisor_reports for select to authenticated using (public.is_manager());
revoke all on public.advisor_reports from anon;
revoke insert, update, delete on public.advisor_reports from authenticated;
grant select on public.advisor_reports to authenticated;

insert into public.settings(key, value) values
  ('ADV_ON', 'true'::jsonb),
  ('ADV_BIZ_TIMES', '["10:00","21:00"]'::jsonb),   -- 📊 sau khi đọc xong ảnh BI buổi sáng + cuối ngày
  ('ADV_PEOPLE_DOW', '1'::jsonb),                  -- 💚 thứ 2 hằng tuần
  ('ADV_PEOPLE_TIME', '"09:00"'::jsonb),
  ('ADV_PRIVATE_CHAT_IDS', '[]'::jsonb)            -- Telegram riêng cho báo cáo nhân sự (trống = chỉ thông báo đẩy + trang Cố vấn)
on conflict (key) do nothing;

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from cron.job where jobname = 'thidua-advisor') then perform cron.unschedule('thidua-advisor'); end if;
    perform cron.schedule('thidua-advisor', '2-59/10 * * * *', $cron$
      select net.http_post(
        url := 'https://iauxgnnybhzqeirnqaen.supabase.co/functions/v1/advisor',
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'x-cron-secret', (select value from public.private_settings where key = 'CRON_SECRET')),
        body := '{"mode":"cron"}'::jsonb,
        timeout_milliseconds := 20000)
    $cron$);
  else
    raise notice 'pg_cron/pg_net không có — bỏ qua lịch Cố vấn';
  end if;
end $outer$;
