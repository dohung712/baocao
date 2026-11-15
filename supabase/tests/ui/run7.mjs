// Kiểm thử: gợi ý tự hiện khi rê chuột (HELP_DELAY_S) và nhấn giữ trên điện thoại
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
const OUT = "/tmp/ui-shots7"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
execSync(`psql -h /tmp -p 5433 -U postgres -d t1 -qc "insert into settings(key,value) values ('HELP_DELAY_S','1') on conflict (key) do update set value = '1'"`);
const b = await chromium.launch();
async function login(email, ctxOpt) {
  const p = await (await b.newContext(ctxOpt)).newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);
  return p;
}
{ const p = await login("dohung712@gmail.com", { viewport: { width: 1360, height: 900 } });
  await p.hover('#nav [data-page="score"]'); await p.waitForTimeout(500); console.log("sau 0,5s:", !!(await p.$(".help-bubble")));
  await p.waitForTimeout(900); console.log("sau 1,4s:", (await p.textContent(".help-bubble").catch(() => "KHÔNG")).replace(/\s+/g, " ").slice(0, 80));
  await p.screenshot({ path: `${OUT}/hover.png` });
  const bb = await (await p.$(".help-bubble")).boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y - 4); await p.mouse.move(bb.x + bb.width - 20, bb.y + bb.height - 12, { steps: 8 }); await p.waitForTimeout(800);
  console.log("rê vào bong bóng vẫn còn:", !!(await p.$(".help-bubble")));
  await p.click('.help-bubble [data-h="ok"]');
  await p.evaluate(() => document.querySelector('[data-page="admin"]').click()); await p.waitForTimeout(1200);
  await p.hover('#aTabs [data-t="items"]'); await p.waitForTimeout(1500); console.log("tab Môn & sao:", (await p.textContent(".help-bubble b").catch(() => "KHÔNG")));
  await p.click('.help-bubble [data-h="off"]'); await p.mouse.move(5, 5); await p.hover('#aTabs [data-t="settings"]'); await p.waitForTimeout(1500); console.log("sau khi tắt:", !!(await p.$(".help-bubble")));
  await p.context().close(); }
{ const p = await login("nv1001@x.vn", { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const box = await (await p.$("#btnSend")).boundingBox();
  await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent("touchstart", { touches: [t], changedTouches: [t], bubbles: true })); }, { x: box.x + 10, y: box.y + 10 });
  await p.waitForTimeout(1100); console.log("nhấn giữ nút gửi:", (await p.textContent(".help-bubble b").catch(() => "KHÔNG")));
  await p.screenshot({ path: `${OUT}/longpress.png` });
  await p.context().close(); }
execSync(`psql -h /tmp -p 5433 -U postgres -d t1 -qc "delete from settings where key='HELP_DELAY_S'"`);
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
