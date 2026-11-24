// Kết nối Supabase + bộ nhớ dữ liệu dùng chung + đồng bộ realtime
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.76.0/+esm";
import { applyMe, filterStaff } from "./viewas.js";

export const SUPABASE_URL = "https://iauxgnnybhzqeirnqaen.supabase.co";
export const SUPABASE_KEY = "sb_publishable_NRvEe2l11DFIHjQZzQinIQ_ASSaVsyX";
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "thidua-v2-auth" },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const S = {
  user: null, me: null,           // me = dòng memberships của người đang đăng nhập
  settings: {}, staff: [], items: [], locked: new Set(),
  pending: { proposals: 0, changes: 0 },
};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

export const isOwner = () => S.me?.role === "owner";
export const isManager = () => ["owner", "manager"].includes(S.me?.role);
export const roleLabel = (r) => ({ owner: "Quản lý", manager: "Quản lý", employee: "Nhân viên" }[r] || r);   // D18: Admin = owner + is_admin (js/roles.js)

export function errMsg(e) {
  const m = e?.message || e?.error_description || String(e || "Lỗi");
  if (/Failed to fetch|NetworkError/i.test(m)) return "Mất kết nối mạng, thử lại sau.";
  if (/JWT|token is expired/i.test(m)) return "Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.";
  return m.replace(/^.*?ERROR:\s*/, "");
}
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
export async function rpc(fn, args) { return q(sb.rpc(fn, args)); }

export async function loadMe() {
  const { data: { user } } = await sb.auth.getUser();
  S.user = user;
  if (!user) { S.me = null; return null; }
  const rows = await q(sb.from("memberships").select("*").eq("email", (user.email || "").toLowerCase()).eq("active", true));
  S.realMe = rows[0] || null;
  S.me = applyMe(S.realMe);   // chủ quản đang "👁️ Xem như" NV / QL → giao diện theo vai trò đó (viewas.js)
  return S.me;
}

export async function loadSettings() {
  const rows = await q(sb.from("settings").select("key,value"));
  S.settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  emit("settings");
}
export async function loadStaff() {
  S.allStaff = await q(sb.from("staff_stars").select("*").order("sort").order("name"));
  S.staff = filterStaff(S.allStaff, S.me);
  emit("staff");
}
export async function loadItems() {
  S.items = await q(sb.from("items").select("*").order("sort").order("id"));
  emit("items");
}
export async function loadLocked() {
  const rows = await q(sb.from("locked_dates").select("d").order("d", { ascending: false }));
  S.locked = new Set(rows.map((r) => r.d));
  emit("locked");
}
export async function loadPending() {
  if (!isManager()) return;
  const [p, c, h, a] = await Promise.all([
    sb.from("extra_proposals").select("id", { count: "exact", head: true }).eq("status", "Chờ duyệt"),
    sb.from("change_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("hot_bonuses").select("id", { count: "exact", head: true }).eq("status", "Chờ duyệt"),
    sb.from("agent_items").select("id", { count: "exact", head: true }).eq("status", "open").eq("needs_decision", true),
  ]);
  S.pending = { proposals: p.count || 0, changes: c.count || 0, hot: h.count || 0, agent: a.count || 0 };
  emit("pending");
}
export async function loadAll() {
  await Promise.all([loadSettings(), loadStaff(), loadItems(), loadLocked(), loadPending()]);
}

export const setting = (k, d) => (S.settings[k] === undefined || S.settings[k] === null ? d : S.settings[k]);
export const visibleStaff = () => S.staff.filter((s) => !s.hidden);
export const staffById = (id) => S.staff.find((s) => s.id === id) || S.allStaff?.find((s) => s.id === id);
export const staffEmail = (id) => `nv${String(id).trim().toLowerCase()}@thidua351.vn`;
// Ẩn trang / chức năng theo vai trò (chủ quản luôn thấy tất cả)
export function isHidden(id) {
  if (S.me?.role === "owner" || S.me?.role === "manager") return false;   // D18: Admin / Quản lý luôn thấy đủ chức năng
  const h = S.settings.HIDE || {}, list = S.me?.role === "manager" ? h.manager : h.employee;
  return Array.isArray(list) && list.includes(id);
}
export const hiddenPages = () => [];
export const depts = () => [...new Set(S.staff.map((s) => s.dept).filter(Boolean))].sort();

// ---------- Realtime ----------
let channel, liveCb = () => {};
export function onLive(fn) { liveCb = fn; }
export function startRealtime() {
  if (channel) sb.removeChannel(channel);
  const refresh = {
    staff: loadStaff, items: loadItems, settings: loadSettings, locked_dates: loadLocked,
    daily_results: () => { loadStaff(); emit("results"); },
    extra_proposals: () => { loadPending(); loadStaff(); emit("proposals"); },
    change_requests: () => { loadPending(); emit("changes"); },
    store_contest: () => emit("contest"), bi_files: () => emit("contest"), bi_proposals: () => { emit("contest"); emit("score"); },
    hot_bonuses: () => { loadPending(); emit("proposals"); },
    fund_tx: () => emit("cv"),
    tasks: () => emit("cv"), task_acks: () => emit("cv"),
    tiktok_submissions: () => { loadStaff(); emit("cv"); }, cleaning: () => emit("cv"), clean_zones: () => emit("cv"), clean_zone_checks: () => emit("cv"), busy: () => emit("cv"), roadshow: () => emit("cv"),
    staff_targets: () => emit("targets"),
    star_adjustments: () => { loadStaff(); emit("score"); }, revenue_entries: () => emit("score"), item_adjustments: () => emit("score"), media_reports: () => emit("score"), monthly_targets: () => emit("score"),
    ratings: () => emit("score"), violations: () => emit("score"),
    jobs: () => emit("jobs"), job_types: () => emit("jobs"), shifts: () => emit("jobs"),
    agent_items: () => { loadPending(); emit("agent"); },
  };
  const timers = {};
  channel = sb.channel("thidua-v2");
  for (const table of Object.keys(refresh)) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      clearTimeout(timers[table]); timers[table] = setTimeout(() => Promise.resolve().then(refresh[table]).catch(console.error), 400);
    });
  }
  channel.subscribe((status) => liveCb(status === "SUBSCRIBED"));
}
export function stopRealtime() { if (channel) sb.removeChannel(channel); channel = null; }

// ---------- Gọi Edge Function ----------
export const notify = (body) => callFn("notify", body);
export async function callFn(name, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (session?.access_token || "") },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ status: "error", message: "Máy chủ không phản hồi (" + r.status + ")" }));
  if (j.status !== "success") throw new Error(j.message || "Không thực hiện được.");
  return j;
}
