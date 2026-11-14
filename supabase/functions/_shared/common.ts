// Dùng chung cho các Edge Function của Thi đua v2
export const URL_BASE = Deno.env.get("SUPABASE_URL")!;
export const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

export async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(URL_BASE + "/rest/v1/" + path, { ...init, headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let out: any; try { out = JSON.parse(t); } catch { out = t; }
  if (!r.ok) throw new Error(typeof out === "object" ? (out.message || JSON.stringify(out)) : String(out));
  return out;
}
export const rpc = (fn: string, args: Record<string, unknown> = {}) => rest("rpc/" + fn, { method: "POST", body: JSON.stringify(args) });

export async function authAdmin(path: string, init: RequestInit = {}) {
  const r = await fetch(URL_BASE + "/auth/v1/admin/" + path, { ...init, headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let out: any; try { out = JSON.parse(t); } catch { out = t; }
  if (!r.ok) throw new Error(typeof out === "object" ? (out.msg || out.message || out.error_description || JSON.stringify(out)) : String(out));
  return out;
}

export type Member = { email: string; role: string; staff_id: string | null; stores: string[] };
export async function member(req: Request): Promise<Member> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Chưa đăng nhập.");
  const u = await fetch(URL_BASE + "/auth/v1/user", { headers: { apikey: KEY, Authorization: auth } });
  if (!u.ok) throw new Error("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.");
  const user = await u.json();
  const rows = await rest("memberships?select=email,role,staff_id,stores&active=eq.true&email=eq." + encodeURIComponent(String(user.email || "").toLowerCase()));
  if (!rows[0]) throw new Error("Tài khoản chưa được cấp quyền.");
  return rows[0];
}
export function vnParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
export const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
