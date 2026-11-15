-- =====================================================================
-- D1 TikTok: nộp trước ngày hạn +TIKTOK_REWARD (100⭐) · đúng ngày hạn 0 · trễ bị trừ như cũ.
-- Link không được trùng link đã nộp của BẤT KỲ nhân viên nào (trước đây chỉ kiểm tra của chính mình).
-- =====================================================================
alter table public.tiktok_submissions drop constraint if exists tiktok_submissions_status_check;
alter table public.tiktok_submissions add constraint tiktok_submissions_status_check check (status in ('SỚM', 'ĐÚNG HẠN', 'TRỄ', 'MIỄN'));
update public.settings set value = '100'::jsonb, updated_by = 'rule-2026-11' where key = 'TIKTOK_REWARD';
insert into public.settings(key, value, updated_by) values ('TIKTOK_REWARD', '100'::jsonb, 'rule-2026-11') on conflict (key) do nothing;

create or replace function public.tiktok_submit(p_staff text, p_links text[], p_fb text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships; v_today date := public.vn_today(); v_start date; v_target date;
  v_min int := greatest(1, public.setting_num('TIKTOK_MIN_LINKS', 1)::int);
  v_fbmin int := least(5, public.setting_num('TIKTOK_FB_MIN', 1)::int);
  v_reward int := public.setting_num('TIKTOK_REWARD', 100)::int;
  v_links text[] := array(select distinct btrim(x) from unnest(coalesce(p_links, '{}')) x where btrim(x) <> '');
  v_fb text[] := array(select distinct btrim(x) from unnest(coalesce(p_fb, '{}')) x where btrim(x) <> '');
  v_bad text; v_on boolean; v_early boolean; v_key text; v_who text;
begin
  m := public._member_for_staff(p_staff);
  select x into v_bad from unnest(v_links || v_fb) x where x !~* '^https?://[^\s/?#]+\.[^\s/?#]{2,}' limit 1;
  if v_bad is not null then raise exception 'Link chưa đúng dạng: %', v_bad; end if;
  if cardinality(v_links) < v_min then raise exception 'Cần tối thiểu % link TikTok (đang có %).', v_min, cardinality(v_links); end if;
  if cardinality(v_fb) < v_fbmin then raise exception 'Chưa có link Facebook cá nhân — úp bài lên Facebook cá nhân rồi dán link vào ô ②.'; end if;
  select x into v_bad from unnest(v_links) x where x ~* '^https?://([^/]*\.)?(facebook\.com|fb\.com|fb\.watch|fb\.me)' limit 1;
  if v_bad is not null then raise exception 'Ô ① (TikTok) đang có link Facebook: %', v_bad; end if;
  select x into v_bad from unnest(v_fb) x where x ~* '^https?://([^/]*\.)?tiktok\.com' limit 1;
  if v_bad is not null then raise exception 'Ô ② (Facebook) đang có link TikTok: %', v_bad; end if;
  -- link phải mới: không trùng link đã nộp trước đây của bất kỳ nhân viên nào
  select x, t.staff_id into v_bad, v_who from unnest(v_links || v_fb) x
  join public.tiktok_submissions t on true
  cross join lateral unnest(t.tiktok_links || t.fb_links) y
  where lower(regexp_replace(split_part(y, '?', 1), '^https?://(www\.|m\.)?|/+$', '', 'g'))
      = lower(regexp_replace(split_part(x, '?', 1), '^https?://(www\.|m\.)?|/+$', '', 'g'))
  limit 1;
  if v_bad is not null then
    if v_who = p_staff then raise exception 'Link này bạn đã nộp ở kỳ trước, hãy nộp link mới: %', v_bad;
    else raise exception 'Link này đã được nhân viên khác nộp — mỗi người phải có link riêng: %', v_bad; end if;
  end if;

  v_start := coalesce(nullif(public.setting_text('TIKTOK_START_DATE', ''), '')::date, v_today);
  select d into v_target from public.tiktok_due_dates(v_start, v_today - 1) d
  where not exists (select 1 from public.tiktok_submissions t where t.staff_id = p_staff and t.due = d) order by d limit 1;
  if v_target is null then
    select d into v_target from public.tiktok_due_dates(greatest(v_start, v_today), greatest(v_start, v_today) + 10) d order by d limit 1;
  end if;
  if exists (select 1 from public.tiktok_submissions where staff_id = p_staff and due = v_target) then
    raise exception 'Đã nộp xong kỳ %. Chưa tới kỳ nộp tiếp theo!', to_char(v_target, 'DD/MM');
  end if;
  -- Nộp trước ngày hạn: thưởng TIKTOK_REWARD · đúng ngày hạn: không thưởng, không trừ · trễ: bị trừ mỗi ngày trong báo cáo
  v_on := v_today <= v_target; v_early := v_today < v_target;
  insert into public.tiktok_submissions(staff_id, due, tiktok_links, fb_links, submit_date, submit_time, status, reward, created_by)
  values (p_staff, v_target, v_links, v_fb, v_today, public.vn_hm(), case when v_early then 'SỚM' when v_on then 'ĐÚNG HẠN' else 'TRỄ' end, case when v_early then v_reward else 0 end, m.email);
  insert into public.audit_log(actor, action, target, details) values (m.email, 'TIKTOK_SUBMIT', p_staff, jsonb_build_object('due', v_target, 'on_time', v_on));
  return jsonb_build_object('status', 'success', 'due', v_target, 'on_time', v_on,
    'early', v_early,
    'message', case when v_early then format('Nộp SỚM kỳ %s: +%s⭐ 🎉', to_char(v_target, 'DD/MM'), v_reward)
                    when v_on then format('Đã ghi nhận ĐÚNG HẠN kỳ %s (không thưởng, không trừ)', to_char(v_target, 'DD/MM'))
                    else format('Đã ghi nhận nộp TRỄ kỳ %s (không có thưởng)', to_char(v_target, 'DD/MM')) end);
end $$;

