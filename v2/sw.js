// Service worker: chỉ nhận thông báo đẩy (việc mới, nhắc hạn, quá hạn) và mở tool khi bấm vào thông báo. Không lưu đệm trang.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Thi Đua 351", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Thi Đua 351", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "icons/icon-192.png", badge: "icons/badge-96.png",
    data: { url: d.url || "./#today" }, vibrate: [120, 60, 120],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#today", self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); try { await c.navigate(url); } catch { /* trang khác nguồn */ } return; }
    }
    await self.clients.openWindow(url);
  })());
});
