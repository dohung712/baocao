-- =====================================================================
-- Thi đua v2 — dữ liệu cho tóm tắt Telegram + lịch tự động (pg_cron, 5 phút/lần)
-- =====================================================================

-- Chuỗi chưa về hiện tại của mọi nhân viên đang hoạt động (dùng cho báo cáo tự động)
create or replace function public.current_streaks(p_as_of date default null)
returns table (staff_id text, item_name text, streak int)
language sql stable security definer set search_path = '' as $$
  select s.id, i.name, public._item_streak(s.id, i.name, coalesce(p_as_of, public.vn_today() + 1))
  from public.staff s cross join lateral public._staff_items(s.id) i
  where not s.hidden
$$;
revoke execute on function public.current_streaks(date) from public, anon, authenticated;

-- Khoá bí mật cho lịch tự động gọi hàm gửi tin
insert into public.private_settings(key, value)
values ('CRON_SECRET', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Lịch chạy (chỉ tạo được trên Supabase; máy thử nghiệm không có pg_cron sẽ bỏ qua)
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    if exists (select 1 from cron.job where jobname = 'thidua-notify') then
      perform cron.unschedule('thidua-notify');
    end if;
    perform cron.schedule('thidua-notify', '*/5 * * * *', $cron$
      select net.http_post(
        url := 'https://iauxgnnybhzqeirnqaen.supabase.co/functions/v1/notify',
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'x-cron-secret', (select value from public.private_settings where key = 'CRON_SECRET')),
        body := '{"mode":"tick"}'::jsonb,
        timeout_milliseconds := 20000)
    $cron$);
  else
    raise notice 'pg_cron/pg_net không có trên máy này — bỏ qua lịch tự động';
  end if;
end $outer$;
