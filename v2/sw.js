// Service worker: chỉ nhận thông báo đẩy (việc mới, nhắc hạn, quá hạn) và mở tool khi bấm vào thông báo. Không lưu đệm trang.
// D13b: báo lại cho tool máy đã nhận / NV bấm mở / NV gạt tắt (mã ack trong thông báo, không gửi thông tin cá nhân).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function ack(a, ev) {
  if (!a || !a.u || !a.t) return Promise.resolve();
  // text/plain: không cần hỏi trước CORS; lỗi mạng thì bỏ qua
  return fetch(a.u, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ mode: "ack", t: a.t, e: ev }), keepalive: true }).catch(() => {});
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Thi Đua 351", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "Thi Đua 351", {
      body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "icons/icon-192.png", badge: "icons/badge-96.png",
      data: { url: d.url || "./#today", ack: d.ack || null }, vibrate: [120, 60, 120],
    }),
    ack(d.ack, "deliver"),
  ]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#today", self.registration.scope).href;
  e.waitUntil(Promise.all([ack(e.notification.data?.ack, "click"), (async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); try { await c.navigate(url); } catch { /* trang khác nguồn */ } return; }
    }
    await self.clients.openWindow(url);
  })()]));
});

// NV vuốt bỏ thông báo không mở (Android / máy tính; iPhone không báo sự kiện này)
self.addEventListener("notificationclose", (e) => {
  e.waitUntil(ack(e.notification.data?.ack, "close"));
});
