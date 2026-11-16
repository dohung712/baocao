// Báo cáo niêm phong 1 lần: danh sách NV (mã, tên, bộ phận) để ghép khu vực vệ sinh đúng người.
// Mã hoá bằng khoá công khai (RSA-OAEP + AES-GCM) nên log công khai chỉ thấy chuỗi mã hoá, không đọc được tên.
import { sql } from "./apply-migrations.mjs";
import { publicEncrypt, randomBytes, createCipheriv, constants } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
const KEY = new URL("./sealed-report.pub.pem", import.meta.url);
if (!existsSync(KEY)) { console.log("Không có khoá — bỏ qua."); process.exit(0); }
const q = async (x) => { try { return await sql(x); } catch (e) { return { error: e.message.slice(0, 300) }; } };
const out = {
  items: await q("select id, store, name, target, bonus_star, penalty_star, active, sort from public.items order by store, sort, id"),
  mt: await q("select staff_id, month, work_days, items from public.monthly_targets where month = date_trunc('month', public.vn_today())::date"),
  thy: await q("select name, target, bonus_star, penalty_star, active, store from public._staff_items('29649', public.vn_today())"),
  wd: await q("select public._work_days('29649', date_trunc('month', public.vn_today())::date) wd"),
  set: await q("select key, value from public.settings where key in ('DAILY_TARGET_PCT','DAILY_TARGET_MIN','DAYS_OFF','STAR_POINTS')"),
  star: await q("select s.base_star, public.staff_total('29649') total, (select sum(star_change) from public.daily_results where staff_id = '29649') results, (select sum(reward) from public.tiktok_submissions where staff_id = '29649') tiktok, (select sum(delta) from public.star_adjustments where staff_id = '29649') adj from public.staff s where id = '29649'"),
  staff: await q("select id, dept, assigned_items from public.staff where not hidden"),
};
const plain = Buffer.from(JSON.stringify(out));
const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k, iv);
const enc = Buffer.concat([c.update(plain), c.final()]), tag = c.getAuthTag();
const ek = publicEncrypt({ key: readFileSync(KEY), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, k);
console.log("Đã niêm phong dữ liệu kiểm tra môn.");
console.log("SEALED:" + [ek, iv, tag, enc].map((b) => b.toString("base64")).join("."));
