// Kiểm thử: Cài đặt → Thưởng & trừ sao, Môn X2/X3, Rule
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/ui-shots5"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
const b = await chromium.launch();
for (const vp of [{ width: 1360, height: 900 }, { width: 412, height: 915 }]) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errors.push("console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", "dohung712@gmail.com"); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('[data-page="admin"]').click()); await p.waitForTimeout(1000);
  await p.click("#aTabs [data-t=settings]"); await p.waitForTimeout(1200);
  await (await p.$("#starCard")).screenshot({ path: `${OUT}/star-${vp.width}.png` });
  if (vp.width > 1000) {
    await p.click("#psNow"); await p.waitForTimeout(200);
    console.log("preview day1:", (await p.textContent("#psPrev tr:first-child")).replace(/\s+/g, " "));
    await p.click("#psSave"); await p.waitForTimeout(1200); console.log("save:", await p.textContent("#toast"));
    await p.click("#psOld"); await p.click("#psSave"); await p.waitForTimeout(1200);
    await p.click("#aTabs [data-t=items]"); await p.waitForTimeout(900);
    await p.selectOption('#itRows tr:first-child select[name=mult]', "x3"); await p.click("#itSave"); await p.waitForTimeout(1500); console.log("items:", await p.textContent("#toast"));
    await p.evaluate(() => document.querySelector('[data-page="rules"]').click()); await p.waitForTimeout(1000); await p.screenshot({ path: `${OUT}/rules.png`, fullPage: true });
  }
}
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
