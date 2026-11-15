// Edge Function "notify": gửi tóm tắt ngày / tuần qua Telegram.
//  - mode "tick": lịch pg_cron gọi 5 phút/lần (xác thực bằng x-cron-secret), tự gửi khi tới giờ
//  - mode "preview" | "send" | "test" | "detect": gọi từ giao diện (xác thực bằng phiên đăng nhập)
import { dailySummary, weeklySummary, splitMessage, type Ctx } from "./summary.ts";
import { revenueMsg, scoreMsg, tiktokMsg, cleanMsg, busyMsg, rsMsg, serviceMsg } from "./summary2.ts";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://dohung712.github.io/baocao/v2/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(URL_BASE + "/rest/v1/" + path, { ...init, headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let out: any; try { out = JSON.parse(t); } catch { out = t; }
  if (!r.ok) throw new Error(typeof out === "object" ? (out.message || JSON.stringify(out)) : String(out));
  return out;
}
const rpc = (fn: string, args: Record<string, unknown> = {}) => rest("rpc/" + fn, { method: "POST", body: JSON.stringify(args) });

function vnParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow };
}
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function isoWeek(d: string) {
  const x = new Date(d + "T00:00:00Z"); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3);
  const y = x.getUTCFullYear(); const first = new Date(Date.UTC(y, 0, 4));
  return `${y}-W${String(1 + Math.round(((+x - +first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`;
}

async function settings() {
  const rows: { key: string; value: unknown }[] = await rest("settings?select=key,value");
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, any>;
}
async function privateSetting(key: string): Promise<string | null> {
  const r = await rest("private_settings?select=value&key=eq." + encodeURIComponent(key));
  return r[0]?.value ?? null;
}

async function buildCtx(from: string, to: string, cfg: Record<string, any>): Promise<Ctx> {
  const [staff, rows, streaks, contest, props, changes] = await Promise.all([
    rest("staff_stars?select=id,name,dept,total_star&hidden=eq.false&order=sort,id"),
    rest(`daily_results?select=report_date,staff_id,item_name,status,compensation,star_change,rate_pct&report_date=gte.${from}&report_date=lte.${to}&limit=50000`),
    rpc("current_streaks", { p_as_of: addDays(to, 1) }),
    rest("store_contest?select=name,type,rate_month,forecast,branch,rank&order=sort"),
    rest("extra_proposals?select=id&status=eq." + encodeURIComponent("Chờ duyệt")),
    rest("change_requests?select=id&status=eq.pending"),
  ]);
  return {
    storeName: String(cfg.STORE_NAME || ""), appUrl: APP_URL, penaltyStreak: Number(cfg.STREAK_PENALTY_STAR ?? 5),
    staff, rows, streaks, contest, pendingProposals: props.length, pendingChanges: changes.length,
  };
}

export const ITEMS: Record<string, { label: string; freq: string; time: string; dow?: number }> = {
  daily: { label: "Thi đua ngày", freq: "daily", time: "22:35" },
  weekly: { label: "Tổng kết thi đua tuần", freq: "weekly", time: "22:45", dow: 0 },
  revenue: { label: "Doanh thu QĐ lũy kế", freq: "daily", time: "22:40" },
  score: { label: "Bảng điểm xếp hạng", freq: "weekly", time: "22:50", dow: 0 },
  tiktok: { label: "TikTok (ngày hạn T3, T6)", freq: "due", time: "20:00" },
  clean: { label: "Vệ sinh", freq: "daily", time: "21:00" },
  busy: { label: "Lịch bận / OFF ngày mai", freq: "daily", time: "21:30" },
  rs: { label: "Roadshow", freq: "daily", time: "21:30" },
  service: { label: "Phục vụ & vi phạm", freq: "weekly", time: "09:00", dow: 1 },
};
function items(cfg: Record<string, any>) {
  const saved: any[] = Array.isArray(cfg.NOTIFY_ITEMS) ? cfg.NOTIFY_ITEMS : [];
  return Object.entries(ITEMS).map(([id, d]) => {
    const x = saved.find((i) => i.id === id) || {};
    const legacy = id === "daily" ? { on: true, time: cfg.NOTIFY_DAILY_TIME } : id === "weekly" ? { on: true, time: cfg.NOTIFY_WEEKLY_TIME, dow: cfg.NOTIFY_WEEKLY_DOW } : {};
    return { id, ...d, on: x.on ?? (legacy as any).on ?? false, time: x.time || (legacy as any).time || d.time, dow: Number(x.dow ?? (legacy as any).dow ?? d.dow ?? 0) };
  });
}

