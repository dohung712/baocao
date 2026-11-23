// 🏅 Xếp hạng (gộp 23/11/2026): 1 trang, 3 tab — Điểm (C10) · Sao (B8, BXH sao) · Của tôi (C11).
// Địa chỉ cũ #score / #ranking / #me vẫn mở được, vào đúng tab. Tab nào bị ẩn (Cài đặt → Ẩn trang) thì không hiện.
import { $, esc } from "../ui.js";
import { isHidden } from "../store.js";
import * as score from "./score.js";
import * as ranking from "./ranking.js";
import * as mePage from "./me.js";

const TABS = [["score", "🏅 Điểm", score], ["ranking", "⭐ Sao", ranking], ["me", "👤 Của tôi", mePage]];
export const anyOpen = () => TABS.some(([id]) => !isHidden(id));
let sub = null;

export function make(defTab) {
  return async function render(view, params = {}, ctx = {}) {
    const tabs = TABS.filter(([id]) => !isHidden(id));
    let tab = params.tab || defTab;
    if (!tabs.some(([id]) => id === tab)) tab = tabs[0]?.[0];
    view.innerHTML = `<div class="subtabs hub-tabs" id="hubTabs">${tabs.map(([id, l]) => `<button type="button" data-hub="${id}" class="${id === tab ? "on" : ""}">${esc(l)}</button>`).join("")}</div><div id="hubBody" class="hub-body"></div>`;
    const open = async (id) => {
      if (sub) { try { sub(); } catch { /* bỏ qua */ } sub = null; }
      tab = id;
      view.querySelectorAll("[data-hub]").forEach((b) => b.classList.toggle("on", b.dataset.hub === id));
      try { history.replaceState(null, "", "#" + id); } catch { /* bỏ qua */ }
      const mod = TABS.find(([x]) => x === id)?.[2];
      sub = mod ? (await mod.render($("#hubBody"), {}, ctx)) || null : null;
    };
    $("#hubTabs").onclick = (e) => { const b = e.target.closest("[data-hub]"); if (b && b.dataset.hub !== tab) open(b.dataset.hub); };
    if (tab) await open(tab); else $("#hubBody").innerHTML = `<div class="empty">Không có bảng xếp hạng nào đang mở.</div>`;
    return () => { if (sub) { try { sub(); } catch { /* bỏ qua */ } sub = null; } };
  };
}
