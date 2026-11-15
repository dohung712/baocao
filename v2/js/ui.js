// Tiện ích giao diện dùng chung
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n, d = 0) => (Number(n) || 0).toLocaleString("vi-VN", { maximumFractionDigits: d });
export const sign = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
export const starHtml = (n) => `<span class="${n > 0 ? "pos" : n < 0 ? "neg" : "muted"}">${sign(n)}⭐</span>`;
export const initials = (name) => String(name || "?").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();
export const shortName = (name) => String(name || "").trim().split(/\s+/).slice(-2).join(" ");

// Ngày giờ theo giờ Việt Nam
export function vnToday(offset = 0) {
  const d = new Date(Date.now() + offset * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
export function vnHM() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}
export const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
export const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
export function addDays(d, n) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export function weekStart(d) { const x = new Date(d + "T00:00:00Z"); const k = (x.getUTCDay() + 6) % 7; return addDays(d, -k); }
export const monthStart = (d) => d.slice(0, 8) + "01";
export const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const dow = (d) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];

let toastT;
export function toast(msg, ms = 2600) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), ms);
}

// Hộp thoại: trả về Promise với giá trị của nút được bấm
export function modal(html, { onOpen } = {}) {
  return new Promise((resolve) => {
    const m = $("#modal"), body = $("#modalBody");
    body.innerHTML = html; m.hidden = false;
    const close = (v) => { m.hidden = true; body.innerHTML = ""; m.onclick = null; document.removeEventListener("keydown", key); resolve(v); };
    const key = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", key);
    m.onclick = (e) => {
      if (e.target === m) return close(null);
      const b = e.target.closest("[data-v]"); if (!b) return;
      const v = b.dataset.v;
      if (v === "submit") { const f = body.querySelector("form"); if (f && !f.reportValidity()) return; close(f ? Object.fromEntries(new FormData(f)) : true); }
      else close(v === "cancel" ? null : v);
    };
    body.querySelector("form")?.addEventListener("submit", (e) => { e.preventDefault(); body.querySelector('[data-v="submit"]')?.click(); });
    onOpen?.(body);
    setTimeout(() => body.querySelector("input,textarea,select")?.focus(), 30);
  });
}
export const confirmBox = (title, text, okLabel = "Đồng ý", danger = false) =>
  modal(`<h3>${esc(title)}</h3><p class="muted">${text}</p><div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn ${danger ? "danger" : "primary"}" data-v="ok">${esc(okLabel)}</button></div>`).then((v) => v === "ok");

export function download(name, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export const csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* dùng cách cũ */ }
  const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; } ta.remove(); return ok;
}

