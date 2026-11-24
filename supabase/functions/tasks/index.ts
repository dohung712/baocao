// Edge Function "tasks": phục vụ CV → 📋 Việc và Bảng việc (D12)
//  • summarize:    AI (Gemini) tóm tắt nội dung dán vào + ảnh/PDF đính kèm thành ý chính            (quản lý)
//  • upload:       tải file lên thư mục Google Drive qua Apps Script (giữ mã bí mật ở máy chủ)       (quản lý)
//  • delete:       chuyển file Drive vào thùng rác khi xoá việc                                      (quản lý)
//  • job_upload:   NV nộp ảnh việc → <thư mục ảnh>/<Mã - Tên NV>/<Hạng mục>/<ngày giờ>_<việc>_n.jpg  (NV của việc / quản lý)
//  • shift_latest: lấy file lịch ca mới nhất trong thư mục Drive của tool sắp ca                      (quản lý)
//  • shift_put:    D17 lưu file lịch ca .xlsx đã duyệt (🤖 Xếp ca) vào thư mục lịch ca                 (quản lý)
//  • xepca_rules:  D17c rule xếp ca bằng chữ → AI → bản xem trước cấu hình (chưa lưu)                  (quản lý)
import { json, CORS, rest, member, gemini, vnParts } from "../_shared/common.ts";
import { SCHEMA, systemPrompt, toFields } from "./prompt.ts";
import { driveVersion } from "../_shared/drive.ts";
import { rtSync } from "../_shared/rtask.ts";
import { xepcaRules } from "./xepca-rules.ts";

const secret = async (k: string) => (await rest("private_settings?select=value&key=eq." + k))[0]?.value as string | undefined;
const setting = async (k: string) => (await rest("settings?select=value&key=eq." + k))[0]?.value;

async function drive(payload: Record<string, unknown>) {
  const [url, sec] = await Promise.all([secret("DRIVE_UPLOAD_URL"), secret("DRIVE_UPLOAD_SECRET")]);
  if (!url || !sec) throw new Error("Chưa nối Google Drive (thiếu địa chỉ Apps Script).");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, secret: sec }), redirect: "follow" });
  const t = await r.text(); let j: any; try { j = JSON.parse(t); } catch { throw new Error("Drive trả lời không hợp lệ (HTTP " + r.status + ")"); }
  if (!j.ok) throw new Error("Drive lỗi: " + (j.error || "không rõ"));
  return j;
}
const OLD_SCRIPT = "Apps Script trên Google Drive còn bản cũ: chủ quản cập nhật bản 2 (supabase/apps-script/drive-upload.gs) rồi thử lại.";
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|#\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();

async function summarize(text: string, files: { mime: string; data: string }[]) {
  const key = await secret("GEMINI_API_KEY");
  if (!key) throw new Error("Chưa cài khoá AI (Quản lý → Cài đặt → Trợ lý AI).");
  const parts: any[] = [{ text: "NỘI DUNG CÔNG VIỆC / THÔNG BÁO CẦN TÓM TẮT:\n\n" + (text || "(xem file đính kèm)") }];
  for (const f of files.slice(0, 4)) if (/^(image\/|application\/pdf)/.test(f.mime) && f.data.length < 14_000_000) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
  const today = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const out = await gemini(key, { systemInstruction: { parts: [{ text: systemPrompt(today) }] }, contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2500, responseMimeType: "application/json", responseSchema: SCHEMA } });
  try { return toFields(JSON.parse(out)); }
  catch { return { title: "", summary: out, notes: "", deadline: null, repeat: "none", long_term: false, repeat_reason: "" }; }
}

