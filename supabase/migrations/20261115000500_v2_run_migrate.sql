-- Chuyển dữ liệu bản cũ sang v2 (chạy 1 lần khi triển khai). Muốn chuyển lại lúc đổi hẳn sang v2:
-- tạo file mới cùng nội dung với tên mới, vd 20261201000000_v2_remigrate.sql
select public.migrate_legacy() as migrated;