// Sắp xếp bảng: trả về hàm sort theo khoá
export function sorter(state, key) {
  if (state.key === key) state.dir = -state.dir; else { state.key = key; state.dir = 1; }
}
export function applySort(list, state) {
  if (!state.key) return list;
  return [...list].sort((a, b) => {
    const x = a[state.key], y = b[state.key];
    if (typeof x === "number" || typeof y === "number") return ((Number(x) || 0) - (Number(y) || 0)) * state.dir;
    return String(x ?? "").localeCompare(String(y ?? ""), "vi") * state.dir;
  });
}
export const sortTh = (state, key, label, cls = "") => `<th class="sort ${cls}" data-sort="${key}">${label}${state.key === key ? (state.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Lịch tháng: renderCell(dateStr) trả về HTML bên trong ô
export function monthGrid(ym, renderCell, { today = vnToday(), cls = () => "" } = {}) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  let h = `<div class="cal"><div class="cal-h">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => `<b>${d}</b>`).join("")}</div><div class="cal-g">`;
  for (let i = 0; i < lead; i++) h += `<div class="cal-c empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${String(d).padStart(2, "0")}`, w = new Date(ds + "T00:00:00Z").getUTCDay();
    h += `<button type="button" class="cal-c ${ds === today ? "today" : ""} ${ds < today ? "past" : ""} ${w === 0 || w === 6 ? "wkend" : ""} ${cls(ds)}" data-day="${ds}"><i>${d}</i>${renderCell(ds)}</button>`;
  }
  return h + `</div></div>`;
}
export const ymOf = (d) => d.slice(0, 7);
export function shiftMonth(ym, n) { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
export const monthLabel = (ym) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
export const norm = (x) => String(x || "").replace(/Đ/g, "D").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().trim();

// ---------- Sắp xếp mọi bảng: bấm tiêu đề cột để xếp tăng/giảm, nhớ lựa chọn khi bảng vẽ lại ----------
// Bỏ qua: bảng có class "nosort", cột có class "nosort" hoặc data-sort (bảng tự xếp theo dữ liệu).
const sortMem = new Map();
const tableSig = (t) => location.hash.split("?")[0] + "|" + [...t.tHead.rows[0].cells].map((c) => c.textContent.replace(/[▲▼]/g, "").trim()).join("|");
function cellKey(td) {
  if (!td) return "";
  const cb = td.querySelector("input[type=checkbox]"); if (cb && !td.querySelector("input:not([type=checkbox]),select")) return cb.checked ? 1 : 0;
  const inp = td.querySelector("input:not([type=checkbox]),select");
  if (inp) { const v = inp.value.trim(), n = Number(v); return v !== "" && !Number.isNaN(n) ? n : v.toLowerCase(); }
  const t = (td.dataset.sortv ?? td.innerText).trim().replace(/−/g, "-");
  let m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\D|$)/); if (m) return Number(m[3] || 2000) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  m = t.match(/^(?:[A-Za-zÀ-ỹ]{1,3}\s)?(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  m = t.match(/^[+-]?\d[\d.]*(?:,\d+)?/); if (m) return Number(m[0].replace(/\./g, "").replace(",", "."));
  return t.toLowerCase();
}
function sortTable(table, col, dir) {
  const tb = table.tBodies[0]; if (!tb) return;
  const rows = [...tb.rows]; if (rows.length < 2 || rows.some((r) => r.cells.length === 1 && r.cells[0].colSpan > 1)) return;
  const keyed = rows.map((r, i) => ({ r, i, k: cellKey(r.cells[col]) }));
  keyed.sort((a, b) => {
    const x = a.k, y = b.k, nx = typeof x === "number", ny = typeof y === "number";
    if (x === "" && y !== "") return 1; if (y === "" && x !== "") return -1;
    const c = nx && ny ? x - y : nx ? -1 : ny ? 1 : String(x).localeCompare(String(y), "vi", { numeric: true });
    return c * dir || a.i - b.i;
  });
  keyed.forEach(({ r }) => tb.appendChild(r));
  [...table.tHead.rows[0].cells].forEach((c, i) => { c.classList.toggle("sorted-asc", i === col && dir > 0); c.classList.toggle("sorted-desc", i === col && dir < 0); });
}
export function enableAutoSort(root = document) {
  root.addEventListener("click", (e) => {
    const th = e.target.closest("thead th"); if (!th || th.dataset.sort !== undefined || th.classList.contains("nosort") || e.target.closest("input,select,button,a")) return;
    const table = th.closest("table"); if (!table || table.classList.contains("nosort") || !table.tHead || !table.tBodies[0]) return;
    const col = th.cellIndex, sig = tableSig(table), cur = sortMem.get(sig);
    const dir = cur && cur.col === col ? -cur.dir : (typeof cellKey(table.tBodies[0].rows[0]?.cells[col]) === "number" ? -1 : 1); // số: lớn → nhỏ trước
    sortMem.set(sig, { col, dir }); sortTable(table, col, dir);
  });
  let pending = false;
  new MutationObserver(() => {
    if (pending || !sortMem.size) return; pending = true;
    requestAnimationFrame(() => {
      pending = false;
      document.querySelectorAll("table:not(.nosort)").forEach((t) => {
        if (!t.tHead?.rows[0] || !t.tBodies[0]) return;
        const s = sortMem.get(tableSig(t)); if (!s) return;
        const th = t.tHead.rows[0].cells[s.col]; if (th && !th.classList.contains(s.dir > 0 ? "sorted-asc" : "sorted-desc")) sortTable(t, s.col, s.dir);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
}
