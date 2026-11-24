// D18 Chuyển giao diện điện thoại ↔ laptop
//  • Điện thoại: "💻" → hiện bố cục laptop (khung rộng 1280, kéo / phóng to để xem) · "📱" → về bố cục điện thoại. Nhớ trên máy.
//  • Máy tính: "📱" → mở cửa sổ hẹp đúng bố cục điện thoại (để xem NV thấy gì / chụp màn hình dạng điện thoại).
const KEY = "thidua-v2-layout";
const phone = () => Math.min(screen.width, screen.height) < 820;
const get = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };

export function applyLayout() {
  const vp = document.querySelector('meta[name="viewport"]'); if (!vp) return;
  vp.setAttribute("content", phone() && get() === "desktop" ? "width=1280, initial-scale=0.3, viewport-fit=cover" : "width=device-width, initial-scale=1, viewport-fit=cover");
}

export function initLayoutBtn() {
  if (document.getElementById("btnLayout")) return;
  const me = document.getElementById("btnMe"); if (!me) return;
  const b = document.createElement("button");
  b.id = "btnLayout"; b.type = "button"; b.className = "btn ghost small";
  const label = () => { const desk = phone() && get() === "desktop"; b.textContent = phone() ? (desk ? "📱" : "💻") : "📱"; b.title = phone() ? (desk ? "Về giao diện điện thoại" : "Xem giao diện laptop") : "Xem dạng điện thoại (cửa sổ hẹp)"; };
  b.onclick = () => {
    if (phone()) {
      try { localStorage.setItem(KEY, get() === "desktop" ? "mobile" : "desktop"); } catch { /* bỏ qua */ }
      applyLayout(); label(); window.scrollTo(0, 0);
    } else {
      window.open(location.href, "thidua-mobile", "width=420,height=880,menubar=no,toolbar=no");
    }
  };
  label();
  me.parentElement.insertBefore(b, me);
}
