// Edge Function "imgproxy" (D19): lấy ảnh thu nhỏ Google Drive (ảnh báo cáo) cho nút 📸 chụp trang — Drive không cho trang khác chép ảnh,
// nên ảnh trong bản chụp bị trống. Chỉ thành viên đã đăng nhập; chỉ nhận mã file Drive (không lấy được địa chỉ khác).
import { CORS, member } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    await member(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || ""), sz = Math.min(1600, Math.max(100, Number(body.sz) || 800));
    if (!/^[\w-]{10,100}$/.test(id)) return new Response("bad id", { status: 400, headers: CORS });
    const r = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${sz}`, { redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) { await r.body?.cancel(); return new Response("not image", { status: 404, headers: CORS }); }
    return new Response(r.body, { headers: { ...CORS, "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return new Response(String((e as Error).message || "error"), { status: 401, headers: CORS });
  }
});
