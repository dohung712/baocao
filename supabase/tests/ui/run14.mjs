// Kiểm thử: 📈 Cập nhật lũy kế tuần — NV (điện thoại) nhập theo nhãn loại môn, QL mở khoá + chọn loại môn
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
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);
  return p;
}
psql(`insert into memberships(email, role, staff_id, stores) values ('nv1003@x.vn','employee','1003','{Topzone}') on conflict do nothing;
  insert into monthly_targets(staff_id, month, revenue_target, items) values ('1003', date_trunc('month', public.vn_today() - 1)::date, 500, '[{"name":"Laptop","target":130.1},{"name":"Mở thẻ","target":4}]')
  on conflict (staff_id, month) do update set items = excluded.items;
  delete from item_adjustments where staff_id = '1003'; delete from revenue_entries where staff_id = '1003' and kind = 'adjust'; delete from item_measures where name in ('Laptop', 'Mở thẻ');
  insert into settings(key, value, updated_by) values ('CUM_UNLOCK', jsonb_build_object('until', now() + interval '2 hour', 'staff', '["1003"]'::jsonb, 'by', 'test', 'at', now()), 'test') on conflict (key) do update set value = excluded.value;
  delete from score_log where staff_id = '1003' and kind = 'cumulative'`);
let p = await open("nv1003@x.vn", { width: 412, height: 915 });
console.log("nhắc:", (await p.$$eval(".remind-i", (x) => x.map((y) => y.textContent.replace(/\s+/g, " ").slice(0, 70)))).filter((t) => t.includes("lũy kế")).join(" | ") || "KHÔNG CÓ");
await p.click('.remind-i [data-ro="cum"]'); await p.waitForTimeout(700);
console.log("nhãn:", await p.$$eval("#modalBody .cum-row .mtag", (x) => x.map((y) => y.textContent.trim()).join(" / ")));
await p.fill('#modalBody input[name=rev]', "120.5"); await p.fill('#modalBody input[name=i0]', "80"); await p.fill('#modalBody input[name=i1]', "2.5");
const ov = await p.evaluate(() => document.querySelector(".modal-box").scrollWidth - document.querySelector(".modal-box").clientWidth); console.log("tràn ngang modal:", ov);
await p.screenshot({ path: process.env.SHOT || "/tmp/cum-mobile.png" });
await p.click('#modalBody [data-v=submit]'); await p.waitForTimeout(500);
console.log("cảnh báo:", (await p.textContent("#modalBody")).replace(/\s+/g, " ").slice(0, 110));
await p.click('#modalBody [data-v=ok]'); await p.waitForTimeout(1000);
console.log("toast:", await p.textContent("#toast"), "| DB:", psql("select count(*) from item_adjustments where staff_id = '1003'") + " môn,", psql("select sum(amount) from revenue_entries where staff_id = '1003' and entry_date between date_trunc('month', public.vn_today() - 1) and public.vn_today() - 1"), "DT");
console.log("nhắc sau khi xong:", await p.$$eval(".remind-i", (x) => x.filter((y) => y.textContent.includes("lũy kế")).length));
await p.context().close();
p = await open("dohung712@gmail.com");
await p.evaluate(() => document.querySelector('[data-page="admin"]').click()); await p.waitForTimeout(1000);
await p.click('#aTabs [data-t="score"]'); await p.waitForTimeout(800); await p.click('#asSub [data-s="cum"]'); await p.waitForTimeout(1000);
console.log("QL:", (await p.textContent("#asBody .pill")).trim(), "| dòng NV:", await p.$$eval("[data-cu]", (x) => x.length), "|", (await p.$$eval("#asBody tr", (x) => x.map((y) => y.textContent.replace(/\s+/g, " ")).filter((t) => t.includes("Tuần này")).length)), "đã cập nhật");
await p.selectOption('[data-ms="Laptop"]', "dtt"); await p.waitForTimeout(1000);
console.log("chọn loại:", await p.textContent("#toast"), "|", psql("select measure from item_measures where name = 'Laptop'"));
await p.click("#cuClose"); await p.waitForTimeout(800); console.log("khoá:", await p.textContent("#toast"));
psql("delete from item_adjustments where staff_id = '1003'; delete from revenue_entries where staff_id = '1003' and kind = 'adjust'; delete from item_measures where name in ('Laptop', 'Mở thẻ'); delete from settings where key = 'CUM_UNLOCK'");
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
