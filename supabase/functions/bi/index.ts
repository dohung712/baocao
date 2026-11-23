// Edge Function "bi" (B16 Số liệu BI) — chỉ quản lý:
//  • sync:     đọc ảnh úp / sửa TRONG NGÀY trong thư mục Drive "00 - Nhập doanh thu và thi đua" (mỗi lần ≤ 4 ảnh trong ~55 giây; còn thì trình duyệt gọi tiếp)
//              force = [mã file] để đọc lại 1 ảnh cũ (nút "Đọc lại")
//  • upload:   chọn ảnh từ máy → lưu vào thư mục đó trên Drive → AI đọc luôn
//  • apply:    dựng lại bảng thi đua siêu thị từ ảnh "BC Thi đua" mới nhất + tạo / cập nhật số NV còn thiếu
//  • ai_check: kiểm tra AI — model nào đang dùng được (không in khoá)
import { json, CORS, member, rest, gemini, geminiModels, lastGoodModel, GEMINI_MODELS } from "../_shared/common.ts";
import { biSync, biUpload, applyContest, proposeFromCards } from "../_shared/bi.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const m = await member(req);
    if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý dùng được.");
    const body = await req.json().catch(() => ({}));
    const actor = m.email;
    if (body.mode === "sync") {
      const force = (Array.isArray(body.force) ? body.force : []).map(String).filter((x: string) => /^[\w-]{10,80}$/.test(x)).slice(0, 10);
      const r = await biSync(actor, Math.min(4, Math.max(1, Number(body.limit) || 4)), force, 55000);   // hết 55 giây thì không bắt đầu ảnh mới
      return json({ status: "success", ...r });
    }
    if (body.mode === "upload") {
      const items = (Array.isArray(body.files) ? body.files : []).map((f: any) => ({ name: String(f.name || ""), mime: String(f.mime || ""), data: String(f.data || "") }));
      if (!items.length) throw new Error("Chưa chọn ảnh.");
      return json({ status: "success", ...(await biUpload(actor, items)) });
    }
    if (body.mode === "apply") {
      const n = await applyContest(actor), p = await proposeFromCards(actor);
      return json({ status: "success", contestRows: n, proposals: p, message: `${n ? `Đã cập nhật ${n} dòng thi đua` : "Chưa có ảnh BC Thi đua nào đọc được"}${p ? ` · ${p} thẻ NV mới` : ""}` });
    }
    if (body.mode === "ai_check") {
      const key = (await rest("private_settings?select=value&key=eq.GEMINI_API_KEY"))[0]?.value as string | undefined;
      if (!key) throw new Error("Chưa có khoá AI (GEMINI_API_KEY).");
      let available: string[] = [], listErr = "";
      try { available = (await geminiModels(key)).slice(0, 12); } catch (e) { listErr = String((e as Error).message).slice(0, 200); }
      let ok = false, err = "";
      try { await gemini(key, { contents: [{ role: "user", parts: [{ text: "Trả lời đúng 1 chữ: OK" }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } }); ok = true; } catch (e) { err = String((e as Error).message); }
      return json({ status: "success", ok, model: lastGoodModel(), configured: GEMINI_MODELS, available, listErr, error: err });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
