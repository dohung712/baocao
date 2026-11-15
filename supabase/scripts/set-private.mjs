// Ghi khoá bí mật từ GitHub Secrets vào public.private_settings (chỉ khi secret có giá trị). Không in giá trị.
import { sql } from "./apply-migrations.mjs";
const keys = ["GEMINI_API_KEY", "DRIVE_UPLOAD_URL", "DRIVE_UPLOAD_SECRET"];
const done = [];
for (const k of keys) {
  const v = (process.env[k] || "").trim(); if (!v) continue;
  let tag = "pv"; while (v.includes(`$${tag}$`)) tag += "x";
  await sql(`insert into public.private_settings(key, value) values ('${k}', $${tag}$${v}$${tag}$) on conflict (key) do update set value = excluded.value, updated_at = now()`);
  done.push(k);
}
console.log(done.length ? "Đã cập nhật khoá: " + done.join(", ") : "Không có khoá mới.");
