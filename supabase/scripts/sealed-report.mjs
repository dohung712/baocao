// Báo cáo niêm phong 1 lần: danh sách NV (mã, tên, bộ phận) để ghép khu vực vệ sinh đúng người.
// Mã hoá bằng khoá công khai (RSA-OAEP + AES-GCM) nên log công khai chỉ thấy chuỗi mã hoá, không đọc được tên.
import { sql } from "./apply-migrations.mjs";
import { publicEncrypt, randomBytes, createCipheriv, constants } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
const KEY = new URL("./sealed-report.pub.pem", import.meta.url);
if (!existsSync(KEY)) { console.log("Không có khoá — bỏ qua."); process.exit(0); }
const staff = await sql("select id, name, dept, hidden from public.staff order by dept, id");
const zones = await sql("select id, dept, name, staff_text, staff_ids from public.clean_zones where staff_text <> '' order by sort");
const plain = Buffer.from(JSON.stringify({ staff, zones }));
const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k, iv);
const enc = Buffer.concat([c.update(plain), c.final()]), tag = c.getAuthTag();
const ek = publicEncrypt({ key: readFileSync(KEY), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, k);
console.log(`Số NV: ${staff.length}, khu vực có người phụ trách: ${zones.length}`);
console.log("SEALED:" + [ek, iv, tag, enc].map((b) => b.toString("base64")).join("."));
