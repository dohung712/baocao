// Edge Function "notify": gửi tóm tắt ngày / tuần qua Telegram.
//  - mode "tick": lịch pg_cron gọi 5 phút/lần (xác thực bằng x-cron-secret), tự gửi khi tới giờ
//  - mode "preview" | "send" | "test" | "detect": gọi từ giao diện (xác thực bằng phiên đăng nhập)
import { dailySummary, weeklySummary, splitMessage, type Ctx } from "./summary.ts";

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

async function compose(kind: string, date: string, cfg: Record<string, any>) {
  if (kind === "weekly") {
    const dow = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7; // 0 = Thứ 2
    const from = addDays(date, -dow);
    const ctx = await buildCtx(from, date, cfg);
    return { text: weeklySummary(ctx, from, date, dow + 1), period: isoWeek(date) };
  }
  const ctx = await buildCtx(date, date, cfg);
  return { text: dailySummary(ctx, date), period: date };
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
  const daily = String(cfg.NOTIFY_DAILY_TIME || "22:35");
  if (now.hm >= daily) {
    const sent = await rest(`notify_log?select=id&kind=eq.daily&ok=eq.true&period=eq.${now.date}`);
    if (!sent.length) {
      try { const m = await compose("daily", now.date, cfg); await sendAll(m.text, cfg); await log("daily", m.period, true, "auto"); done.push("daily"); }
      catch (e) { await log("daily-error", now.date + " " + now.hm, false, String((e as Error).message)); }
    }
  }
  const wdow = Number(cfg.NOTIFY_WEEKLY_DOW ?? 0), wtime = String(cfg.NOTIFY_WEEKLY_TIME || "22:45");
  if (now.dow === wdow && now.hm >= wtime) {
    const period = isoWeek(now.date);
    const sent = await rest(`notify_log?select=id&kind=eq.weekly&ok=eq.true&period=eq.${period}`);
    if (!sent.length) {
      try { const m = await compose("weekly", now.date, cfg); await sendAll(m.text, cfg); await log("weekly", m.period, true, "auto"); done.push("weekly"); }
      catch (e) { await log("weekly-error", period + " " + now.hm, false, String((e as Error).message)); }
    }
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
    const kind = body.kind === "weekly" ? "weekly" : "daily";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : vnParts().date;
    if (mode === "preview") return json({ status: "success", ...(await compose(kind, date, cfg)) });
    if (mode === "send") {
      const msg = await compose(kind, date, cfg); const n = await sendAll(msg.text, cfg);
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
