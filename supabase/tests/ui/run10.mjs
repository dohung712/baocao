// Kiểm thử: CV → 📋 Việc — QL đăng việc (dán nội dung + ảnh, AI tóm tắt, Drive giả), NV xác nhận, QL xem tiến độ
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const OUT = "/tmp/ui-shots10"; mkdirSync(OUT, { recursive: true });
const fake = readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
// ảnh PNG 2x2
writeFileSync(`${OUT}/a.png`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64"));
const errors = [], calls = [];
const b = await chromium.launch();
async function login(email, ctx) {
  const p = await (await b.newContext(ctx)).newPage();
  p.on("pageerror", (e) => errors.push(email + " pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|thumbnail/.test(m.text())) errors.push(email + " console: " + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)|drive\.google\.com/, (r) => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, (r) => r.fulfill({ contentType: "text/javascript", body: fake }));
  await p.route(/functions\/v1\/tasks/, (r) => { const j = JSON.parse(r.request().postData() || "{}"); calls.push(j.mode + (j.mode === "upload" ? ":" + j.mime.split("/").pop().slice(0, 20) : j.mode === "summarize" ? `(${/Galaxy S25 \| 22990000/.test(j.text) ? "xlsx" : ""}${/kiểm kê ngày 20\/11/.test(j.text) ? "+docx" : ""}+${j.files.length}ảnh)` : ""));
    const body = j.mode === "summarize" ? { status: "success", title: "Triển khai CTKM Samsung T11", summary: "• Giảm 10% Galaxy S25\n• Áp dụng 15–30/11\n• Báo cáo số bán mỗi tối", notes: "• Không áp dụng kèm trả góp 0%", deadline: "2026-11-30", repeat: "week", long_term: false, repeat_reason: "Báo cáo số bán mỗi tối trong đợt" }
      : j.mode === "upload" ? { status: "success", file: { id: "FILEID1234567", name: j.name, mime: j.mime, url: "https://drive.google.com/file/d/FILEID1234567/view", size: 2048 } } : { status: "success" };
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }); });
  await p.route(/functions\/v1\/(notify|assistant)/, (r) => r.fulfill({ contentType: "application/json", body: '{"status":"success","items":[]}' }));
  await p.goto("http://localhost:8790/v2/");
  await p.evaluate(() => localStorage.setItem("thidua-v2-cv", "tasks"));
  await p.fill("#lEmail", email); await p.fill("#lPass", "x"); await p.click("#fPass button[type=submit]");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1000);
  return p;
}
{ const p = await login("dohung712@gmail.com", { viewport: { width: 1360, height: 900 } });
  await p.click('#nav [data-page="cv"]'); await p.waitForTimeout(1500);
  await p.click('#tkSubs [data-s="new"]'); await p.waitForTimeout(500);
  await p.click('#tkKind [data-k="announce"]');
  await p.fill("#tkContent", "Từ 15/11 đến 30/11 giảm 10% Galaxy S25 cho khách mua kèm bảo hiểm. Mỗi tối báo cáo số bán vào nhóm.");
  await p.setInputFiles("#tkFiles", [`${OUT}/a.png`, `${OUT}/kh.docx`, `${OUT}/gia.xlsx`, `${OUT}/tailieu.zip`]); await p.waitForTimeout(800);
  console.log("file chờ:", (await p.$$eval("#tkPrev .chip", (x) => x.map((c) => c.textContent.replace(/\s+/g, " ").trim()))).join(" | "));
  await p.click("#tkAi"); await p.waitForTimeout(800);
  console.log("AI:", await p.inputValue("#tkTitle"), "|", (await p.inputValue("#tkSum")).split("\n").length, "ý | hạn", await p.inputValue("#tkDl"));
  console.log("cảnh báo:", (await p.textContent("#tkWarn")).replace(/\s+/g, " ").slice(0, 120), "| lưu ý:", await p.inputValue("#tkNotes"));
  await p.click("[data-apply-rep]"); await p.waitForTimeout(200); console.log("sau khi chọn:", await p.inputValue("#tkRemind"), "| cảnh báo còn:", (await p.textContent("#tkWarn")).trim().length);
  await p.check("#tkImp");
  await p.screenshot({ path: `${OUT}/form.png`, fullPage: true });
  await p.click("#tkSave"); await p.waitForTimeout(2500); console.log("đăng:", await p.textContent("#toast"), "| gọi:", calls.join(","));
  // giao việc cho NV 1001
  await p.click('#tkSubs [data-s="new"]'); await p.waitForTimeout(400); await p.click('#tkKind [data-k="assign"]');
  await p.fill("#tkTitle", "Kiểm tra giá kệ Samsung"); await p.fill("#tkContent", "Kiểm tra giá kệ hằng tuần theo quy định"); await p.check('.tkStaff[value="1001"]');
  console.log("cảnh báo không AI:", (await p.textContent("#tkWarn")).trim() ? "có" : "không", "| tự ẩn:", await p.inputValue("#tkHide"));
  await p.click("#tkSave"); await p.waitForTimeout(400); const cf = await p.$("#modalBody [data-v=ok]"); console.log("hỏi xác nhận:", !!cf); if (cf) await cf.click(); await p.waitForTimeout(2000); console.log("giao:", await p.textContent("#toast"));
  await p.click('#tkSubs [data-s="link"]'); await p.waitForTimeout(400); await p.click('[data-go-new="link"]'); await p.waitForTimeout(300);
  await p.fill("#tkTitle", "Sheet tồn kho"); await p.fill("#tkUrl", "https://docs.google.com/spreadsheets/d/x"); await p.fill("#tkGroup", "Trang tính quản lý"); await p.click("#tkSave"); await p.waitForTimeout(1500); console.log("link:", await p.textContent("#toast"));
  await p.context().close(); }
{ const p = await login("nv1001@x.vn", { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await p.click('#tabbar [data-page="cv"]'); await p.waitForTimeout(1800);
  console.log("NV thấy:", await p.$$eval(".tk-card .tk-head b", (x) => x.map((y) => y.textContent).join(" | ")), "| badge:", await p.textContent('#cvTabs [data-t="tasks"]'));
  await p.screenshot({ path: `${OUT}/staff.png`, fullPage: true });
  await p.click("[data-ack]"); await p.waitForTimeout(1500); console.log("đọc:", await p.textContent("#toast"));
  await p.click("[data-done]"); await p.waitForTimeout(400); await p.fill("#modalBody textarea", "Đã chỉnh giá 12 sản phẩm"); await p.click('#modalBody [data-v=submit]'); await p.waitForTimeout(1500); console.log("xong:", await p.textContent("#toast"));
  await p.context().close(); }
{ const p = await login("dohung712@gmail.com", { viewport: { width: 1360, height: 900 } });
  await p.click('#nav [data-page="cv"]'); await p.waitForTimeout(1800);
  console.log("tiến độ:", (await p.$$eval(".tk-prog summary", (x) => x.map((y) => y.textContent.replace(/\s+/g, " ").trim()))).join(" | "));
  await p.click(".tk-prog summary"); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/board.png`, fullPage: true });
  await p.context().close(); }
await b.close();
console.log(errors.length ? errors.join("\n") : "no browser errors");
