// Edge Function "bi" (B16 Số liệu BI) — chỉ quản lý:
//  • sync:   đọc các ảnh mới / đã sửa trong thư mục Drive "00 - Nhập doanh thu và thi đua" (mỗi lần ≤ 4 ảnh; còn thì trình duyệt gọi tiếp)
//  • upload: chọn ảnh từ máy → lưu vào thư mục đó trên Drive → AI đọc luôn
//  • apply:  dựng lại bảng thi đua siêu thị từ ảnh "BC Thi đua" mới nhất + tạo đề xuất số NV còn thiếu (chờ QL duyệt)
import { json, CORS, member } from "../_shared/common.ts";
import { biSync, biUpload, applyContest, proposeFromCards } from "../_shared/bi.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const m = await member(req);
    if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý dùng được.");
    const body = await req.json().catch(() => ({}));
    const actor = m.email;
    if (body.mode === "sync") {
      const r = await biSync(actor, Math.min(4, Math.max(1, Number(body.limit) || 4)));
      return json({ status: "success", ...r });
    }
    if (body.mode === "upload") {
      const items = (Array.isArray(body.files) ? body.files : []).map((f: any) => ({ name: String(f.name || ""), mime: String(f.mime || ""), data: String(f.data || "") }));
      if (!items.length) throw new Error("Chưa chọn ảnh.");
      return json({ status: "success", ...(await biUpload(actor, items)) });
    }
    if (body.mode === "apply") {
      const n = await applyContest(actor), p = await proposeFromCards(actor);
      return json({ status: "success", contestRows: n, proposals: p, message: `${n ? `Đã cập nhật ${n} dòng thi đua` : "Chưa có ảnh BC Thi đua nào đọc được"}${p ? ` · ${p} đề xuất số NV chờ duyệt` : ""}` });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
