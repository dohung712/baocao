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
    // D22: vừa giao việc → báo ngay từng NV được giao (không chờ lượt 5 phút); đánh dấu pushed_at để lượt tự động không báo lại
    if (body.mode === "job_new") {
      if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý được giao việc.");
      const batch = String(body.batch || "");
      if (!/^[0-9a-f-]{36}$/i.test(batch)) throw new Error("Thiếu mã lần giao.");
      const jobs: any[] = await rest(`jobs?select=id,staff_id,title,due_at&batch=eq.${batch}&status=eq.todo&pushed_at=is.null&order=due_at&limit=1000`);
      if (!jobs.length) return json({ status: "success", staff: 0, sent: 0, message: "Không có việc mới cần báo." });
      const vnFmt = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600e3).toISOString(); return { hm: d.slice(11, 16), dm: `${d.slice(8, 10)}/${d.slice(5, 7)}`, day: d.slice(0, 10) }; };
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const when = (iso: string) => { const x = vnFmt(iso); return x.day === today ? `${x.hm} hôm nay` : `${x.hm} ${x.dm}`; };
      const by = new Map<string, any[]>(); for (const j of jobs) by.set(j.staff_id, [...(by.get(j.staff_id) || []), j]);
      const r = await pushMany([...by.entries()].map(([staff_id, l]) => {
        const titles = [...new Set(l.map((j) => j.title))];
        const data = titles.length === 1
          ? { title: "📌 Việc mới: " + titles[0], body: l.length === 1 ? `Hạn ${when(l[0].due_at)} · bấm để xem và sắp xếp thời gian làm` : `Lặp ${l.length} ngày · hạn đầu ${when(l[0].due_at)} · cuối ${vnFmt(l[l.length - 1].due_at).dm}` }
          : { title: `📌 Bạn có ${l.length} việc mới`, body: l.slice(0, 4).map((j) => `• ${j.title} (hạn ${when(j.due_at)})`).join("\n") };
        return { staff_id, data: { ...data, url: APP_URL + "#today", tag: "jobs-new-" + batch.slice(0, 8), kind: "new", jobs: l.map((j) => j.id) } };
      }));
      for (let i = 0; i < jobs.length; i += 150) await rest(`jobs?id=in.(${jobs.slice(i, i + 150).map((j) => j.id).join(",")})`, { method: "PATCH", body: JSON.stringify({ pushed_at: new Date().toISOString() }) });
      const off = [...by.keys()].length - r.staff;
      return json({ status: "success", ...r, message: `Đã báo ngay ${r.staff} NV${off > 0 ? ` · ${off} NV chưa bật thông báo (sẽ thấy khi mở tool)` : ""}` });
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
