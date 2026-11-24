// D18 📸 Chụp ảnh trang cho Admin / Quản lý: nút nổi trên mọi tab (xếp hạng, ảnh báo cáo, ca làm việc…).
// Đang mở hộp chi tiết → chụp hộp đó; không thì chụp cả trang đang xem (kể cả phần phải cuộn). Điện thoại: mở bảng chia sẻ (Zalo…); máy tính: tải ảnh PNG.
import { S, isManager } from "./store.js";
import { toast } from "./ui.js";

const LIB = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
let libP = null;
const loadLib = () => (libP ||= new Promise((res, rej) => {
  if (window.htmlToImage) return res(window.htmlToImage);
  const s = document.createElement("script"); s.src = LIB; s.async = true;
  s.onload = () => (window.htmlToImage ? res(window.htmlToImage) : rej(new Error("Không tải được công cụ chụp")));
  s.onerror = () => { libP = null; rej(new Error("Không tải được công cụ chụp (kiểm tra mạng)")); };
  document.head.appendChild(s);
}));
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function snap(btn) {
  const modalOpen = !document.getElementById("modal")?.hidden;
  const target = modalOpen ? document.getElementById("modalBody") : document.getElementById("view");
  if (!target) return;
  btn.disabled = true; const old = btn.textContent; btn.textContent = "⏳";
  const restore = [];
  try {
    const h2i = await loadLib();
    if (modalOpen) {   // hộp chi tiết có thanh cuộn → mở hết chiều cao khi chụp
      for (const el of [target, target.parentElement]) { if (!el) continue; restore.push([el, el.style.maxHeight, el.style.overflow, el.style.height]); el.style.maxHeight = "none"; el.style.overflow = "visible"; el.style.height = "auto"; }
    }
    const bg = getComputedStyle(document.body).backgroundColor || "#fff";
    const blob = await h2i.toBlob(target, { pixelRatio: Math.min(2, window.devicePixelRatio || 1.5), backgroundColor: bg, cacheBust: true, imagePlaceholder: PLACEHOLDER,
      filter: (n) => !(n.classList && (n.classList.contains("snap-btn") || n.id === "wmark")) });
    if (!blob) throw new Error("Không chụp được");
    const page = (location.hash.slice(1).split("?")[0] || "trang"), d = new Date(Date.now() + 7 * 3600e3).toISOString();
    const file = new File([blob], `thidua-${page}-${d.slice(0, 10)}-${d.slice(11, 16).replace(":", "")}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Thi Đua & BXH" }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast("Đã lưu ảnh chụp trang", 2500);
  } catch (e) { toast("⚠️ " + (e?.message || "Không chụp được"), 4000); }
  finally {
    for (const [el, mh, ov, h] of restore) { el.style.maxHeight = mh; el.style.overflow = ov; el.style.height = h; }
    btn.disabled = false; btn.textContent = old;
  }
}

export function initSnap() {
  let b = document.getElementById("snapBtn");
  const ok = isManager() && !S.me?.viewAs;
  if (!ok) { b?.remove(); return; }
  if (b) return;
  b = document.createElement("button");
  b.id = "snapBtn"; b.type = "button"; b.className = "snap-btn"; b.title = "Chụp ảnh trang / hộp đang xem"; b.textContent = "📸";
  b.onclick = () => snap(b);
  document.body.appendChild(b);
}
