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

// Gọi Gemini (23/11/2026: gemini-2.5-flash bị Google ngừng → bỏ). Cách chạy:
//  1. Thử lần lượt GEMINI_MODELS; quá tải / hết hạn mức tạm (429, 500, 503) → chờ rồi thử lại 1 lần; model bị ngừng / không có → sang model khác
//  2. Hỏng hết → hỏi Google danh sách model đang dùng được (ListModels), chọn model "flash" mới nhất → Google đổi model thì tool tự theo
//  3. Báo lỗi ghi rõ từng model (không che nguyên nhân thật)
export const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const GEM = "https://generativelanguage.googleapis.com/v1beta/models";
let goodModel: string | null = null, discovered: string[] | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const verNum = (n: string) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
// Model "flash" đang dùng được, mới nhất trước (bỏ bản ảnh / giọng nói / live / embedding; bản lite xếp sau)
export async function geminiModels(key: string) {
  const r = await fetch(`${GEM}?pageSize=200`, { headers: { "x-goog-api-key": key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || String(r.status));
  return ((j.models || []) as any[])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter((n) => /flash/i.test(n) && !/image|tts|audio|live|embed|thinking|robotics|computer/i.test(n))
    .sort((a, b) => (/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0) || verNum(b) - verNum(a) || (/preview|exp/.test(a) ? 1 : 0) - (/preview|exp/.test(b) ? 1 : 0));
}
export const lastGoodModel = () => goodModel;
// Model chạy được gần nhất lưu ở cài đặt AI_MODEL_OK (tên model, không bí mật) → mọi Edge Function dùng ngay, khỏi dò lại
let savedLoaded = false;
async function loadSaved() {
  if (savedLoaded) return; savedLoaded = true;
  try { const v = (await rest("settings?select=value&key=eq.AI_MODEL_OK"))[0]?.value; if (typeof v === "string" && /^[\w.-]{3,60}$/.test(v)) goodModel ||= v; } catch { /* bỏ qua */ }
}
async function saveGood(m: string) {
  if (goodModel === m) return; goodModel = m;
  try { await rest("settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "AI_MODEL_OK", value: m, updated_by: "tu-dong" }) }); } catch { /* bỏ qua */ }
}
export async function gemini(key: string, payload: Record<string, unknown>) {
  const errs: string[] = [], tried = new Set<string>();
  const body = JSON.stringify(payload);   // ảnh base64 vài MB: đóng gói 1 lần (đóng gói lại mỗi lần thử làm hết CPU của Edge Function)
  await loadSaved();
  const call = async (m: string) => {
    tried.add(m);
    let b = body, plain = false, retried = false;   // plain: đã bỏ thinkingConfig (model không hỗ trợ) · retried: đã chờ thử lại vì quá tải
    for (let attempt = 0; attempt < 3; attempt++) {
      let r: Response;
      try { r = await fetch(`${GEM}/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: b, signal: AbortSignal.timeout(95000) }); }
      catch (e) {   // quá 95 giây: dừng gọn (Edge Function chỉ được chạy 150 giây / lần)
        if ((e as Error).name === "TimeoutError" || /abort|timeout/i.test(String(e))) { errs.push(`${m}: AI chậm quá 95 giây`); return { stop: true }; }
        errs.push(`${m}: ${String((e as Error).message).slice(0, 100)}`); return null;
      }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        await saveGood(m);
        const c = j.candidates?.[0], text = (c?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("").trim();
        if (c?.finishReason === "MAX_TOKENS") errs.push(`${m}: trả lời bị cắt (MAX_TOKENS)`);
        return { text };
      }
      const msg = String(j.error?.message || r.status).replace(/\s+/g, " ").slice(0, 140);
      // Model không nhận thinkingConfig → gọi lại không có nó
      if (r.status === 400 && !plain && /thinking/i.test(msg) && (payload as any).generationConfig?.thinkingConfig) {
        const p2: any = JSON.parse(b); delete p2.generationConfig.thinkingConfig; b = JSON.stringify(p2); plain = true; continue;
      }
      const daily = /per ?day|daily|PerDay/i.test(JSON.stringify(j.error || ""));   // hết hạn mức trong ngày: chờ cũng vô ích
      if ([429, 500, 503].includes(r.status) && !retried && !daily) { retried = true; await sleep(r.status === 429 ? 5000 : 3000); continue; }   // quá tải tạm: chờ rồi thử lại 1 lần
      errs.push(`${m}: ${r.status} ${msg}`);
      if (r.status === 401 || (r.status === 403 && /api key|permission|billing/i.test(msg))) return { stop: true };   // khoá AI sai / hết quyền: thử model khác vô ích
      return null;
    }
    return null;
  };
  for (const m of [...new Set([goodModel, ...GEMINI_MODELS].filter(Boolean) as string[])]) {
    const r = await call(m); if (r?.text !== undefined) return r.text; if (r?.stop) throw new Error("AI lỗi: " + errs.join(" | "));
  }
  try { discovered ||= await geminiModels(key); } catch (e) { errs.push("ListModels: " + String((e as Error).message).slice(0, 100)); discovered = []; }
  for (const m of discovered.filter((x) => !tried.has(x)).slice(0, 4)) {
    const r = await call(m); if (r?.text !== undefined) return r.text; if (r?.stop) break;
  }
  throw new Error(("AI lỗi: " + errs.join(" | ")).slice(0, 480));
}
