// Kiểm thử: CV → 💵 Quỹ (NV thêm khoản trên điện thoại, chủ quản xem/sửa/xoá)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/ui-shots9"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
const b = await chromium.launch();
async function login(email, ctx) {
  const p = await (await b.newContext(ctx)).newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errors.push(email + " console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.evaluate(() => localStorage.setItem("thidua-v2-cv", "fund"));
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1000);
  return p;
}
{ const p = await login("nv1001@x.vn", { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await p.click('#tabbar [data-page="cv"]'); await p.waitForTimeout(1500);
  await p.click('#fKind [data-k="thu"]'); await p.fill("#fTitle", "Nộp quỹ test"); await p.fill("#fAmt", "250000"); await p.selectOption("#fCat", { index: 1 });
  console.log("định dạng tiền:", await p.inputValue("#fAmt"));
  await p.click("#fSave"); await p.waitForTimeout(400); await p.click("#modalBody [data-v=ok]"); await p.waitForTimeout(1800);
  console.log("lưu:", await p.textContent("#toast"), "| số dư:", (await p.textContent(".fk.du b")));
  await p.screenshot({ path: `${OUT}/fund-mobile.png`, fullPage: true });
  await p.context().close(); }
{ const p = await login("dohung712@gmail.com", { viewport: { width: 1360, height: 900 } });
  await p.click('#nav [data-page="cv"]'); await p.waitForTimeout(1500);
  console.log("dòng lịch sử:", await p.$$eval(".fund-tbl tbody tr", (x) => x.length));
  await p.click(".fund-tbl [data-fedit]"); await p.waitForTimeout(500); await p.fill("#fAmt", "300000"); await p.click("#fSave"); await p.waitForTimeout(1500); console.log("sửa:", await p.textContent("#toast"));
  await p.click(".fund-tbl [data-fdel]"); await p.waitForTimeout(300); await p.click("#modalBody [data-v=ok]"); await p.waitForTimeout(1500); console.log("xoá:", await p.textContent("#toast"));
  await p.screenshot({ path: `${OUT}/fund-desktop.png`, fullPage: true });
  await p.context().close(); }
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
