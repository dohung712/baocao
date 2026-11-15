// In bảng: hàm/bảng SQL → file migration MỚI NHẤT định nghĩa nó (bản đang chạy). Dùng: node supabase/scripts/fn-index.mjs
import { readdirSync, readFileSync } from "node:fs";
const dir = new URL("../migrations/", import.meta.url);
const last = new Map();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  readFileSync(new URL(f, dir), "utf8").split("\n").forEach((l, i) => {
    const m = l.match(/create (?:or replace )?(function|view|table)(?: if not exists)? public\.(\w+)/i);
    if (m) last.set(m[2], { kind: m[1].toLowerCase(), file: f.replace(/^\d{8}(\d{6})_v2_/, "$1_"), line: i + 1 });
  });
}
const rows = [...last].sort((a, b) => a[1].kind.localeCompare(b[1].kind) || a[0].localeCompare(b[0]));
console.log("| Tên | Loại | File:dòng (bản mới nhất) |\n|---|---|---|");
for (const [n, v] of rows) console.log(`| \`${n}\` | ${v.kind} | ${v.file}:${v.line} |`);