async function compose(kind: string, date: string, cfg: Record<string, any>): Promise<{ text: string | null; period: string }> {
  const store = String(cfg.STORE_NAME || "");
  const monthStart = date.slice(0, 8) + "01";
  const wstart = addDays(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
  if (kind === "weekly") {
    const ctx = await buildCtx(wstart, date, cfg);
    return { text: weeklySummary(ctx, wstart, date, ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1), period: isoWeek(date) };
  }
  if (kind === "daily") { const ctx = await buildCtx(date, date, cfg); return { text: dailySummary(ctx, date), period: date }; }
  const staff: any[] = await rest("staff?select=id,name&hidden=eq.false&order=sort,id");
  const names = new Map(staff.map((x) => [x.id, x.name]));
  if (kind === "revenue") {
    const [board, today] = await Promise.all([rpc("score_board", { p_from: monthStart, p_to: date, p_full: true }), rest(`revenue_entries?select=staff_id,amount&kind=eq.daily&entry_date=eq.${date}`)]);
    return { text: revenueMsg(store, date, String(cfg.REVENUE_UNIT || ""), board, new Map(today.map((r: any) => [r.staff_id, Number(r.amount)]))), period: date };
  }
  if (kind === "score") {
    const board = await rpc("score_board", { p_from: monthStart, p_to: date, p_full: false });
    return { text: scoreMsg(store, monthStart, date, board, { r: Number(cfg.W_REVENUE ?? 40), c: Number(cfg.W_CONTEST ?? 40), s: Number(cfg.W_SERVICE ?? 20) }), period: isoWeek(date) };
  }
  if (kind === "tiktok") {
    const start = String(cfg.TIKTOK_START_DATE || "").slice(0, 10);
    if (!start) return { text: null, period: date };
    const subs: any[] = await rest(`tiktok_submissions?select=staff_id,due,status&due=gte.${start}`);
    const w = new Date(date + "T00:00:00Z").getUTCDay(), due = (w === 2 || w === 5) && date >= start ? date : null;
    const overdue = new Map<string, string[]>();
    for (const x of staff) {
      const mine = new Set(subs.filter((t) => t.staff_id === x.id).map((t) => t.due)), list: string[] = [];
      for (let d = start; d < date; d = addDays(d, 1)) { const k = new Date(d + "T00:00:00Z").getUTCDay(); if ((k === 2 || k === 5) && !mine.has(d)) list.push(d); }
      overdue.set(x.name, list);
    }
    return { text: tiktokMsg(store, date, staff, subs, due, overdue), period: date };
  }
  if (kind === "clean") return { text: cleanMsg(store, date, await rest(`cleaning?select=clean_date,staff_id,photos&clean_date=gte.${addDays(date, -7)}&clean_date=lte.${addDays(date, 1)}`), names), period: date };
  if (kind === "busy") return { text: busyMsg(store, date, await rest(`busy?select=busy_date,staff_id,type,shifts&busy_date=eq.${addDays(date, 1)}`), names), period: date };
  if (kind === "rs") return { text: rsMsg(store, date, vnParts().hm, await rest(`roadshow?select=rs_date,rs_time,staff_id,photos,km,minutes&rs_date=gte.${addDays(date, -7)}&rs_date=lte.${addDays(date, 1)}`), names), period: date };
  if (kind === "service") {
    const to = addDays(wstart, -1), from = addDays(wstart, -7);
    const [board, viol] = await Promise.all([rpc("score_board", { p_from: from, p_to: to, p_full: true }), rest(`violations?select=staff_id,v_date,type,note,points&v_date=gte.${from}&v_date=lte.${to}&order=v_date`)]);
    return { text: serviceMsg(store, from, to, board, viol, names), period: isoWeek(date) };
  }
  throw new Error("Đầu mục không hợp lệ.");
}

async function telegram(token: string, method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
  return j.result;
}
async function sendAll(text: string, cfg: Record<string, any>) {
  const token = await privateSetting("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Chưa nhập token bot Telegram.");
  const chats: string[] = Array.isArray(cfg.NOTIFY_CHAT_IDS) ? cfg.NOTIFY_CHAT_IDS.map(String).filter(Boolean) : [];
  if (!chats.length) throw new Error("Chưa chọn nhóm / người nhận Telegram.");
  for (const chat of chats) for (const part of splitMessage(text)) {
    await telegram(token, "sendMessage", { chat_id: chat, text: part, parse_mode: "HTML", disable_web_page_preview: true });
  }
  return chats.length;
}
async function log(kind: string, period: string, ok: boolean, detail: string) {
  try { await rest("notify_log", { method: "POST", body: JSON.stringify({ kind, period, ok, detail: detail.slice(0, 500) }) }); } catch { /* đã gửi trong kỳ này */ }
}

async function member(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Chưa đăng nhập.");
  const u = await fetch(URL_BASE + "/auth/v1/user", { headers: { apikey: KEY, Authorization: auth } });
  if (!u.ok) throw new Error("Phiên đăng nhập hết hạn.");
  const user = await u.json();
  const rows = await rest("memberships?select=email,role&active=eq.true&email=eq." + encodeURIComponent(String(user.email || "").toLowerCase()));
  if (!rows[0]) throw new Error("Tài khoản chưa được cấp quyền.");
  return rows[0] as { email: string; role: string };
}

async function tick() {
  const cfg = await settings();
  if (cfg.NOTIFY_ENABLED !== true) return { skipped: "off" };
  const now = vnParts(); const done: string[] = [];
  for (const it of items(cfg)) {
    if (!it.on || now.hm < it.time) continue;
    if (it.freq === "weekly" && now.dow !== it.dow) continue;
    if (it.freq === "due" && ![2, 5].includes(now.dow)) continue;
    const period = it.freq === "weekly" ? isoWeek(now.date) : now.date;
    const sent = await rest(`notify_log?select=id&kind=eq.${it.id}&ok=eq.true&period=eq.${period}`);
    if (sent.length) continue;
    try {
      const m = await compose(it.id, now.date, cfg);
      if (m.text) await sendAll(m.text, cfg);
      await log(it.id, period, true, m.text ? "auto" : "không có nội dung");
      done.push(it.id);
    } catch (e) { await log(it.id + "-error", period + " " + now.hm, false, String((e as Error).message)); }
  }
  return { done };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "error", message: "Phương thức không hợp lệ" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "");
    if (mode === "tick") {
      const secret = await privateSetting("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ status: "error", message: "forbidden" }, 403);
      return json({ status: "success", ...(await tick()) });
    }
    const m = await member(req);
    if (!["owner", "manager"].includes(m.role)) throw new Error("Chỉ quản lý được dùng chức năng này.");
    const cfg = await settings();
    const kind = ITEMS[String(body.kind)] ? String(body.kind) : "daily";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : vnParts().date;
    if (mode === "items") return json({ status: "success", items: items(cfg) });
    if (mode === "preview") { const m = await compose(kind, date, cfg); return json({ status: "success", ...m, text: m.text || "(Không có nội dung cần gửi cho đầu mục này hôm nay)" }); }
    if (mode === "send") {
      const msg = await compose(kind, date, cfg); if (!msg.text) throw new Error("Đầu mục này hôm nay không có nội dung để gửi."); const n = await sendAll(msg.text, cfg);
      await log("manual", kind + " " + msg.period, true, m.email);
      return json({ status: "success", message: `Đã gửi tới ${n} nơi nhận.` });
    }
    if (m.role !== "owner") throw new Error("Chỉ chủ quản được dùng chức năng này.");
    if (mode === "test") {
      const n = await sendAll("✅ Kết nối Telegram thành công.\nBot sẽ gửi tóm tắt thi đua theo lịch đã cài.", cfg);
      return json({ status: "success", message: `Đã gửi tin thử tới ${n} nơi nhận.` });
    }
    if (mode === "detect") {
      const token = await privateSetting("TELEGRAM_BOT_TOKEN");
      if (!token) throw new Error("Chưa nhập token bot Telegram.");
      const me = await telegram(token, "getMe", {});
      const updates = await telegram(token, "getUpdates", { limit: 100, allowed_updates: ["message", "my_chat_member", "channel_post"] });
      const chats = new Map<string, { id: string; title: string; type: string }>();
      for (const u of updates) {
        const c = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
        if (c) chats.set(String(c.id), { id: String(c.id), title: c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || String(c.id), type: c.type });
      }
      return json({ status: "success", bot: me.username, chats: [...chats.values()] });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" }, 200);
  }
});
