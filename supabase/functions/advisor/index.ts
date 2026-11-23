// Edge Function "advisor" (D15 🧠 Cố vấn AI cho Giám đốc)
//  • cron (pg_cron 10 phút, x-cron-secret): tới giờ ADV_BIZ_TIMES → 📊 báo cáo thi đua; ADV_PEOPLE_DOW + ADV_PEOPLE_TIME → 💚 sức khoẻ nhân sự
//    gửi thông báo đẩy cho Giám đốc / QL; Telegram: thi đua → AGENT_CHAT_IDS (trống = NOTIFY_CHAT_IDS); nhân sự → chỉ ADV_PRIVATE_CHAT_IDS (riêng tư)
//  • run  (QL): phân tích lại ngay (kind biz | people)
//  • ask  (QL): hỏi đáp bằng lời
import { json, CORS, rest, member, vnParts } from "../_shared/common.ts";
import { runReport, ask, tgPlain } from "../_shared/advisor.ts";
import { pushMany } from "../_shared/webpush.ts";

const APP = "https://dohung712.github.io/baocao/v2/";
const toMin = (hm: string) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
async function cfg() { const rows: any[] = await rest("settings?select=key,value"); return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, any>; }
async function once(d: string, kind: string) {
  const r: any[] = await rest("job_nudges?on_conflict=staff_id,d,kind&select=kind", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([{ staff_id: "_advisor", d, kind }]) });
  return r.length > 0;
}
async function leaders() {
  const mem: any[] = await rest("memberships?select=staff_id&active=eq.true&role=in.(owner,manager)&staff_id=not.is.null");
  return [...new Set(mem.map((m) => m.staff_id))];
}
const chats = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

async function deliver(kind: "biz" | "people", text: string, c: Record<string, any>) {
  const title = kind === "biz" ? "📊 Cố vấn thi đua" : "💚 Sức khoẻ nhân sự";
  const first = text.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3).join("\n");
  await pushMany((await leaders()).map((staff_id) => ({ staff_id, data: { title, body: first.slice(0, 220), url: APP + "#advisor", tag: "adv-" + kind, kind: "advisor" } }))).catch(() => {});
  const to = kind === "biz" ? (chats(c.AGENT_CHAT_IDS).length ? chats(c.AGENT_CHAT_IDS) : chats(c.NOTIFY_CHAT_IDS)) : chats(c.ADV_PRIVATE_CHAT_IDS);
  if (c.NOTIFY_ENABLED === true || kind === "people") await tgPlain(to, `${title.toUpperCase()} · ${String(c.STORE_NAME || "")}\n\n${text}\n\nChi tiết: ${APP}#advisor`).catch(() => {});
}

async function cron() {
  const c = await cfg();
  if (c.ADV_ON === false) return { skipped: "off" };
  const vn = vnParts(), n = toMin(vn.hm), done: string[] = [];
  const due = (t: string) => n >= toMin(t) && n < toMin(t) + 30;
  for (const t of (Array.isArray(c.ADV_BIZ_TIMES) ? c.ADV_BIZ_TIMES : ["10:00", "21:00"]).map(String)) {
    if (!due(t) || !(await once(vn.date, "biz-" + t))) continue;
    try { const r = await runReport("biz", "tu-dong"); await deliver("biz", r.text, c); done.push("biz " + t); } catch (e) { done.push("biz-error " + String((e as Error).message).slice(0, 120)); }
  }
  const pt = String(c.ADV_PEOPLE_TIME || "09:00"), pd = Number(c.ADV_PEOPLE_DOW ?? 1);
  if (vn.dow === pd && due(pt) && (await once(vn.date, "people"))) {
    try { const r = await runReport("people", "tu-dong"); await deliver("people", r.text, c); done.push("people"); } catch (e) { done.push("people-error " + String((e as Error).message).slice(0, 120)); }
  }
  return { done };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.mode === "cron") {
      const secret = (await rest("private_settings?select=value&key=eq.CRON_SECRET"))[0]?.value;
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ status: "error", message: "forbidden" }, 403);
      // AI viết báo cáo mất 10–60 giây: trả lời pg_cron ngay, phần việc chạy nền (tối đa 150 giây / lượt)
      const job = cron().catch((e) => ({ error: String((e as Error).message) }));
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) { rt.waitUntil(job); return json({ status: "success", queued: true }); }
      return json({ status: "success", ...(await job) });
    }
    const m = await member(req);
    if (!["owner", "manager"].includes(m.role)) throw new Error("Cố vấn AI chỉ dành cho quản lý.");
    if (body.mode === "run") {
      const kind = body.kind === "people" ? "people" : "biz";
      const r = await runReport(kind, m.email);
      return json({ status: "success", ...r });
    }
    if (body.mode === "ask") {
      const q = String(body.question || "").trim();
      if (!q) throw new Error("Chưa có câu hỏi.");
      return json({ status: "success", answer: await ask(q, Array.isArray(body.history) ? body.history : []) });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
