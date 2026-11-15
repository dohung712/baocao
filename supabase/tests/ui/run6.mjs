// Kiểm thử: gợi ý sao theo kết quả siêu thị (chủ quản) + thưởng nóng (NV) + duyệt (chạy sau run4)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/ui-shots6"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("./sample-target-report.txt", import.meta.url), "utf8");
const errors = [];
const b = await chromium.launch();
async function login(email, vp) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errors.push(email + " console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1000);
  return p;
}
{ const p = await login("dohung712@gmail.com", { width: 1360, height: 900 });
  await p.evaluate(() => document.querySelector('[data-page="admin"]').click()); await p.waitForTimeout(1000);
  await p.click("#aTabs [data-t=items]"); await p.waitForTimeout(900);
  await p.fill("#sgText", REPORT); await p.dispatchEvent("#sgText", "change"); await p.waitForTimeout(500);
  const row = p.locator('.sg-blk').nth(1).locator('tr', { hasText: "Bảo hiểm Tổng" });
  await row.locator(".sgL").check(); await p.waitForTimeout(300);
  console.log("nhóm:", (await p.$$eval(".sg-tbl tbody tr", (x) => x.map((r) => r.cells[0].innerText.split("\n")[0] + "=" + r.cells[5].innerText.replace(/\s+/g, " ")))).join(" | "));
  await p.screenshot({ path: `${OUT}/suggest.png`, fullPage: true });
  await p.click("#sgApply"); await p.waitForTimeout(300); await p.click("#modalBody [data-v=ok]"); await p.waitForTimeout(2500);
  console.log("apply:", await p.textContent("#toast"));
  await p.context().close(); }
{ const p = await login("nv1001@x.vn", { width: 412, height: 915 });
  for (const inp of await p.$$("input.actual")) { const n = await inp.getAttribute("data-item"); await inp.fill(n === "Bảo hiểm Tổng" ? "12" : "1"); }
  await p.fill("#xRev", "12"); await p.waitForTimeout(1200); await p.click("#btnSend"); await p.waitForTimeout(2500);
  const pop = await p.$(".hot-pop"); console.log("popup thưởng nóng:", pop ? (await pop.innerText()).replace(/\s+/g, " ").slice(0, 160) : "KHÔNG");
  await p.screenshot({ path: `${OUT}/hot-popup.png` });
  if (pop) { await p.click("#modalBody [data-v=ok]"); await p.waitForTimeout(800); }
  await p.context().close(); }
{ const p = await login("dohung712@gmail.com", { width: 1360, height: 900 });
  await p.evaluate(() => document.querySelector('[data-page="admin"]').click()); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  console.log("tổng quan:", (await p.$$eval(".hm-card", (x) => x.map((c) => c.querySelector("small").textContent + "=" + c.querySelector("b").textContent))).join(" | "));
  await p.fill("#hmQ", "trừ sao"); await p.waitForTimeout(200); console.log("tìm 'trừ sao':", (await p.$$eval(".hm-item b", (x) => x.map((b) => b.textContent))).join(" | "));
  await p.click('.hm-item[data-go="F2b"]'); await p.waitForTimeout(1500); console.log("mở F2b:", await p.$eval("#aTabs .on", (b) => b.textContent), !!(await p.$("#starCard")));
  await p.click("#aTabs [data-t=home]"); await p.waitForTimeout(1200);
  await p.click('.hm-card [data-go="B5"]'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/approve.png` });
  const btn = await p.$('[data-hot][data-ok="1"]'); if (btn) { await btn.click(); await p.waitForTimeout(1500); console.log("duyệt:", await p.textContent("#toast")); } else console.log("không thấy thưởng nóng chờ duyệt");
  await p.context().close(); }
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
