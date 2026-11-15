// Kiểm thử: Xếp hạng điểm, Của tôi, Quản lý → Điểm & DT, ẩn chức năng, Telegram theo đầu mục
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/ui-shots3"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
const ITEMS = { status: "success", items: [{ id: "daily", label: "Thi đua ngày", freq: "daily", time: "22:35", on: true, dow: 0 }, { id: "revenue", label: "Doanh thu QĐ lũy kế", freq: "daily", time: "22:40", on: false, dow: 0 }, { id: "score", label: "Bảng điểm xếp hạng", freq: "weekly", time: "22:50", on: false, dow: 0 }, { id: "tiktok", label: "TikTok", freq: "due", time: "20:00", on: false, dow: 0 }] };
async function session(email, viewport) {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport })).newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errors.push(email + " console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\/notify/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(JSON.parse(r.request().postData() || "{}").mode === "items" ? ITEMS : { status: "success", text: "📊 <b>Xem trước</b>", message: "ok" }) }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 8000 });
  return { b, p };
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
{
  const { b, p } = await session("dohung712@gmail.com", { width: 1360, height: 900 });
  await p.click("#nav [data-page=admin]"); await p.waitForTimeout(800);
  await p.click("#aTabs [data-t=score]"); await p.waitForTimeout(1000); await shot(p, "as-targets");
  await p.fill('[data-rev="1002"]', "250"); await p.click("#tgSaveRev"); await p.waitForTimeout(1200); console.log("target:", await p.textContent("#toast"));
  await p.click("#tgFill"); await p.waitForTimeout(300); await p.click('#modalBody [data-v=submit]'); await p.waitForTimeout(2500); console.log("fill:", await p.textContent("#toast"));
  for (const s of ["revenue", "service", "violations", "stars", "log"]) { await p.click(`#asSub [data-s=${s}]`); await p.waitForTimeout(1000); await shot(p, "as-" + s); }
  await p.click("#asSub [data-s=violations]"); await p.waitForTimeout(700); await p.selectOption('#vf select[name=s]', "1002"); await p.click('#vf button[type=submit]'); await p.waitForTimeout(1000); console.log("viol:", await p.textContent("#toast"));
  await p.click("#asSub [data-s=service]"); await p.waitForTimeout(700); await p.fill('[data-sv="1002"] [data-k=s5]', "15"); await p.fill('[data-sv="1003"] [data-k=s5]', "9"); await p.fill('[data-sv="1003"] [data-k=complaints]', "1"); await p.click("#svSave"); await p.waitForTimeout(1500); console.log("svc:", await p.textContent("#toast"));
  await p.click("#asSub [data-s=stars]"); await p.waitForTimeout(700); await p.check('.sp[value="1002"]'); await p.fill('#sf [name=d]', "300"); await p.fill('#sf [name=r]', "Thưởng tuần test"); await p.click('#sf button[type=submit]'); await p.waitForTimeout(1200); console.log("stars:", await p.textContent("#toast"));
  await p.click("#aTabs [data-t=telegram]"); await p.waitForTimeout(1200); await shot(p, "telegram");
  await p.click("#aTabs [data-t=settings]"); await p.waitForTimeout(1200);
  await p.check('.hd[data-r=employee][value="cv.rs"]'); await p.check('.hd[data-r=employee][value="store"]'); await p.click("#hdSave"); await p.waitForTimeout(1000); console.log("hide:", await p.textContent("#toast"));
  await shot(p, "settings");
  await p.click("#nav [data-page=score]"); await p.waitForTimeout(1500); await shot(p, "score");
  await p.click("#nav [data-page=me]"); await p.waitForTimeout(1500); await p.selectOption("#meStaff", "1002"); await p.waitForTimeout(1500); await shot(p, "me-1002");
  await b.close();
}
{
  const { b, p } = await session("nv1001@x.vn", { width: 390, height: 844 });
  await p.waitForTimeout(1000); await shot(p, "m-report");
  console.log("emp tabs:", await p.$$eval("#tabbar button", (x) => x.map((y) => y.textContent.trim())));
  await p.click("#tabbar [data-page=cv]"); await p.waitForTimeout(1000); console.log("cv tabs:", await p.$$eval("#cvTabs button", (x) => x.map((y) => y.textContent.trim())));
  await p.click("#tabbar [data-page=me]"); await p.waitForTimeout(1500); await shot(p, "m-me");
  await p.click("#tabbar [data-page=score]"); await p.waitForTimeout(1500); await shot(p, "m-score");
  await b.close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no browser errors");
