// Edge Function "push": thông báo đẩy lên điện thoại NV
//  • key:  trả khoá công khai VAPID để trình duyệt đăng ký (mọi thành viên)
//  • test: gửi thử tới các máy của chính mình
//  • send: QL nhắc NV (ids, tiêu đề, nội dung) — QL bộ phận chỉ gửi được cho NV bộ phận mình
import { json, CORS, rest, member } from "../_shared/common.ts";
import { vapidKeys, sendToSubs, pushMany, ackVerify } from "../_shared/webpush.ts";

const APP_URL = "https://dohung712.github.io/baocao/v2/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    // D13b: máy NV báo lại (service worker, không đăng nhập) — chỉ nhận mã ký đúng; ghi lần đầu
    if (body.mode === "ack") {
      const col = ({ deliver: "delivered_at", click: "clicked_at", close: "closed_at" } as Record<string, string>)[String(body.e)];
      const id = col ? await ackVerify(String(body.t || "")) : 0;
      if (!id) return json({ status: "error", message: "mã không hợp lệ" });
      await rest(`push_log?id=eq.${id}&${col}=is.null`, { method: "PATCH", body: JSON.stringify({ [col]: new Date().toISOString() }) });
      return json({ status: "success" });
    }
    const m = await member(req);
    if (body.mode === "key") return json({ status: "success", key: (await vapidKeys()).publicKey });
    if (body.mode === "test") {
      const subs = await rest(`push_subs?select=endpoint,p256dh,auth,staff_id&email=eq.${encodeURIComponent(m.email)}`);
      if (!subs.length) throw new Error("Máy này chưa bật thông báo.");
      const r = await sendToSubs(subs, { title: "✅ Đã bật thông báo", body: "Việc mới, nhắc hạn và việc quá hạn sẽ hiện ở đây.", url: APP_URL + "#today", tag: "test" });
      if (!r.sent) throw new Error("Không gửi được thông báo thử. Tắt rồi bật lại thông báo trên máy này.");
      return json({ status: "success", message: `Đã gửi thử tới ${r.sent} máy` });
    }
    if (body.mode === "send") {
      if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý được gửi nhắc.");
      const title = String(body.title || "").slice(0, 80), text = String(body.body || "").slice(0, 300);
      if (!title) throw new Error("Thiếu tiêu đề.");
      let ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x: string) => /^[\w.-]{1,40}$/.test(x)).slice(0, 100);
      if (m.role === "manager") {
        const staff: { id: string; dept: string }[] = ids.length ? await rest(`staff?select=id,dept&id=in.(${ids.map((x: string) => encodeURIComponent(x)).join(",")})`) : [];
        ids = staff.filter((s) => (m.stores || []).includes(s.dept)).map((s) => s.id);
      }
      const jobs = (Array.isArray(body.jobs) ? body.jobs : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 50);
      const r = await pushMany(ids.map((id: string) => ({ staff_id: id, data: { title, body: text, url: APP_URL + "#today", tag: String(body.tag || "nhac").slice(0, 40), kind: "manual", ...(jobs.length ? { jobs } : {}) } })));
      return json({ status: "success", ...r, message: r.staff ? `Đã gửi thông báo tới ${r.staff} NV (${r.sent} máy)` : "NV này chưa bật thông báo trên điện thoại." });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
