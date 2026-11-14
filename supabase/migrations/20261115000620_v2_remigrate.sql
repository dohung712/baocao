-- Chép lại dữ liệu bản cũ (gồm module CV, thưởng TikTok) sang v2
select public.migrate_legacy() as migrated;
