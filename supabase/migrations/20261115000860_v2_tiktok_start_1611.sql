-- TikTok: bỏ qua các kỳ quá hạn trước 16/11/2026 (không trừ sao nữa); từ 16/11/2026 tính lại theo quy tắc.
-- Mọi nơi (phạt sao, việc cần làm, nhắc Telegram, màn CV) đều đọc TIKTOK_START_DATE nên chỉ cần đổi mốc này.
insert into public.settings(key, value, updated_by) values ('TIKTOK_START_DATE', to_jsonb('2026-11-16'::text), 'migrate')
on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = 'migrate';
