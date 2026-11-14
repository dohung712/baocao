// Áp các file SQL trong supabase/migrations lên Supabase qua Management API (chạy trong GitHub Actions).
// Mỗi file chỉ chạy 1 lần (ghi nhận ở bảng public.v2_migrations). Không in dữ liệu cá nhân ra log.
import { readdirSync, readFileSync } from "node:fs";
const REF = process.env.PROJECT_REF, TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!REF || !TOKEN) { console.error("Thiếu PROJECT_REF hoặc SUPABASE_ACCESS_TOKEN"); process.exit(1); }
export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query })
  });
  const text = await r.text(); let out; try { out = JSON.parse(text); } catch { out = text; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof out === "object" ? (out.message || JSON.stringify(out)) : out}`.slice(0, 2000));
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  await sql(`create table if not exists public.v2_migrations(name text primary key, applied_at timestamptz not null default now());
             alter table public.v2_migrations enable row level security;
             revoke all on public.v2_migrations from anon, authenticated;`);
  const done = new Set((await sql("select name from public.v2_migrations")).map((r) => r.name));
  const dir = new URL("../migrations/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) { console.log("✓ đã có  ", f); continue; }
    const body = readFileSync(new URL(f, dir), "utf8");
    const name = f.replace(/'/g, "''");
    process.stdout.write("→ đang áp " + f + " ... ");
    const res = await sql(`begin;\n${body}\n;insert into public.v2_migrations(name) values ('${name}');\ncommit;`);
    console.log("xong");
    // In kết quả của câu lệnh cuối nếu là số liệu tổng hợp (vd migrate_legacy trả về số dòng)
    if (Array.isArray(res) && res.length && JSON.stringify(res).length < 1500) console.log("   kết quả:", JSON.stringify(res));
  }
}
