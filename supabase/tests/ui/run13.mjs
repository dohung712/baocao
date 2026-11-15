// Kiểm thử: CV → Vệ sinh → 🧽 Khu vực vệ sinh (NV bấm Xong, QL thêm) + Telegram: QL chỉnh lịch gửi (chọn thứ)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const psql = (sql) => execFileSync("psql", ["-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", process.env.TEST_DB || "t1", "-Atc", sql]).toString().trim();
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
const b = await chromium.launch();
async function open(email, vp = { width: 1360, height: 900 }) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\/notify/, (r) => { const q = JSON.parse(r.request().postData()); const its = [["daily", "Thi đua ngày", "daily"], ["tiktok", "TikTok", "due"], ["clean", "Vệ sinh", "daily"]].map(([id, label, f]) => ({ id, label, freq: f, defFreq: f, on: false, time: "21:00", dow: 0, dows: [] }));
    r.fulfill({ contentType: "application/json", body: JSON.stringify(q.mode === "items" ? { status: "success", items: its } : { status: "success" }) }); });
  await p.route(/functions\/v1\/(assistant|tasks|accounts)/, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(800);
  return p;
}
psql("delete from public.clean_zone_checks; update public.clean_zones set staff_ids = '{1001}' where name like 'Macbook%'; delete from public.cleaning where clean_date = public.vn_today(); insert into public.cleaning(clean_date, staff_id) values (public.vn_today(), '1001')");
// NV 1001 (Topzone) trên điện thoại
let p = await open("nv1001@x.vn", { width: 412, height: 915 });
console.log("nhắc việc:", (await p.$$eval(".remind-i", (x) => x.map((y) => y.textContent.replace(/\s+/g, " ").slice(0, 60)))).join(" | "));
await p.evaluate(() => { localStorage.setItem("thidua-v2-cv", "clean"); localStorage.removeItem("thidua-v2-zone-dept"); });
await p.click('#nav [data-page="cv"]').catch(() => p.evaluate(() => document.querySelector('[data-page="cv"]').click())); await p.waitForTimeout(1800);
console.log("NV thấy:", await p.$$eval(".zone", (x) => x.length), "khu vực | của tôi:", await p.$$eval(".zone.mine b", (x) => x.map((y) => y.textContent).join(", ")), "| tiêu chí:", (await p.textContent(".zone-crit").catch(() => "")).slice(0, 30));
await p.click(".zone.mine [data-zc]"); await p.waitForTimeout(900);
console.log("toast:", await p.textContent("#toast"), "| DB xác nhận:", psql("select count(*) from public.clean_zone_checks where staff_id = '1001'"));
const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); console.log("overflow ngang:", ov);
console.log("nhắc khu vực sau khi xong:", await p.$$eval(".remind-i", (x) => x.filter((y) => y.textContent.includes("Khu vực")).length));
await p.screenshot({ path: process.env.SHOT || "/tmp/zones-mobile.png", fullPage: false });
await p.context().close();
// Chủ quản: thêm khu vực + chỉnh lịch Telegram
p = await open("dohung712@gmail.com");
await p.evaluate(() => { localStorage.setItem("thidua-v2-cv", "clean"); localStorage.setItem("thidua-v2-zone-dept", "Thế Giới Di Động"); });
await p.evaluate(() => document.querySelector('[data-page="cv"]').click()); await p.waitForTimeout(1800);
await p.click("#zAdd"); await p.waitForTimeout(300);
await p.fill("#modalBody input[name=name]", "Quầy test UI"); await p.fill("#modalBody textarea[name=detail]", "**Sạch** bụi\nGọn"); await p.click("#modalBody [data-v=submit]"); await p.waitForTimeout(1000);
console.log("thêm:", await p.textContent("#toast"), "| hiện:", await p.$$eval(".zone b", (x) => x.some((y) => y.textContent === "Quầy test UI")));
psql("delete from public.clean_zones where name = 'Quầy test UI'; update public.clean_zones set staff_ids = '{}'; delete from public.clean_zone_checks");
const day = await p.$eval(".cal [data-day].today, [data-day].today", (x) => x.dataset.day).catch(() => null) || psql("select public.vn_today()");
await p.click(`[data-day="${day}"]`); await p.waitForTimeout(500);
await p.selectOption("#clSwap", "1003"); await p.click('#modalBody [data-v="swap"]'); await p.waitForTimeout(900);
console.log("đổi người:", await p.textContent("#toast"), "|", psql("select staff_id from public.cleaning where clean_date = public.vn_today()"));
psql("delete from public.cleaning where clean_date = public.vn_today()");
await p.evaluate(() => document.querySelector('[data-page="admin"]').click()); await p.waitForTimeout(1000);
await p.click('#aTabs [data-t="telegram"]'); await p.waitForTimeout(1000);
await p.selectOption('[data-it="clean"] .itFreq', "days"); await p.waitForTimeout(100);
console.log("hiện chọn thứ:", await p.isVisible('[data-it="clean"] .itDays'), "| tiktok có 'ngày hạn':", await p.$$eval('[data-it="tiktok"] .itFreq option', (x) => x.map((o) => o.value).join(",")));
await p.check('[data-it="clean"] .itDays input[value="2"]'); await p.check('[data-it="clean"] .itDays input[value="5"]'); await p.check('[data-it="clean"] .itOn'); await p.fill('[data-it="clean"] .itTime', "20:30");
await p.click("#tgSave"); await p.waitForTimeout(1000);
console.log("lưu lịch:", await p.textContent("#toast"), "|", psql("select value -> 2 from public.settings where key = 'NOTIFY_ITEMS'"));
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
