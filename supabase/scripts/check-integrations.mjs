// Kiểm tra nối Google Drive (Apps Script) và AI (Gemini) bằng khoá trong GitHub Secrets. Chỉ in trạng thái.
const { DRIVE_UPLOAD_URL: url, DRIVE_UPLOAD_SECRET: sec, GEMINI_API_KEY: key } = process.env;
if (url && sec) {
  try {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: sec, action: "upload", name: "kiem-tra.png", mime: "image/png", data: png, sub: "_kiem-tra" }) });
    const j = JSON.parse(await r.text());
    if (j.ok) { await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: sec, action: "delete", ids: [j.id] }) }); console.log("Drive: OK (tải lên + xoá thử được)"); }
    else console.log("Drive: LỖI", j.error);
  } catch (e) { console.log("Drive: LỖI", e.message); }
} else console.log("Drive: chưa có khoá");
if (key) {
  for (const m of ["gemini-3-flash-preview", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: "Trả lời đúng: OK" }] }] }), signal: AbortSignal.timeout(60000) }).catch((e) => ({ ok: false, status: "hết giờ / lỗi mạng" }));
    console.log(`AI ${m}: HTTP ${r.status}`); if (r.ok) break;
  }
} else console.log("AI: chưa có khoá");
