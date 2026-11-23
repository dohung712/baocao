// Thông báo đẩy (Web Push) lên điện thoại / máy tính: mã hoá aes128gcm (RFC 8291) + VAPID (RFC 8292), chỉ dùng WebCrypto.
// Khoá VAPID tự tạo lần đầu, lưu ở private_settings (PUSH_VAPID_JWK); khoá công khai trả cho trình duyệt khi đăng ký.
import { rest } from "./common.ts";

const enc = new TextEncoder();
const APP_URL = "https://dohung712.github.io/baocao/v2/";
export const b64u = (b: ArrayBuffer | Uint8Array) => {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const ub64 = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/"), p = t.length % 4 ? "=".repeat(4 - (t.length % 4)) : "";
  return Uint8Array.from(atob(t + p), (c) => c.charCodeAt(0));
};
const concat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

export type Vapid = { jwk: JsonWebKey; publicKey: string };
let cached: Vapid | null = null;
export async function vapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  const read = async () => (await rest("private_settings?select=value&key=eq.PUSH_VAPID_JWK"))[0]?.value as string | undefined;
  let v = await read();
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const publicKey = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    // 2 lần gọi cùng lúc: bản ghi đầu tiên thắng, đọc lại để dùng chung một khoá
    await rest("private_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ key: "PUSH_VAPID_JWK", value: JSON.stringify({ jwk, publicKey }) }) });
    v = await read();
    if (!v) throw new Error("Không lưu được khoá thông báo.");
  }
  cached = JSON.parse(v) as Vapid;
  return cached;
}

async function vapidHeader(endpoint: string, keys: Vapid) {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })));
  const key = await crypto.subtle.importKey("jwk", { ...keys.jwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

async function encrypt(p256dh: string, auth: string, payload: Uint8Array) {
  const uaPub = ub64(p256dh), secret = ub64(auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(secret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const head = new Uint8Array(21 + asPub.length);
  head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length; head.set(asPub, 21);
  return concat(head, ct);
}

export type Sub = { endpoint: string; p256dh: string; auth: string; staff_id?: string | null };
// kind / jobs chỉ để ghi nhật ký push_log (không gửi xuống máy); ack = mã để máy báo lại đã nhận / bấm / gạt tắt
export type PushData = { title: string; body: string; url?: string; tag?: string; kind?: string; jobs?: number[]; ack?: { u: string; t: string } };

// D13b: mã báo lại = id dòng push_log + HMAC (khoá suy ra từ khoá riêng VAPID, không lộ ra ngoài)
const ackKey = async () => enc.encode("push-ack:" + String((await vapidKeys()).jwk.d || ""));
export async function ackSign(id: number) { return id + "." + b64u((await hmac(await ackKey(), enc.encode(String(id)))).slice(0, 16)); }
export async function ackVerify(tok: string) {
  const m = /^(\d{1,15})\.([\w-]{16,40})$/.exec(String(tok || ""));
  return m && (await ackSign(Number(m[1]))) === tok ? Number(m[1]) : 0;
}
const ACK_URL = (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/push";
const jobOfTag = (tag?: string) => { const m = /^job-(\d+)$/.exec(tag || ""); return m ? [Number(m[1])] : []; };

// Gửi 1 thông báo tới 1 máy. Trả về mã HTTP của dịch vụ đẩy (201 = đã nhận); 404/410 = máy đã huỷ đăng ký → xoá.
export async function sendOne(sub: Sub, data: PushData, keys: Vapid) {
  const { kind: _k, jobs: _j, ...wire } = data;
  const body = await encrypt(sub.p256dh, sub.auth, enc.encode(JSON.stringify({ ...wire, url: data.url || APP_URL })));
  const r = await fetch(sub.endpoint, {
    method: "POST", body,
    headers: { Authorization: await vapidHeader(sub.endpoint, keys), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" },
  });
  await r.body?.cancel();
  if (r.status === 404 || r.status === 410) await rest("push_subs?endpoint=eq." + encodeURIComponent(sub.endpoint), { method: "DELETE" }).catch(() => {});
  return r.status;
}

export async function sendToSubs(subs: Sub[], data: PushData) {
  if (!subs.length) return { sent: 0, failed: 0 };
  const keys = await vapidKeys();
  let sent = 0, failed = 0;
  for (const s of subs) {
    try { const st = await sendOne(s, data, keys); if (st >= 200 && st < 300) sent++; else failed++; } catch { failed++; }
  }
  return { sent, failed };
}

// Gửi theo NV: mỗi phần tử {staff_id, data}; mọi máy NV đó đã bật thông báo đều nhận.
// D13b: mỗi phần tử ghi 1 dòng push_log (NV chưa bật thông báo: devices = 0) để QL biết đã gửi / máy nhận / bấm / gạt tắt.
export async function pushMany(list: { staff_id: string; data: PushData }[]) {
  list = list.filter((x) => x.staff_id);
  const ids = [...new Set(list.map((x) => x.staff_id))];
  if (!ids.length) return { sent: 0, failed: 0, staff: 0 };
  const subs: Sub[] = await rest(`push_subs?select=endpoint,p256dh,auth,staff_id&staff_id=in.(${ids.map((x) => encodeURIComponent('"' + String(x).replace(/"/g, "") + '"')).join(",")})`);
  const mine = (id: string) => subs.filter((x) => x.staff_id === id);
  let logs: { id: number }[] = [];
  try {
    logs = await rest("push_log?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(list.map((it) => ({
      staff_id: it.staff_id, kind: String(it.data.kind || "other").slice(0, 20), title: String(it.data.title || "").slice(0, 200),
      job_ids: (it.data.jobs?.length ? it.data.jobs : jobOfTag(it.data.tag)).filter((n) => Number.isFinite(n)).slice(0, 100), devices: mine(it.staff_id).length,
    }))) });
  } catch { logs = []; }   // nhật ký lỗi không chặn thông báo
  if (!subs.length) return { sent: 0, failed: 0, staff: 0 };
  const keys = await vapidKeys();
  let sent = 0, failed = 0;
  const reached = new Set<string>();
  for (const [i, it] of list.entries()) {
    const my = mine(it.staff_id); if (!my.length) continue;
    const logId = logs[i]?.id, data = logId && ACK_URL.startsWith("http") ? { ...it.data, ack: { u: ACK_URL, t: await ackSign(logId) } } : it.data;
    let ok = 0, bad = 0;
    for (const s of my) {
      try { const st = await sendOne(s, data, keys); if (st >= 200 && st < 300) { ok++; reached.add(it.staff_id); } else bad++; } catch { bad++; }
    }
    sent += ok; failed += bad;
    if (logId) await rest(`push_log?id=eq.${logId}`, { method: "PATCH", body: JSON.stringify({ sent: ok, failed: bad }) }).catch(() => {});
  }
  return { sent, failed, staff: reached.size };
}
