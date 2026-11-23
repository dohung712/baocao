// Kiểm tra khuôn tóm tắt công việc (không gọi AI): kết quả AI đã ghi lại cho thông báo mẫu → các ô của tool phải đủ ý bắt buộc
import { readFileSync } from "node:fs";
const { toFields, systemPrompt, SCHEMA } = await import("../functions/tasks/prompt.ts");
// LIVE=1 + GEMINI_API_KEY: gọi AI thật với thông báo mẫu (chạy trong GitHub Actions), không in nội dung
let ai = JSON.parse(readFileSync(new URL("./fixtures/task-unipass.ai.json", import.meta.url), "utf8"));
if (process.env.LIVE && process.env.GEMINI_API_KEY) {
  const text = readFileSync(new URL("./fixtures/task-unipass.txt", import.meta.url), "utf8"), today = "Chủ Nhật, 15/11/2026";
  for (const m of ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(today) }] }, contents: [{ role: "user", parts: [{ text: "NỘI DUNG CÔNG VIỆC / THÔNG BÁO CẦN TÓM TẮT:\n\n" + text }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2500, responseMimeType: "application/json", responseSchema: SCHEMA } }) });
    if (!r.ok) { console.log(`AI ${m}: HTTP ${r.status}`); continue; }
    const j = await r.json(); ai = JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("")); console.log(`AI tóm tắt mẫu bằng ${m}:`); break;
  }
}
const f = toFields(ai), fail = [];
const must = (cond, msg) => { if (!cond) fail.push(msg); };
must(/Hế Lô Xinh Viên/.test(f.title), "tiêu đề giữ tên chương trình");
must(f.deadline === "2026-11-14", "hạn hoàn tất = 14/11/2026 (không lấy ngày bắt đầu 13/11)");
must(/Hạn hoàn tất: 22:00 14\/11\/2026/.test(f.summary), "dòng hạn kèm giờ");
must(/đến khi có thông báo mới/.test(f.summary), "thời gian áp dụng");
for (const k of ["8%", "Laptop giảm 10%", "Apple giảm 5%", "Phụ kiện giảm 10%", "X2"]) must(f.summary.includes(k), "đủ mức khuyến mãi: " + k);
must(/đơn hàng đầu tiên/.test(f.notes), "lưu ý chỉ đơn đầu tiên theo nhóm hàng");
must(/mã PMH/.test(f.notes), "lưu ý lấy mã PMH");
must((f.notes.match(/📞/g) || []).length === 1 && /0936664005/.test(f.notes), "người hỗ trợ 1 lần, có SĐT");
must(f.repeat === "none" && f.long_term === true, "không lặp lại, việc lâu dài");
must(!/Chào anh chị|Trân Trọng/i.test(f.summary + f.notes), "bỏ lời chào/ký tên");
must(systemPrompt("x").includes("đến khi có thông báo mới") && SCHEMA.required.includes("contacts"), "lời nhắc có quy tắc lâu dài + khuôn JSON");
console.log(fail.length ? "✗ " + fail.join("; ") : "✓ tóm tắt mẫu UniPass đủ ý");
if (fail.length) process.exit(1);
