// Kiểm thử các trang mới: CV, Trợ lý, Rule, Target NV, Cài đặt
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/ui-shots2"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
async function session(email, viewport) {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport })).newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errors.push(email + " console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 8000 });
  return { b, p };
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
{
  const { b, p } = await session("dohung712@gmail.com", { width: 1360, height: 900 });
  await p.click("#nav [data-page=cv]"); await p.waitForTimeout(1200);
  for (const t of ["tiktok", "clean", "busy", "rs", "stats"]) { await p.click(`#cvTabs [data-t=${t}]`); await p.waitForTimeout(1000); await shot(p, "cv-" + t); }
  // đăng ký lịch bận cho ngày mai qua giao diện
  await p.click("#cvTabs [data-t=busy]"); await p.waitForTimeout(800);
  const tm = await p.evaluate(() => { const d = new Date(Date.now() + 2 * 864e5); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d); });
  await p.click(`[data-day="${tm}"]`); await p.waitForTimeout(400);
  await p.click('#bzShifts input[value="2"]'); await p.click('#modalBody [data-v=reg]'); await p.waitForTimeout(1200);
  console.log("busy toast:", await p.textContent("#toast"));
  await shot(p, "cv-busy-after");
  await p.click("#nav [data-page=assistant]"); await p.waitForTimeout(1000);
  for (const q of ["Ai chưa báo cáo hôm nay?", "Top sao tháng này", "NV 1", "Ai OFF / bận hôm nay?", "Ai chưa nộp TikTok kỳ gần nhất?", "Môn nào yếu nhất tháng này?"]) { await p.click(`[data-q="${q}"]`); await p.waitForTimeout(900); }
  await shot(p, "assistant");
  console.log("last answer:", (await p.$$eval(".bubble.bot", (e) => e.map((x) => x.textContent.slice(0, 120)))).slice(-3));
  await p.click("#nav [data-page=rules]"); await p.waitForTimeout(800); await shot(p, "rules");
  await p.click("#nav [data-page=admin]"); await p.waitForTimeout(800);
  await p.click("#aTabs [data-t=targets]"); await p.waitForTimeout(1000);
  const cell = await p.$("input[data-k]"); await cell.fill("9"); await p.click("#tgSave"); await p.waitForTimeout(1000);
  console.log("target toast:", await p.textContent("#toast")); await shot(p, "admin-targets");
  await p.click("#aTabs [data-t=settings]"); await p.waitForTimeout(1000); await shot(p, "admin-settings");
  await b.close();
}
{
  const { b, p } = await session("nv1001@x.vn", { width: 390, height: 844 });
  await p.waitForTimeout(800);
  await p.click("#tabbar [data-page=cv]"); await p.waitForTimeout(1200); await shot(p, "m-cv-tiktok");
  await p.click("#btnMore"); await p.waitForTimeout(400); await shot(p, "m-more");
  await b.close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no browser errors");
