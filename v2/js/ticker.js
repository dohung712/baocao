// D23 📢 Chữ chạy: dải thông báo chạy ngang đầu mọi trang tới khi hết hạn (QL đăng ở Giao việc → 📢 Chữ chạy).
// NV chỉ thấy dòng dành cho mọi người hoặc bộ phận mình; Admin / QL thấy hết. Bấm dải → xem đủ nội dung + mở link.
import { sb, S, rpc, errMsg, staffById, isManager, depts, onChange } from "./store.js";
import { $, esc, toast, modal } from "./ui.js";

let list = [], timer = null, bound = false;
const nowIso = () => new Date().toISOString();
const vnLocal = (iso) => new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 16);   // ô datetime-local giờ VN
const fromLocal = (v) => new Date(v + ":00+07:00").toISOString();
const fmt = (iso) => { const d = vnLocal(iso); return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`; };
const mine = (t) => { if (isManager()) return true; const a = t.audience || ["*"], dept = staffById(S.me?.staff_id)?.dept || ""; return a.includes("*") || (dept && a.includes(dept)); };

async function load() {
  const now = nowIso();
  const { data } = await sb.from("tickers").select("*").lte("from_at", now).gt("to_at", now).order("from_at");
  list = (data || []).filter(mine);
  paint();
}
function paint() {
  let bar = document.getElementById("tickerBar");
  const live = list.filter((t) => Date.parse(t.to_at) > Date.now() && Date.parse(t.from_at) <= Date.now());
  if (!live.length) { bar?.remove(); return; }
  const view = document.getElementById("view"); if (!view) return;
  if (!bar) { bar = document.createElement("button"); bar.type = "button"; bar.id = "tickerBar"; bar.className = "ticker"; bar.onclick = openAll; view.parentElement.insertBefore(bar, view); }
  const txt = live.map((t) => `📢 ${t.text}${t.link ? " 🔗" : ""}`).join("     •     ");
  const secs = Math.max(12, Math.round(txt.length / 7));
  bar.innerHTML = `<span class="ticker-track" style="animation-duration:${secs}s">${esc(txt)}</span>`;
  bar.title = "Bấm để xem đủ thông báo";
}
async function openAll() {
  await modal(`<h3>📢 Thông báo</h3>${list.map((t) => `<div class="tk-item"><div>${esc(t.text)}</div>
    <div class="tiny muted">đến ${fmt(t.to_at)}</div>${t.link ? `<a class="btn small primary" href="${esc(t.link)}" target="_blank" rel="noopener">🔗 Mở link</a>` : ""}</div>`).join("")}
    <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button></div>`);
}

export function initTicker() {
  load().catch(() => {});
  clearInterval(timer); timer = setInterval(() => { load().catch(() => {}); }, 120000);   // 2 phút / lần (tự tắt khi hết hạn)
  if (!bound) { bound = true; onChange((w) => { if (w === "ticker") load().catch(() => {}); }); setInterval(paint, 30000); }
}
export const reloadTicker = () => load().catch(() => {});

// Giao việc → 📢 Chữ chạy (QL)
export async function tickerTab(body) {
  const { data, error } = await sb.from("tickers").select("*").gt("to_at", new Date(Date.now() - 3 * 864e5).toISOString()).order("to_at", { ascending: false }).limit(50);
  if (error) throw error;
  const D = depts(), now = Date.now();
  const st = (t) => Date.parse(t.from_at) > now ? ["⏳ Chưa tới giờ", "info"] : Date.parse(t.to_at) <= now ? ["⌛ Đã hết hạn", "mute"] : ["▶️ Đang chạy", "ok"];
  const aud = (a) => (a || []).includes("*") ? "Mọi người" : (a || []).join(", ");
  body.innerHTML = `<div class="card"><div class="card-h"><h3>📢 Chữ chạy đầu trang</h3><button class="btn small primary" type="button" id="tkAdd">＋ Đăng chữ chạy</button></div>
    <p class="small muted">Dòng thông báo chạy ngang trên cùng mọi trang của người được chọn, tự tắt khi hết giờ. Có link thì NV bấm dải chữ để mở. Việc cần NV xác nhận đã đọc (họp, học…) dùng ➕ Giao việc → 📢 Thông báo.</p>
    ${(data || []).length ? (data || []).map((t) => { const [l, c] = st(t); return `<div class="tk-row"><div class="grow"><b>${esc(t.text)}</b>${t.link ? ` <a href="${esc(t.link)}" target="_blank" rel="noopener" class="small">🔗 link</a>` : ""}
      <div class="tiny muted">${fmt(t.from_at)} → ${fmt(t.to_at)} · ${esc(aud(t.audience))}</div></div><span class="pill ${c}">${l}</span>
      <button class="btn small" type="button" data-ed="${t.id}">Sửa</button><button class="btn small ghost danger" type="button" data-del="${t.id}">Gỡ</button></div>`; }).join("") : `<div class="empty">Chưa có chữ chạy nào.</div>`}</div>`;
  const edit = async (t) => {
    let out = null;
    const v = await modal(`<h3>📢 ${t ? "Sửa" : "Đăng"} chữ chạy</h3>
      <label>Nội dung<textarea id="tkText" rows="3" maxlength="500" placeholder="VD: 14h00 họp toàn siêu thị tại kho — đi đúng giờ">${esc(t?.text || "")}</textarea></label>
      <label>Link (tuỳ chọn)<input id="tkLink" placeholder="https://…" value="${esc(t?.link || "")}"></label>
      <div class="fields"><label>Hiện từ<input type="datetime-local" id="tkFrom" value="${vnLocal(t?.from_at || new Date().toISOString())}"></label>
        <label>Đến (tự tắt)<input type="datetime-local" id="tkTo" value="${vnLocal(t?.to_at || new Date(Date.now() + 8 * 3600e3).toISOString())}"></label></div>
      <div class="small"><b>Ai thấy</b></div>
      <div class="hm-who"><label class="hm-row"><input type="checkbox" id="tkAll" ${!t || (t.audience || []).includes("*") ? "checked" : ""}> 👥 Mọi người</label>
        ${D.map((d) => `<label class="hm-row sub"><input type="checkbox" class="tkD" value="${esc(d)}" ${t && (t.audience || []).includes(d) ? "checked" : ""}> NV bộ phận <b>${esc(d)}</b></label>`).join("")}</div>
      <p class="small" id="tkMsg"></p>
      <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" type="button" id="tkSave">💾 Lưu</button><button hidden data-v="ok" id="tkOk">ok</button></div>`, {
      onOpen(b) {
        $("#tkSave", b).onclick = async () => {
          const all = $("#tkAll", b).checked, ds = [...b.querySelectorAll(".tkD:checked")].map((x) => x.value);
          const p = { text: $("#tkText", b).value.trim(), link: $("#tkLink", b).value.trim(), from_at: fromLocal($("#tkFrom", b).value), to_at: fromLocal($("#tkTo", b).value), audience: all || !ds.length ? ["*"] : ds };
          try { out = await rpc("ticker_save", { p_id: t?.id || null, p }); $("#tkOk", b).click(); } catch (x) { $("#tkMsg", b).textContent = "⚠️ " + errMsg(x); }
        };
      },
    });
    if (v === "ok" && out) { toast(out.message); reloadTicker(); tickerTab(body); }
  };
  $("#tkAdd").onclick = () => edit(null);
  body.onclick = async (e) => {
    const ed = e.target.closest("[data-ed]"); if (ed) return edit((data || []).find((x) => String(x.id) === ed.dataset.ed));
    const del = e.target.closest("[data-del]");
    if (del) { try { const r = await rpc("ticker_delete", { p_id: Number(del.dataset.del) }); toast(r.message); reloadTicker(); tickerTab(body); } catch (x) { toast(errMsg(x), 4000); } }
  };
}
