-- Cho phép lưu khoá AI (Gemini) cho Trợ lý, cạnh token Telegram
create or replace function public.set_private_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Chỉ chủ quản được đổi cài đặt này.'; end if;
  if p_key not in ('TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY') then raise exception 'Khóa cài đặt không hợp lệ.'; end if;
  if coalesce(btrim(p_value), '') = '' then delete from public.private_settings where key = p_key;
  else insert into public.private_settings(key, value) values (p_key, btrim(p_value))
       on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  return jsonb_build_object('status', 'success', 'has_value', coalesce(btrim(p_value), '') <> '');
end $$;
create or replace function public.private_setting_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_owner() then
    jsonb_build_object('TELEGRAM_BOT_TOKEN', exists (select 1 from public.private_settings where key = 'TELEGRAM_BOT_TOKEN'),
                       'GEMINI_API_KEY', exists (select 1 from public.private_settings where key = 'GEMINI_API_KEY'))
  else jsonb_build_object('AI', exists (select 1 from public.private_settings where key = 'GEMINI_API_KEY')) end
$$;