// NV nộp ảnh cho 1 việc: kiểm tra quyền, dựng đường dẫn thư mục, tải lên, nhớ thư mục của NV
async function jobUpload(m: { role: string; staff_id: string | null; stores: string[] }, body: any) {
  const id = Number(body.job_id), idx = Math.max(1, Math.min(10, Number(body.idx) || 1)), data = String(body.data || "");
  if (!id) throw new Error("Thiếu mã việc.");
  if (!data || data.length > 14_000_000) throw new Error("Ảnh trống hoặc quá lớn.");
  const job = (await rest(`jobs?select=id,staff_id,title,type_id,status&id=eq.${id}`))[0];
  if (!job) throw new Error("Không tìm thấy việc.");
  const st = (await rest(`staff?select=id,name,dept&id=eq.${encodeURIComponent(job.staff_id)}`))[0];
  if (!st) throw new Error("Không tìm thấy nhân viên.");
  if (m.role === "employee" && m.staff_id !== job.staff_id) throw new Error("Đây không phải việc của bạn.");
  if (m.role === "manager" && !(m.stores || []).includes(st.dept)) throw new Error("Ngoài phạm vi của bạn.");
  if (job.status === "missed") throw new Error("Việc đã bỏ lỡ, nhờ quản lý mở lại.");
  if ((await driveVersion()) < 2) throw new Error(OLD_SCRIPT);
  const type = job.type_id ? (await rest(`job_types?select=name&id=eq.${job.type_id}`))[0]?.name : "";
  const base = await setting("JOB_DRIVE_PATH");
  const path = [...(Array.isArray(base) ? base.map(String) : ["Tool Báo Cáo", "01 - Ảnh minh chứng công việc"]), cleanName(`${st.id} - ${st.name}`), cleanName(type || "Việc khác")];
  const now = vnParts();
  const name = `${now.date}_${now.hm.replace(":", "h")}_${cleanName(job.title).slice(0, 60)}_${idx}.jpg`;
  const f = await drive({ action: "upload", path, name, mime: "image/jpeg", data });
  if (!f.version || !Array.isArray(f.folders)) {   // Apps Script bản cũ bỏ qua path → file rơi vào thư mục gốc: dọn đi rồi báo
    if (f.id) await drive({ action: "delete", ids: [f.id] }).catch(() => {});
    throw new Error(OLD_SCRIPT);
  }
  const folder = f.folders[f.folders.length - 2];   // thư mục "<Mã - Tên NV>"
  if (folder?.id) await rest("job_folders?on_conflict=staff_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ staff_id: st.id, folder_id: folder.id, folder_url: folder.url || "", updated_at: new Date().toISOString() }) }).catch(() => {});
  return { id: f.id, url: f.url, name: f.name, size: f.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const m = await member(req);
    const body = await req.json().catch(() => ({}));
    if (body.mode === "job_upload") return json({ status: "success", file: await jobUpload(m, body) });
    if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý / trưởng ca dùng được chức năng này.");
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
    if (body.mode === "shift_latest") {
      if ((await driveVersion()) < 2) throw new Error(OLD_SCRIPT);
      const p = await setting("SHIFT_DRIVE_PATH");
      const r = await drive({ action: "latest", path: Array.isArray(p) ? p.map(String) : ["Tool Báo Cáo", "02 - Lịch ca làm việc"] });
      if (!r.version) throw new Error(OLD_SCRIPT);
      return json({ status: "success", file: r.file || null, data: r.data || "", folder: r.folder || null });
    }
    if (body.mode === "shift_put") {   // D17 🤖 Xếp ca: lưu file .xlsx đã duyệt vào thư mục lịch ca (cùng chỗ tool tự đọc)
      const data = String(body.data || ""), name = cleanName(String(body.name || "")).slice(0, 150);
      if (!data || data.length > 5_000_000 || !/\.xlsx$/i.test(name)) throw new Error("File lịch ca không hợp lệ.");
      if ((await driveVersion()) < 2) throw new Error(OLD_SCRIPT);
      const p = await setting("SHIFT_DRIVE_PATH");
      const f = await drive({ action: "upload", path: Array.isArray(p) ? p.map(String) : ["Tool Báo Cáo", "02 - Lịch ca làm việc"], name,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data });
      if (!f.version || !Array.isArray(f.folders)) { if (f.id) await drive({ action: "delete", ids: [f.id] }).catch(() => {}); throw new Error(OLD_SCRIPT); }
      return json({ status: "success", file: { id: f.id, name: f.name, url: f.url, updated: f.updated || "" } });
    }
    if (body.mode === "xepca_rules") {   // D17c: rule xếp ca bằng chữ → AI → bản xem trước cấu hình (chưa lưu)
      const key = await secret("GEMINI_API_KEY");
      if (!key) throw new Error("Chưa cài khoá AI (Quản lý → Cài đặt → Trợ lý AI).");
      const text = String(body.text || "").trim().slice(0, 4000);
      if (!text) throw new Error("Chưa nhập rule.");
      const cfg = (await setting("XEPCA_CFG")) || {}, slots = (await setting("SHIFT_SLOTS")) || [];
      const staff = await rest("staff?select=id,name&hidden=eq.false");
      return json({ status: "success", ...(await xepcaRules(key, text, cfg, staff, Array.isArray(slots) ? slots : [])) });
    }
    if (body.mode === "status") return json({ status: "success", drive: !!(await secret("DRIVE_UPLOAD_URL")), ai: !!(await secret("GEMINI_API_KEY")) });
    // D13 việc lặp lại: lưu link trang tính (QL dán link) · đọc trang tính + giao việc hôm nay ngay
    if (body.mode === "rt_link") {
      const id = String(body.sheet || "").match(/[-\w]{25,}/)?.[0];
      if (!id) throw new Error("Link trang tính không hợp lệ (dán link docs.google.com/spreadsheets/d/…).");
      await rest("settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "RT_SHEET_ID", value: id, updated_by: m.email, updated_at: new Date().toISOString() }) });
      return json({ status: "success", ...(await rtSync(m.email)) });
    }
    if (body.mode === "rt_sync") return json({ status: "success", ...(await rtSync(m.email)) });
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
