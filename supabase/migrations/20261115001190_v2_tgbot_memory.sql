-- D27b Bot Telegram biết học (26/11/2026, chủ quản hỏi "bot học và làm quen được không"):
--   • rule    — luật Admin dạy ("nhớ: việc hình ảnh luôn 2 ảnh") hoặc rút ra khi Admin sửa bản nháp / sửa sau khi lưu
--   • example — tin nhắn → việc đã làm mà Admin bấm ✅ Lưu (bot dùng làm ví dụ cho lần sau)
create table if not exists public.tg_memory (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('rule', 'example')),
  text text not null check (length(text) between 2 and 2000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists tg_memory_kind_idx on public.tg_memory(kind, created_at desc) where active;
alter table public.tg_memory enable row level security;
revoke all on public.tg_memory from anon, authenticated;
alter table public.tg_pending add column if not exists msgs text[] not null default '{}';   -- các tin nhắn tạo nên bản nháp (để học)
