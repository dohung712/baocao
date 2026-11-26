// D28 AI xem ảnh "nghi không phải ảnh chụp màn hình" (D13d): đúng là ảnh chụp màn hình → tự duyệt, không báo QL.
// Hiểu biết về các kiểu ảnh chụp màn hình hợp lệ (chủ quản dạy) nằm ở cài đặt SHOT_AI_HINTS — thêm kiểu mới không cần sửa code.
import { rest, gemini } from "./common.ts";

export const SHOT_HINTS_DEFAULT = [
  "Ảnh chụp màn hình iPhone có thể có viền bo tròn 4 góc, nền xám / trắng quanh khung, thanh trạng thái (giờ, sóng, wifi, pin) ở trên HOẶC ở cạnh phải, Dynamic Island — vẫn là ảnh chụp màn hình hợp lệ.",
  "Ảnh chụp màn hình máy gập / màn hình đôi (iPhone Duo, Galaxy Fold) có thể có 2 khung cạnh nhau hoặc khổ gần vuông — hợp lệ.",
  "Ảnh chụp màn hình LINE / Zalo / Facebook / TikTok: có khung chat, bong bóng tin nhắn, danh sách tên NV đánh số (1. Thy 2. Trang…), ảnh thu nhỏ trong chat, ô nhập 'Aa', bàn phím — hợp lệ.",
  "KHÔNG hợp lệ: ảnh chụp bằng camera một màn hình khác (thấy viền máy thật, phản chiếu, lệch góc, moiré), ảnh chụp cảnh thật (kệ hàng, quầy, người).",
];
const toB64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

export async function shotAiCheck(photos: { id?: string; url?: string }[]): Promise<{ ok: boolean; why: string }> {
  const key = (await rest("private_settings?select=value&key=eq.GEMINI_API_KEY"))[0]?.value;
  if (!key) return { ok: false, why: "chưa có khoá AI" };
  const hintsSet = (await rest("settings?select=value&key=eq.SHOT_AI_HINTS"))[0]?.value;
  const hints = Array.isArray(hintsSet) && hintsSet.length ? hintsSet.map(String) : SHOT_HINTS_DEFAULT;
  const parts: any[] = [];
  for (const p of (photos || []).slice(0, 6)) {
    const id = p.id || (String(p.url || "").match(/[-\w]{25,}/) || [])[0];
    if (!id) continue;
    const r = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`, { redirect: "follow" });
    if (!r.ok || !/^image\//.test(r.headers.get("content-type") || "")) continue;
    parts.push({ inline_data: { mime_type: r.headers.get("content-type")!.split(";")[0], data: toB64(await r.arrayBuffer()) } });
  }
  if (!parts.length) return { ok: false, why: "không tải được ảnh" };
  const prompt = `Bạn kiểm tra ảnh báo cáo của nhân viên siêu thị. Việc này CHỈ nhận ẢNH CHỤP MÀN HÌNH (screenshot) điện thoại / máy tính, ví dụ màn hình LINE đã báo cáo.
Với TỪNG ảnh (${parts.length} ảnh), xác định có phải ảnh chụp màn hình thật (screenshot) không.
Hiểu biết của quản lý:\n- ${hints.join("\n- ")}
Trả JSON: {"all_screenshot": true/false, "items": [{"screenshot": true/false, "why": "lý do ngắn"}]}. Không chắc chắn → screenshot = false.`;
  const out = await gemini(key, { contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
    generationConfig: { temperature: 0, maxOutputTokens: 800, responseMimeType: "application/json" } });
  try {
    const j = JSON.parse(out);
    const items = Array.isArray(j.items) ? j.items : [];
    const ok = j.all_screenshot === true && items.length >= parts.length && items.every((x: any) => x.screenshot === true);
    return { ok, why: items.map((x: any, i: number) => `ảnh ${i + 1}: ${x.screenshot ? "✓" : "✗"} ${String(x.why || "").slice(0, 80)}`).join(" · ") };
  } catch { return { ok: false, why: "AI trả lời không đọc được" }; }
}
