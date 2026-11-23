// Edge Function "notify": gửi tóm tắt ngày / tuần qua Telegram.
//  - mode "tick": lịch pg_cron gọi 5 phút/lần (xác thực bằng x-cron-secret), tự gửi khi tới giờ
//  - mode "preview" | "send" | "test" | "detect": gọi từ giao diện (xác thực bằng phiên đăng nhập)
import { dailySummary, weeklySummary, splitMessage, type Ctx } from "./summary.ts";
import { revenueMsg, scoreMsg, tiktokMsg, cleanMsg, cleanRemindMsg, cumMsg, busyDeadlineMsg, flyerMsg, flyerNewMsg, busyMsg, rsMsg, serviceMsg, fundMsg } from "./summary2.ts";
import { jobDayMsg, jobWeekMsg, jobDueMsg, loadJobs, weekRange, jobMaintenance, shiftConflictMsg } from "./jobs.ts";

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

export const ITEMS: Record<string, { label: string; freq: string; time: string; dow?: number; on?: boolean }> = {
  daily: { label: "Thi đua ngày", freq: "daily", time: "22:35" },
  weekly: { label: "Tổng kết thi đua tuần", freq: "weekly", time: "22:45", dow: 0 },
  revenue: { label: "Doanh thu QĐ lũy kế", freq: "daily", time: "22:40" },
  score: { label: "Bảng điểm xếp hạng", freq: "weekly", time: "22:50", dow: 0 },
  tiktok: { label: "TikTok (ngày hạn T3, T6)", freq: "due", time: "20:00" },
  busydl: { label: "Nhắc hạn đăng ký bận/OFF tuần sau (T6)", freq: "weekly", time: "20:00", dow: 5, on: true },
  cum: { label: "Nhắc cập nhật lũy kế tuần (thứ 2)", freq: "weekly", time: "10:00", dow: 1, on: true },
  cleanam: { label: "Nhắc vệ sinh đầu ngày (người trực + khu vực)", freq: "daily", time: "08:30", on: true },
  clean: { label: "Vệ sinh (cuối ngày: ảnh, khu vực chưa xong)", freq: "daily", time: "21:00" },
  busy: { label: "Lịch bận / OFF ngày mai", freq: "daily", time: "21:30" },
  rs: { label: "Roadshow", freq: "daily", time: "21:30" },
  flyernew: { label: "Tờ rơi: báo đợt phát mới ngay khi QL tạo (lịch, tuyến, người)", freq: "daily", time: "00:00", on: true },
  flyerpre: { label: "Tờ rơi: nhắc người chưa nộp ảnh trước giờ hạn (số phút: FLYER_REMIND_BEFORE_MIN)", freq: "daily", time: "00:00", on: true },
  flyer: { label: "Tờ rơi: báo QL đúng giờ hạn từng tuyến (giờ ở đây chỉ dùng khi gửi thử)", freq: "daily", time: "20:00", on: true },
  service: { label: "Phục vụ & vi phạm", freq: "weekly", time: "09:00", dow: 1 },
  fund: { label: "Quỹ thu chi (chi tiết thu, chi, số dư)", freq: "weekly", time: "09:00", dow: 1, on: true },
  jobday: { label: "📋 Công việc trong ngày theo hạng mục (đã nộp, chưa nộp, số ảnh)", freq: "daily", time: "21:45", on: true },
  jobweek: { label: "📋 Tổng kết công việc tuần theo hạng mục (gửi CN: tuần này · ngày khác: tuần trước)", freq: "weekly", time: "09:05", dow: 1, on: true },
  shiftcheck: { label: "⚠️ Lịch ca trùng lịch bận / OFF (gửi ngay khi tool đọc file lịch ca mới)", freq: "daily", time: "00:00", on: true },
  jobdue: { label: "⏰ Nhắc công việc sắp tới hạn / quá hạn chưa nộp ảnh (gửi ngay lúc tới giờ; số phút trước hạn: JOB_REMIND_BEFORE_MIN)", freq: "daily", time: "00:00", on: true },
};
function items(cfg: Record<string, any>) {
  const saved: any[] = Array.isArray(cfg.NOTIFY_ITEMS) ? cfg.NOTIFY_ITEMS : [];
  return Object.entries(ITEMS).map(([id, d]) => {
    const x = saved.find((i) => i.id === id) || {};
    const legacy = id === "daily" ? { on: true, time: cfg.NOTIFY_DAILY_TIME } : id === "weekly" ? { on: true, time: cfg.NOTIFY_WEEKLY_TIME, dow: cfg.NOTIFY_WEEKLY_DOW } : {};
    // freq: daily (hằng ngày) · weekly (1 thứ/tuần, dow) · days (chọn nhiều thứ, dows) · due (TikTok: ngày hạn T3, T6). QL chỉnh qua save_notify_items.
    const freq = ["daily", "weekly", "days", "due"].includes(x.freq) ? x.freq : d.freq;
    const dows = (Array.isArray(x.dows) ? x.dows : []).map(Number).filter((n: number) => n >= 0 && n <= 6);
    return { id, ...d, defFreq: d.freq, freq, on: x.on ?? (legacy as any).on ?? d.on ?? false, time: x.time || (legacy as any).time || d.time, dow: Number(x.dow ?? (legacy as any).dow ?? d.dow ?? 0), dows };
  });
}

