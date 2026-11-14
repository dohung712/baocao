// Chạy thử giao diện v2 trên trình duyệt không giao diện với dữ liệu cục bộ.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const BASE = "http://localhost:8790/v2/";
const OUT = process.env.OUT || "/tmp/ui-shots";
mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];

async function session(email, viewport) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(email + " console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.goto(BASE);
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 8000 });
  return { b, p };
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// ---- Chủ quản, máy tính ----
{
  const { b, p } = await session("dohung712@gmail.com", { width: 1360, height: 900 });
  await p.waitForSelector("#rRows tr", { timeout: 8000 });
  // chọn NV 1000 và nhập số
  await p.selectOption("#rStaff", "1000");
  await p.waitForTimeout(800);
  const inputs = await p.$$("input.actual");
  for (const [i, el] of inputs.entries()) await el.fill(String(i % 2 ? 0 : 5));
  await p.waitForTimeout(1200);
  await shot(p, "1-report-filled");
  console.log("sum:", (await p.textContent("#rSum")).replace(/\s+/g, " ").trim());
  await p.click("#btnSend"); await p.waitForTimeout(1500);
  await shot(p, "2-report-done");
  console.log("modal:", (await p.textContent("#modalBody")).replace(/\s+/g, " ").slice(0, 200));
  await p.click('#modalBody [data-v="ok"]');
  for (const page of ["history", "ranking", "store", "admin"]) {
    await p.click(`#nav [data-page=${page}]`); await p.waitForTimeout(1500); await shot(p, "3-" + page);
  }
  for (const t of ["lock", "staff", "items", "settings", "telegram", "members", "audit"]) {
    await p.click(`#aTabs [data-t=${t}]`); await p.waitForTimeout(900); await shot(p, "4-admin-" + t);
  }
  // dán số liệu siêu thị
  await p.click("#nav [data-page=store]"); await p.waitForTimeout(800);
  await p.click("#sPaste summary");
  await p.fill("#sText", "Bảo hiểm tổng DOANH THU\nTỔNG 90.21 332.25 27.2% 31.1% -\nAAR_DNA_HCH - 351 Nguyễn Hữu Thọ 65.36 208.85 31.3% 35.9% 162\nTGD_DNA_HCH - 351 Nguyễn Hữu Thọ 24.85 123.40 20.1% 23.1% 184\nVAS SỐ LƯỢNG\nTỔNG 59 76 77.6% 89.6% -");
  await p.click("#sParse"); await p.click("#sSave"); await p.waitForTimeout(1200);
  await shot(p, "5-store-saved");
  await b.close();
}
// ---- Nhân viên, điện thoại ----
{
  const { b, p } = await session("nv1001@x.vn", { width: 390, height: 844 });
  await p.waitForSelector("#rRows tr", { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  await shot(p, "6-mobile-report");
  await p.click("#tabbar [data-page=ranking]"); await p.waitForTimeout(1200); await shot(p, "7-mobile-ranking");
  await p.click("#tabbar [data-page=history]"); await p.waitForTimeout(1200); await shot(p, "8-mobile-history");
  console.log("employee tabs:", await p.$$eval("#tabbar button", (bs) => bs.map((x) => x.textContent.trim())));
  await b.close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no browser errors");
