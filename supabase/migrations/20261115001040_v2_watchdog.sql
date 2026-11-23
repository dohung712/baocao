-- D14b: bộ canh chạy tự động. Edge Function "notify" (pg_cron 5 phút) mỗi lượt chạy xong ghi nhịp tim vào system_health.
-- _watchdog() chạy riêng trong CSDL (pg_cron 10 phút, không qua Edge Function): quá 30 phút không có nhịp tim
-- → gửi Telegram thẳng (pg_net) tới nơi nhận AGENT_CHAT_IDS / NOTIFY_CHAT_IDS; nhắc lại mỗi 2 giờ; chạy lại → báo "đã chạy lại".

create table if not exists public.system_health (
  key text primary key,
  at timestamptz not null default now(),
  ok boolean not null default true,
  detail jsonb not null default '{}'::jsonb,
  alerted_at timestamptz
);
alter table public.system_health enable row level security;
drop policy if exists system_health_read on public.system_health;
create policy system_health_read on public.system_health for select to authenticated using (public.is_manager());
revoke all on public.system_health from anon;
revoke insert, update, delete on public.system_health from authenticated;
grant select on public.system_health to authenticated;
insert into public.system_health(key, at) values ('tick', now()) on conflict (key) do nothing;

create or replace function public._watchdog() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.system_health; v_token text; v_chats jsonb; v_msg text; v_night boolean; c text; v_sent int := 0;
  v_vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
begin
  select * into h from public.system_health where key = 'tick';
  if h.key is null then return jsonb_build_object('skip', 'no row'); end if;
  if h.at < now() - interval '30 minutes' then
    if h.alerted_at is not null and h.alerted_at > now() - interval '2 hours' then return jsonb_build_object('stale', true, 'alerted', false); end if;
    v_msg := format(E'🚨 TOOL NGỪNG CHẠY TỰ ĐỘNG\nLượt chạy xong gần nhất: %s (%s phút trước).\nĐang dừng: nhắc việc, giao việc lặp lại, tin Telegram, Trợ lý vận hành.\nCách xử lý: báo người phụ trách kỹ thuật kiểm tra Edge Function "notify" (Supabase → Edge Functions → Logs).',
      to_char(h.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), floor(extract(epoch from now() - h.at) / 60)::int);
    update public.system_health set alerted_at = now(), ok = false where key = 'tick';
  elsif h.alerted_at is not null then
    v_msg := format(E'✅ Tool đã chạy tự động lại (lượt gần nhất %s).', to_char(h.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'));
    update public.system_health set alerted_at = null where key = 'tick';
  else
    return jsonb_build_object('ok', true);
  end if;
  select value into v_token from public.private_settings where key = 'TELEGRAM_BOT_TOKEN';
  select value into v_chats from public.settings where key = 'AGENT_CHAT_IDS';
  if v_chats is null or jsonb_typeof(v_chats) <> 'array' or jsonb_array_length(v_chats) = 0 then
    select value into v_chats from public.settings where key = 'NOTIFY_CHAT_IDS';
  end if;
  if coalesce(v_token, '') = '' or v_chats is null or jsonb_typeof(v_chats) <> 'array' then return jsonb_build_object('alert', v_msg, 'sent', 0); end if;
  v_night := v_vn::time >= time '22:30' or v_vn::time < time '06:30';
  for c in select jsonb_array_elements_text(v_chats) loop
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object('chat_id', c, 'text', v_msg, 'disable_notification', v_night),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent);
end $$;
revoke execute on function public._watchdog() from public, anon, authenticated;

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from cron.job where jobname = 'thidua-watchdog') then perform cron.unschedule('thidua-watchdog'); end if;
    perform cron.schedule('thidua-watchdog', '*/10 * * * *', 'select public._watchdog()');
  else
    raise notice 'pg_cron/pg_net không có — bỏ qua bộ canh';
  end if;
end $outer$;
