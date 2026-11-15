// Chạy thử supabase/scripts/import-quy.mjs với dữ liệu Firestore giả và CSDL cục bộ (thay cho Management API)
import { execFileSync } from "node:child_process";
process.env.PROJECT_REF = "local"; process.env.SUPABASE_ACCESS_TOKEN = "x";
const psql = (q) => execFileSync("psql", ["-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", "t1", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" });
const docs = [
  { name: "p/d/transactions/A1", createTime: "2026-10-01T03:00:00Z", fields: { type: { stringValue: "thu" }, ten: { stringValue: "Quỹ đầu kỳ $qy$ test" }, sotien: { integerValue: "2000000" }, ngay: { stringValue: "2026-10-01" }, danhmuc: { stringValue: "💵 Thu Khác" }, nguoi: { stringValue: "Đỗ Xuân Hùng" }, noidung: { stringValue: "" }, nguoiCapNhat: { stringValue: "Đỗ Xuân Hùng" }, createdAt: { timestampValue: "2026-10-01T03:00:00Z" } } },
  { name: "p/d/transactions/A2", createTime: "2026-10-05T03:00:00Z", fields: { type: { stringValue: "chi" }, ten: { stringValue: "Ship hàng" }, sotien: { doubleValue: 35000 }, ngay: { stringValue: "2026-10-05" }, danhmuc: { stringValue: "🚗 Ship" }, nguoi: { stringValue: "Oppo" } } },
  { name: "p/d/transactions/A3", createTime: "2026-10-06T03:00:00Z", fields: { type: { stringValue: "chi" }, ten: { stringValue: "Lỗi 0đ" }, sotien: { integerValue: "0" } } },
];
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.includes("firestore")) {
    if (url.includes("/meta/settings")) return new Response(JSON.stringify({ fields: { categories: { arrayValue: { values: [{ stringValue: "🍽️ Ăn uống" }, { stringValue: "🚗 Ship" }] } } } }));
    return new Response(JSON.stringify({ documents: docs }));
  }
  const q = JSON.parse(opt.body).query.trim();
  if (/^select/i.test(q)) return new Response(psql(`select coalesce(json_agg(t), '[]') from (${q}) t`));
  psql(q); return new Response("[]");
};
psql("delete from public.settings where key = 'FUND_IMPORTED_AT'; delete from public.fund_tx where source_id like 'A%'");
await import("../scripts/import-quy.mjs");
console.log(psql("select source_id, kind, title, amount, tx_date, person from public.fund_tx where source_id is not null order by source_id"));
console.log("danh mục:", psql("select value from public.settings where key = 'FUND_CATEGORIES'"));
