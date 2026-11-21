// Kiểm thử: CV → 📄 Tờ rơi — chủ quản tạo đợt (nhập số tờ), sửa nhân sự; NV thấy việc của mình, nộp ảnh album; việc cần làm trong báo cáo
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const psql = (sql) => execFileSync("psql", ["-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", process.env.TEST_DB || "t1", "-Atc", sql]).toString().trim();
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const OUT = process.env.OUT || "/tmp", errors = [];
// ảnh PNG 1×1 làm "ảnh chụp màn hình album"
const IMG = OUT + "/flyer-album.png"; writeFileSync(IMG, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
psql("delete from flyer_campaigns; update flyer_routes set last_used = null");
const b = await chromium.launch();
async function open(email, vp = { width: 1360, height: 900 }) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.evaluate(() => localStorage.setItem("thidua-v2-cv", "flyer"));
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(800);
  return p;
}
// Chủ quản tạo đợt 400 tờ, 1 ngày bắt đầu hôm nay
let p = await open("dohung712@gmail.com");
await p.evaluate(() => document.querySelector('[data-page="cv"]').click()); await p.waitForTimeout(1500);
await p.fill('#flGen [name=qty]', "400");
await p.evaluate(() => { const f = document.querySelector("#flGen"); f.start.value = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); f.days.value = "1"; });
await p.click('#flGen [type=submit]'); await p.waitForTimeout(1800);
console.log("toast tạo:", await p.textContent("#toast"));
console.log("DB đợt:", psql("select count(*) || ' tuyến, ' || sum(qty) || ' tờ' from flyer_tasks"));
// sửa nhân sự tuyến đầu: chỉ NV 1001
await p.click("[data-view]"); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelectorAll('#flEdit [name=who]').forEach((x) => { x.checked = x.value === "1001"; }));
await p.click('#modalBody [data-v=save]'); await p.waitForTimeout(1500);
console.log("toast sửa:", await p.textContent("#toast"), "| DB:", psql("select string_agg(staff_id || ':' || qty, ',') from flyer_assign where task_id = (select min(id) from flyer_tasks)"));
await p.screenshot({ path: OUT + "/flyer-admin.png", fullPage: true });
await p.context().close();
// NV 1001 trên điện thoại
p = await open("nv1001@x.vn", { width: 412, height: 915 });
await p.evaluate(() => document.querySelector('[data-page="cv"]').click()); await p.waitForTimeout(1500);
console.log("NV việc của tôi:", await p.$$eval("[data-rep]", (x) => x.length), "| tạo đợt (phải 0):", await p.$$eval("#flGen", (x) => x.length));
console.log("overflow ngang:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
await p.screenshot({ path: OUT + "/flyer-nv.png", fullPage: true });
await p.click("[data-rep]"); await p.waitForTimeout(400);
await p.setInputFiles("#flFiles", IMG); await p.waitForTimeout(800);
console.log("ảnh đã chọn:", await p.$$eval("#flPrev img", (x) => x.length));
await p.click("#flSend"); await p.waitForTimeout(1800);
console.log("toast nộp:", await p.textContent("#toast"), "| DB:", psql("select count(*) from flyer_assign where staff_id = '1001' and done_at is not null"));
await p.evaluate(() => document.querySelector('[data-page="report"]')?.click()); await p.waitForTimeout(2000);
console.log("việc cần làm tờ rơi:", await p.$$eval(".todo-i b", (x) => x.map((y) => y.textContent).filter((t) => /tờ rơi/i.test(t)).join(" | ") || "(không có)"));
psql("delete from flyer_campaigns; update flyer_routes set last_used = null");
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
