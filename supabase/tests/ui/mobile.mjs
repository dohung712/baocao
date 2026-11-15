// Chụp giao diện điện thoại (NV) để soát bố cục: node mobile.mjs [tên-thư-mục]
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/ui-mobile/" + (process.argv[2] || "now"); mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const errors = [];
const b = await chromium.launch();
for (const [name, vp] of [["6.5in-412", { width: 412, height: 915 }], ["6.1in-390", { width: 390, height: 844 }], ["6.9in-440", { width: 440, height: 956 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: true, hasTouch: true, acceptDownloads: true }); const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(name + " pageerror: " + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\//, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.fill("#lEmail", "nv1001@x.vn"); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);
  const inputs = await p.$$("input.actual"); for (const [i, inp] of inputs.entries()) await inp.fill(String(i + 1));
  await p.waitForTimeout(1500);
  const ow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, "overflow-x:", ow);
  await p.screenshot({ path: `${OUT}/${name}-report.png`, fullPage: true });
  if (name.startsWith("6.5")) {
    await p.screenshot({ path: `${OUT}/${name}-report-view.png` });
    // gửi báo cáo khi chưa nhập DT → phải báo thiếu
    const rev = await p.$("#xRev"); if (rev) { await rev.fill(""); await p.click("#btnSend"); await p.waitForTimeout(600); console.log("thiếu DT:", await p.textContent("#toast")); await rev.fill("35"); await p.waitForTimeout(300); }
    await p.click("#btnSend"); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${name}-done.png` });
    const dl = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await p.click("#doneImg"); const d = await dl;
    if (d) { await d.saveAs(`${OUT}/report-image.png`); console.log("ảnh:", d.suggestedFilename()); } else console.log("không có ảnh tải về");
    await p.click('#modalBody [data-v=ok]').catch(() => {}); await p.waitForTimeout(800);
    for (const pg of ["score", "me"]) { await p.click(`#tabbar [data-page=${pg}]`); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${name}-${pg}.png`, fullPage: true }); }
    await p.click("#tabbar [data-page=score]"); await p.waitForTimeout(1200); await p.click('.sc-row.mine'); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${name}-score-detail.png` });
    await p.click('#modalBody [data-v=ok]'); const other = await p.$('.sc-row:not(.mine)'); if (other) { await other.click(); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${name}-score-other.png` }); }
  }
  await ctx.close();
}
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
