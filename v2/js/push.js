// Thông báo đẩy lên điện thoại (Web Push) + đăng ký service worker (sw.js) cho trang thêm ra màn hình chính
import { rpc, callFn } from "./store.js";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

let regP = null;
export function registerSW() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  regP ||= navigator.serviceWorker.register("sw.js").catch((e) => { console.warn("SW", e); return null; });
  return regP;
}
const b64ToU8 = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"), p = t.length % 4 ? "=".repeat(4 - (t.length % 4)) : ""; return Uint8Array.from(atob(t + p), (c) => c.charCodeAt(0)); };

async function currentSub() {
  const reg = await registerSW(); if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// Trạng thái hiển thị: unsupported | ios-install | denied | off | on
export async function pushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await currentSub().catch(() => null);
  if (!sub || Notification.permission !== "granted") return "off";
  const st = await rpc("push_status", { p_endpoint: sub.endpoint }).catch(() => null);
  if (st && !st.this) { await saveSub(sub).catch(() => {}); }   // máy đã đăng ký nhưng máy chủ chưa có (vd đổi tài khoản) → ghi lại
  return "on";
}
async function saveSub(sub) {
  const j = sub.toJSON();
  return rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() ? "Trên iPhone: bấm nút Chia sẻ → “Thêm vào MH chính”, mở tool từ biểu tượng mới rồi bật thông báo." : "Trình duyệt này không hỗ trợ thông báo đẩy. Dùng Chrome (Android) hoặc Safari (iPhone, đã thêm ra màn hình chính).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Bạn chưa cho phép thông báo. Vào cài đặt trình duyệt → Thông báo → cho phép trang này.");
  const reg = await registerSW(); if (!reg) throw new Error("Không khởi động được bộ nhận thông báo.");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await callFn("push", { mode: "key" });
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
  }
  await saveSub(sub);
  await callFn("push", { mode: "test" }).catch(() => {});
  return true;
}
export async function disablePush() {
  const sub = await currentSub();
  if (sub) { await rpc("push_unsubscribe", { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
}
