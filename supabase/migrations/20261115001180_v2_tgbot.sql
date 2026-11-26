-- D27 Bot Telegram nhắc việc (26/11/2026, chủ quản chọn): chỉ Admin nhắn bot → AI soạn bản xem trước → bấm ✅ mới làm:
--   thêm / sửa / tắt việc lặp lại (ghi trang tính, đồng bộ app ngay) · giao việc 1 lần · thông báo cho mọi người · chữ chạy
-- Nối: Admin bấm "Bật bot" trong tool (Edge Function tgbot mode setup) → tool đặt webhook + mã nối 10 phút → Admin nhắn /noi <mã> cho bot.
-- Bí mật (private_settings): TGBOT_SECRET (Telegram gửi kèm mỗi lần gọi), TGBOT_ADMINS (id Telegram được nghe), TGBOT_EMAIL (tài khoản tool bot đứng tên), TGBOT_LINK (mã nối)
create table if not exists public.tg_chats (     -- nơi bot đã thấy (để "Tìm nhóm" vẫn chạy khi bot dùng webhook)
  id text primary key, title text, type text, last_at timestamptz not null default now()
);
alter table public.tg_chats enable row level security;
revoke all on public.tg_chats from anon, authenticated;

create table if not exists public.tg_pending (   -- bản xem trước chờ Admin bấm ✅ / ❌
  id bigint generated always as identity primary key,
  chat_id text not null, payload jsonb not null, status text not null default 'wait' check (status in ('wait', 'done', 'cancel', 'error')),
  result text, created_at timestamptz not null default now(), done_at timestamptz
);
alter table public.tg_pending enable row level security;
revoke all on public.tg_pending from anon, authenticated;

-- Bot làm việc dưới tên tài khoản tool của Admin (p_email): dùng lại đúng các hàm QL đang dùng (kiểm tra quyền, nhật ký như bấm trong tool)
create or replace function public._bot_as(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where email = lower(p_email) and active and role in ('owner', 'manager')) then raise exception 'Tài khoản bot không hợp lệ.'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('email', lower(p_email), 'role', 'authenticated')::text, true);
end $$;
create or replace function public._bot_job_assign(p jsonb, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform public._bot_as(p_email); return public.job_assign(p); end $$;
create or replace function public._bot_ticker_save(p jsonb, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform public._bot_as(p_email); return public.ticker_save(null, p); end $$;

revoke execute on function public._bot_as(text), public._bot_job_assign(jsonb, text), public._bot_ticker_save(jsonb, text) from public, anon, authenticated;
grant execute on function public._bot_job_assign(jsonb, text), public._bot_ticker_save(jsonb, text) to service_role;