async function compose(kind: string, date: string, cfg: Record<string, any>, opt: { from?: string } = {}): Promise<{ text: string | null; period: string }> {
  const store = String(cfg.STORE_NAME || "");
  const monthStart = date.slice(0, 8) + "01";
  const wstart = addDays(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
  if (kind === "weekly") {
    const ctx = await buildCtx(wstart, date, cfg);
    return { text: weeklySummary(ctx, wstart, date, ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1), period: isoWeek(date) };
  }
  if (kind === "daily") { const ctx = await buildCtx(date, date, cfg); return { text: dailySummary(ctx, date), period: date }; }
  if (kind === "fund") {
    // Kỳ báo cáo: QL chọn "từ ngày", hoặc từ ngày sau lần gửi quỹ gần nhất (tự động / gửi tay), lần đầu: 7 ngày gần nhất.
    // Khoản ngày cũ nhưng mới nhập sau lần gửi trước → kèm vào, đánh dấu "ghi bổ sung".
    let from = /^\d{4}-\d{2}-\d{2}$/.test(String(opt.from || "")) ? String(opt.from) : "", lastAt: string | null = null;
    if (!from) {
      const last: any[] = await rest("notify_log?select=sent_at&ok=eq.true&or=" + encodeURIComponent("(kind.eq.fund,and(kind.eq.manual,period.like.fund*))") + "&order=sent_at.desc&limit=1");
      lastAt = last[0]?.sent_at ?? null;
      from = lastAt ? addDays(vnParts(new Date(lastAt)).date, 1) : addDays(date, -6);
    }
    if (from > date) from = date;
    if (from < addDays(date, -92)) from = addDays(date, -92);
    const sel = "id,kind,title,amount,tx_date,category,person,note";
    const [inRange, late, sum] = await Promise.all([
      rest(`fund_tx?select=${sel}&tx_date=gte.${from}&tx_date=lte.${date}&order=tx_date,id&limit=3000`),
      lastAt ? rest(`fund_tx?select=${sel}&tx_date=lt.${from}&created_at=gt.${encodeURIComponent(lastAt)}&order=tx_date,id&limit=500`) : Promise.resolve([]),
      rpc("fund_summary", { p_from: from, p_to: date }),
    ]);
    const days = Math.round((Date.parse(date) - Date.parse(from)) / 864e5) + 1;
    if (!inRange.length && !late.length && days < 7) return { text: null, period: `${from}..${date}` };   // gửi dày (hằng ngày) mà không có khoản nào → bỏ qua
    return { text: fundMsg(store, from, date, [...late, ...inRange], new Set(late.map((t: any) => t.id)), sum, APP_URL), period: `${from}..${date}` };
  }
  const staff: any[] = await rest("staff?select=id,name&hidden=eq.false&order=sort,id");
  const names = new Map(staff.map((x) => [x.id, x.name]));
  if (kind === "jobday") { const j = await loadJobs(date, date); return { text: jobDayMsg(store, date, j.jobs, j.types, names), period: date }; }
  if (kind === "shiftcheck") {   // gửi thử: đối chiếu lịch ca đang có 14 ngày tới với lịch bận
    const list = await rpc("_shift_conflicts", { p_from: date, p_to: addDays(date, 13) });
    return { text: shiftConflictMsg(store, "lịch ca hiện có (14 ngày tới)", Array.isArray(list) ? list : [], Array.isArray(cfg.SHIFT_SLOTS) ? cfg.SHIFT_SLOTS.map(String) : []) || `✅ Lịch ca 14 ngày tới không trùng lịch bận / OFF · ${store}`, period: date };
  }
  if (kind === "jobdue") {   // gửi thử: việc chưa nộp sắp tới hạn + đã quá hạn trong ngày (không đánh dấu đã nhắc)
    const before = Math.max(5, Number(cfg.JOB_REMIND_BEFORE_MIN ?? 60) || 60), nowIso = new Date().toISOString();
    const list: any[] = await rest(`jobs?select=id,staff_id,title,due_at&status=eq.todo&due_at=gte.${encodeURIComponent(date + "T00:00:00+07:00")}&due_at=lte.${encodeURIComponent(new Date(Date.now() + before * 60000).toISOString())}&order=due_at&limit=200`);
    const allNames = new Map(((await rest("staff?select=id,name")) as any[]).map((x) => [x.id, x.name]));
    return { text: jobDueMsg(store, list.filter((j) => j.due_at > nowIso), list.filter((j) => j.due_at <= nowIso), allNames, before), period: date };
  }
  if (kind === "jobweek") { const w = weekRange(date), j = await loadJobs(w.from, w.to); return { text: jobWeekMsg(store, w.from, w.to, j.jobs, j.types, names), period: isoWeek(date) }; }
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
  if (kind === "busydl") {
    const mon = addDays(date, 8 - (new Date(date + "T00:00:00Z").getUTCDay() || 7));
    const rows = await rest(`busy?select=busy_date,staff_id,type&busy_date=gte.${mon}&busy_date=lte.${addDays(mon, 6)}`);
    return { text: busyDeadlineMsg(store, date, mon, String(cfg.BUSY_DEADLINE_HM || "22:00"), rows, names), period: date };
  }
  if (kind === "cum") {
    const asof = addDays(date, -1), month = asof.slice(0, 8) + "01";
    const need = new Set((await rest(`monthly_targets?select=staff_id&month=eq.${month}`)).map((t: any) => t.staff_id));
    const since = new Date(date + "T00:00:00+07:00").toISOString();
    const done = new Set((await rest(`score_log?select=staff_id&kind=eq.cumulative&at=gte.${encodeURIComponent(since)}`)).map((l: any) => l.staff_id));
    return { text: cumMsg(store, date, asof, staff.filter((x) => need.has(x.id)), done), period: date };
  }
  if (kind === "clean" || kind === "cleanam") {
    const zones = await rest("clean_zones?select=id,dept,name,staff_text,staff_ids&kind=eq.zone&order=dept,sort");
    const done = new Set<number>((await rest(`clean_zone_checks?select=zone_id&d=eq.${date}`)).map((c: any) => c.zone_id));
    const rows = await rest(`cleaning?select=clean_date,staff_id,photos&clean_date=gte.${addDays(date, -7)}&clean_date=lte.${addDays(date, 1)}`);
    return { text: kind === "clean" ? cleanMsg(store, date, rows, names, zones, done) : cleanRemindMsg(store, date, rows, names, zones, done), period: date };
  }
  if (kind === "flyer") return { text: await flyerText(date, store, null), period: date };
  if (kind === "flyerpre") return { text: await flyerText(date, store, null, undefined, Number(cfg.FLYER_REMIND_BEFORE_MIN ?? 120) || 120), period: date };
  if (kind === "flyernew") return { text: await flyerNewText(store, false), period: date };
  if (kind === "busy") return { text: busyMsg(store, date, await rest(`busy?select=busy_date,staff_id,type,shifts&busy_date=eq.${addDays(date, 1)}`), names), period: date };
  if (kind === "rs") return { text: rsMsg(store, date, vnParts().hm, await rest(`roadshow?select=rs_date,rs_time,staff_id,photos,km,minutes&rs_date=gte.${addDays(date, -7)}&rs_date=lte.${addDays(date, 1)}`), names), period: date };
  if (kind === "service") {
    const to = addDays(wstart, -1), from = addDays(wstart, -7);
    const [board, viol] = await Promise.all([rpc("score_board", { p_from: from, p_to: to, p_full: true }), rest(`violations?select=staff_id,v_date,type,note,points&v_date=gte.${from}&v_date=lte.${to}&order=v_date`)]);
    return { text: serviceMsg(store, from, to, board, viol, names), period: isoWeek(date) };
  }
  throw new Error("Đầu mục không hợp lệ.");
}

// Tờ rơi: lấy tuyến tới hạn (hm), tới giờ nhắc trước hạn (pre phút), hoặc mọi tuyến của ngày khi gửi thử; soạn tin
const hmAdd = (hm: string, min: number) => { const [h, m] = hm.split(":").map(Number); const t = Math.max(0, h * 60 + m + min); return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
async function flyerText(date: string, store: string, hm: string | null, out?: { ids: number[] }, pre = 0) {
  const sel = "flyer_tasks?select=id,campaign_id,route_name,qty,due_date,due_hm";
  const q = hm && !pre ? `${sel}&notified_at=is.null&due_date=gte.${addDays(date, -3)}&order=due_date,due_hm,id`
    : hm && pre ? `${sel}&reminded_at=is.null&notified_at=is.null&due_date=eq.${date}&order=due_hm,id`
    : `${sel}&due_date=eq.${date}&order=due_hm,id`;
  let tasks: any[] = await rest(q);
  if (hm && !pre) tasks = tasks.filter((t) => t.due_date < date || (t.due_date === date && t.due_hm <= hm));
  if (hm && pre) tasks = tasks.filter((t) => hmAdd(t.due_hm, -pre) <= hm && hm < t.due_hm);
  if (!tasks.length) return null;
  if (out) out.ids = tasks.map((t) => t.id);
  const ids = tasks.map((t) => t.id).join(","), cids = [...new Set(tasks.map((t) => t.campaign_id))].join(",");
  const [assigns, camps, staff] = await Promise.all([
    rest(`flyer_assign?select=task_id,staff_id,qty,done_at&task_id=in.(${ids})`),
    rest(`flyer_campaigns?select=id,name&id=in.(${cids})`),
    rest("staff?select=id,name"),
  ]);
  return flyerMsg(store, date, tasks, assigns, new Map(staff.map((x: any) => [x.id, x.name])), new Map(camps.map((c: any) => [c.id, c.name])), APP_URL, pre);
}
// Đợt mới: auto = đợt chưa báo (announced_at trống); gửi thử = đợt tạo gần nhất
async function flyerNewText(store: string, auto: boolean, out?: { ids: number[] }) {
  const camps: any[] = await rest(`flyer_campaigns?select=id,name,total_qty,deadline_hm,start_date,end_date${auto ? "&announced_at=is.null" : ""}&order=id.desc&limit=${auto ? 5 : 1}`);
  if (!camps.length) return null;
  if (out) out.ids = camps.map((c) => c.id);
  const staff: any[] = await rest("staff?select=id,name"), names = new Map(staff.map((x: any) => [x.id, x.name]));
  const parts: string[] = [];
  for (const c of camps.reverse()) {
    const tasks: any[] = await rest(`flyer_tasks?select=id,route_name,map_url,qty,due_date,due_hm&campaign_id=eq.${c.id}&order=due_date,id`);
    const assigns: any[] = tasks.length ? await rest(`flyer_assign?select=task_id,staff_id,qty&task_id=in.(${tasks.map((t) => t.id).join(",")})`) : [];
    const m = flyerNewMsg(store, c, tasks, assigns, names, APP_URL); if (m) parts.push(m);
  }
  return parts.join("\n\n") || null;
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
  // Bảng việc (D12): bỏ lỡ + trừ sao, thông báo đẩy, đọc lịch ca từ Drive — chạy cả khi tắt Telegram
  const jobs = await jobMaintenance(cfg).catch((e) => ({ error: String((e as Error).message) }));
  if (cfg.NOTIFY_ENABLED !== true) return { skipped: "off", jobs };
  const now = vnParts(); const done: string[] = [];
  // D12d: file lịch ca mới xếp trùng lịch bận / OFF → báo nhóm ngay (mỗi file 1 lần)
  const sh = (jobs as any).shift;
  if (sh?.list?.length && items(cfg).find((i) => i.id === "shiftcheck")?.on) {
    try {
      const text = shiftConflictMsg(String(cfg.STORE_NAME || ""), sh.file, sh.list, Array.isArray(cfg.SHIFT_SLOTS) ? cfg.SHIFT_SLOTS.map(String) : []);
      if (text) { await sendAll(text, cfg); await log("shiftcheck", now.date + " " + now.hm, true, `auto ${sh.list.length}`); done.push("shiftcheck"); }
    } catch (e) { await log("shiftcheck-error", now.date + " " + now.hm, false, String((e as Error).message)); }
  }
  // Nhắc công việc tới hạn / quá hạn qua Telegram (cùng lúc với thông báo đẩy, mỗi việc 1 lần)
  const due = (jobs as any).due;
  if (due && (due.soon.length || due.over.length) && items(cfg).find((i) => i.id === "jobdue")?.on) {
    try {
      const staff: any[] = await rest("staff?select=id,name");
      const text = jobDueMsg(String(cfg.STORE_NAME || ""), due.soon, due.over, new Map(staff.map((x) => [x.id, x.name])), due.before);
      if (text) { await sendAll(text, cfg); await log("jobdue", now.date + " " + now.hm, true, `auto ${due.soon.length}+${due.over.length}`); done.push("jobdue"); }
    } catch (e) { await log("jobdue-error", now.date + " " + now.hm, false, String((e as Error).message)); }
  }
  for (const it of items(cfg)) {
    if (it.id === "jobdue" || it.id === "shiftcheck") continue;   // gửi ở trên theo sự kiện
    if (it.id === "flyer" || it.id === "flyerpre" || it.id === "flyernew") {
      // không theo giờ cố định: đợt mới → gửi ngay; trước hạn X phút → nhắc; tới giờ hạn → báo; mỗi tuyến / đợt 1 lần
      if (!it.on) continue;
      try {
        const out = { ids: [] as number[] }, store = String(cfg.STORE_NAME || "");
        const pre = Number(cfg.FLYER_REMIND_BEFORE_MIN ?? 120) || 120;
        const text = it.id === "flyernew" ? await flyerNewText(store, true, out) : await flyerText(now.date, store, now.hm, out, it.id === "flyerpre" ? pre : 0);
        if (out.ids.length) {
          if (text) await sendAll(text, cfg);
          const table = it.id === "flyernew" ? "flyer_campaigns" : "flyer_tasks", col = { flyer: "notified_at", flyerpre: "reminded_at", flyernew: "announced_at" }[it.id]!;
          await rest(`${table}?id=in.(${out.ids.join(",")})`, { method: "PATCH", body: JSON.stringify({ [col]: new Date().toISOString() }) });
          await log(it.id, now.date + " " + now.hm, true, "auto " + out.ids.length);
          done.push(it.id);
        }
      } catch (e) { await log(it.id + "-error", now.date + " " + now.hm, false, String((e as Error).message)); }
      continue;
    }
    if (!it.on || now.hm < it.time) continue;
    if (it.freq === "weekly" && now.dow !== it.dow) continue;
    if (it.freq === "due" && ![2, 5].includes(now.dow)) continue;
    if (it.freq === "days" && !it.dows.includes(now.dow)) continue;
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
  return { done, jobs };
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
    const opt = { from: String(body.from || "") };   // Quỹ: QL chọn "từ ngày" (bỏ trống = từ lần gửi trước)
    if (mode === "preview") { const m = await compose(kind, date, cfg, opt); return json({ status: "success", ...m, text: m.text || "(Không có nội dung cần gửi cho đầu mục này hôm nay)" }); }
    if (mode === "send") {
      const msg = await compose(kind, date, cfg, opt); if (!msg.text) throw new Error("Đầu mục này hôm nay không có nội dung để gửi."); const n = await sendAll(msg.text, cfg);
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
