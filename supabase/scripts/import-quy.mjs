// Chép 1 lần dữ liệu quỹ từ tool cũ (Firebase "topzone-quy") sang bảng public.fund_tx. Chạy trong GitHub Actions.
// Đã chép rồi (có settings.FUND_IMPORTED_AT) thì bỏ qua. Chỉ in số lượng, không in nội dung.
import { sql } from "./apply-migrations.mjs";
const BASE = "https://firestore.googleapis.com/v1/projects/topzone-quy/databases/(default)/documents";
const KEY = "AIzaSyC_z14zHe7OEzDcnNoF1KoSW5h3yxrpd-I"; // khoá web công khai của tool cũ (có sẵn trong trang quy)

const done = await sql("select value from public.settings where key = 'FUND_IMPORTED_AT'");
if (Array.isArray(done) && done.length) { console.log("Quỹ cũ đã được chép trước đó — bỏ qua."); process.exit(0); }

const val = (f) => f == null ? null : f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : f.doubleValue ?? f.timestampValue ?? f.booleanValue ?? null);
async function list(col) {
  const out = []; let token = "";
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`${BASE}/${col}?pageSize=300&key=${KEY}${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    if (!r.ok) throw new Error(`Đọc ${col} lỗi HTTP ${r.status}`);
    const j = await r.json(); out.push(...(j.documents || []));
    if (!j.nextPageToken) break; token = j.nextPageToken;
  }
  return out;
}
const docs = await list("transactions");
const rows = docs.map((d) => {
  const f = d.fields || {};
  const amount = Math.round(Number(val(f.sotien)) || 0), kind = val(f.type) === "thu" ? "thu" : "chi";
  const ngay = String(val(f.ngay) || "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ngay) ? ngay : String(val(f.createdAt) || d.createTime || "").slice(0, 10);
  return { source_id: d.name.split("/").pop(), kind, title: String(val(f.ten) || "(không tên)").slice(0, 300), amount, tx_date: date || null,
    category: String(val(f.danhmuc) || ""), person: String(val(f.nguoi) || ""), note: String(val(f.noidung) || ""),
    created_by: "quỹ cũ: " + String(val(f.nguoiCapNhat) || ""), created_at: val(f.createdAt) || d.createTime || null };
}).filter((r) => r.amount > 0 && r.tx_date);
let cats = [];
try { const r = await fetch(`${BASE}/meta/settings?key=${KEY}`); if (r.ok) { const j = await r.json(); cats = (j.fields?.categories?.arrayValue?.values || []).map(val).filter(Boolean); } } catch { /* bỏ qua */ }

const json = JSON.stringify(rows), cj = JSON.stringify(cats);
let tag = "qy"; while (json.includes(`$${tag}$`) || cj.includes(`$${tag}$`)) tag += "x";
const q = (s) => `$${tag}$${s}$${tag}$`;
await sql(`begin;
  insert into public.fund_tx(source_id, kind, title, amount, tx_date, category, person, note, created_by, updated_by, created_at)
  select x.source_id, x.kind, x.title, x.amount, x.tx_date, x.category, x.person, x.note, x.created_by, x.created_by, coalesce(x.created_at, now())
  from jsonb_to_recordset(${q(json)}::jsonb) as x(source_id text, kind text, title text, amount bigint, tx_date date, category text, person text, note text, created_by text, created_at timestamptz)
  on conflict (source_id) do nothing;
  ${cats.length ? `update public.settings set value = ${q(cj)}::jsonb, updated_by = 'quy-cu' where key = 'FUND_CATEGORIES';` : ""}
  insert into public.settings(key, value, updated_by) values ('FUND_IMPORTED_AT', to_jsonb(now()::text), 'import-quy') on conflict (key) do nothing;
  commit;`);
const cnt = await sql("select count(*) filter (where source_id is not null)::int imported, count(*)::int total from public.fund_tx");
console.log(`Quỹ cũ: đọc ${docs.length} giao dịch, hợp lệ ${rows.length}, danh mục ${cats.length}.`, JSON.stringify(cnt));
