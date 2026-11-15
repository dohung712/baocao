// Edge Function "tasks": phục vụ CV → 📋 Việc
//  • summarize: AI (Gemini) tóm tắt nội dung dán vào + ảnh/PDF đính kèm thành ý chính
//  • upload:    tải file lên thư mục Google Drive qua Apps Script (giữ mã bí mật ở máy chủ)
//  • delete:    chuyển file Drive vào thùng rác khi xoá việc
// Chỉ quản lý / chủ quản dùng.
import { json, CORS, rest, member, gemini } from "../_shared/common.ts";

const secret = async (k: string) => (await rest("private_settings?select=value&key=eq." + k))[0]?.value as string | undefined;

async function drive(payload: Record<string, unknown>) {
  const [url, sec] = await Promise.all([secret("DRIVE_UPLOAD_URL"), secret("DRIVE_UPLOAD_SECRET")]);
  if (!url || !sec) throw new Error("Chưa nối Google Drive (thiếu địa chỉ Apps Script).");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, secret: sec }), redirect: "follow" });
  const t = await r.text(); let j: any; try { j = JSON.parse(t); } catch { throw new Error("Drive trả lời không hợp lệ (HTTP " + r.status + ")"); }
  if (!j.ok) throw new Error("Drive lỗi: " + (j.error || "không rõ"));
  return j;
}

async function summarize(text: string, files: { mime: string; data: string }[]) {
  const key = await secret("GEMINI_API_KEY");
  if (!key) throw new Error("Chưa cài khoá AI (Quản lý → Cài đặt → Trợ lý AI).");
  const parts: any[] = [{ text: "NỘI DUNG CÔNG VIỆC CẦN TRIỂN KHAI:\n" + (text || "(xem file đính kèm)") }];
  for (const f of files.slice(0, 4)) if (/^(image\/|application\/pdf)/.test(f.mime) && f.data.length < 14_000_000) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const system = `Bạn là trợ lý của quản lý siêu thị bán lẻ điện thoại (Thế Giới Di Động / Topzone). Hôm nay ${today}. Đọc nội dung (và file đính kèm nếu có) rồi tóm tắt để nhân viên đọc nhanh trên điện thoại. ` +
    "Trả về JSON đúng các khoá: " +
    "\"title\": tiêu đề công việc ngắn gọn ≤ 70 ký tự; " +
    "\"deadline\": hạn chót dạng YYYY-MM-DD nếu nội dung có nêu (suy ra năm từ hôm nay), không có thì null; " +
    "\"main\": mảng các ý NỘI DUNG CHÍNH (việc phải làm, đối tượng, thời gian áp dụng, con số), tối đa 6 ý, mỗi ý 1 câu ngắn; " +
    "\"notes\": mảng các LƯU Ý (điều cấm, điều dễ sai, chế tài, giấy tờ cần, người liên hệ), tối đa 4 ý, không có thì []; " +
    "\"repeat\": việc có cần nhắc lại định kỳ không: \"week\" | \"month\" | \"2month\" | \"none\"; " +
    "\"long_term\": true nếu là quy định / quy trình áp dụng lâu dài (không hết hạn), false nếu là việc thời vụ (CTKM, sự kiện, đợt kiểm kê… có thời hạn); " +
    "\"repeat_reason\": 1 câu giải thích vì sao chọn repeat / long_term. " +
    "Không thêm thông tin không có trong nội dung. Tiếng Việt.";
  const out = await gemini(key, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1800, responseMimeType: "application/json" } });
  const list = (x: unknown) => (Array.isArray(x) ? x : String(x || "").split("\n")).map((v) => String(v).replace(/^[•\-\*\s]+/, "").trim()).filter(Boolean);
  try {
    const o = JSON.parse(out);
    const main = list(o.main ?? o.summary), notes = list(o.notes);
    return { title: String(o.title || "").slice(0, 120), deadline: /^\d{4}-\d{2}-\d{2}$/.test(o.deadline || "") ? o.deadline : null,
      summary: main.map((v) => "• " + v).join("\n"), notes: notes.map((v) => "• " + v).join("\n"),
      repeat: ["week", "month", "2month"].includes(o.repeat) ? o.repeat : "none", long_term: !!o.long_term, repeat_reason: String(o.repeat_reason || "").slice(0, 300) };
  }
  catch { return { title: "", summary: out, notes: "", deadline: null, repeat: "none", long_term: false, repeat_reason: "" }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const m = await member(req);
    if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý / trưởng ca dùng được chức năng này.");
    const body = await req.json().catch(() => ({}));
    if (body.mode === "summarize") return json({ status: "success", ...(await summarize(String(body.text || "").slice(0, 20000), Array.isArray(body.files) ? body.files : [])) });
    if (body.mode === "upload") {
      const name = String(body.name || "file").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150), mime = String(body.mime || "application/octet-stream"), data = String(body.data || "");
      if (!data || data.length > 14_000_000) throw new Error("File trống hoặc quá lớn (tối đa ~10MB).");
      const f = await drive({ action: "upload", name, mime, data, sub: String(body.sub || "").slice(0, 60) });
      return json({ status: "success", file: { id: f.id, name: f.name, mime, url: f.url, size: f.size } });
    }
    if (body.mode === "delete") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x: string) => /^[\w-]{10,}$/.test(x)).slice(0, 20);
      if (ids.length) await drive({ action: "delete", ids });
      return json({ status: "success" });
    }
    if (body.mode === "status") return json({ status: "success", drive: !!(await secret("DRIVE_UPLOAD_URL")), ai: !!(await secret("GEMINI_API_KEY")) });
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
