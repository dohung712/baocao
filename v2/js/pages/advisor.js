// 🧠 Cố vấn (D15, quản lý): 3 Agent AI cho Giám đốc, dùng trên điện thoại
//  📊 Thi đua — báo cáo AI tự viết lúc ADV_BIZ_TIMES (mặc định 10:00 · 21:00): tổng quan, rủi ro, điểm sáng, NV, 3 việc làm ngay
//  💚 Nhân sự — sức khoẻ làm việc của từng NV (thứ 2 hằng tuần): phong độ tốt / cần quan tâm / rủi ro + gợi ý trao đổi 1-1
//  💬 Hỏi đáp — hỏi bằng lời, AI trả lời từ dữ liệu thật
import { $, esc, toast } from "../ui.js";
import { sb, callFn, errMsg, setting, isOwner, S, loadSettings } from "../store.js";

const TABS = [["biz", "📊 Thi đua"], ["people", "💚 Nhân sự"], ["ask", "💬 Hỏi đáp"]];
const SUGGEST = ["Hôm nay siêu thị cần đẩy gì nhất?", "Chương trình thi đua nào có nguy cơ trượt?", "Ai đang sa sút so với tháng trước?", "Tuần này ai trễ việc nhiều nhất?", "Nên khen ai tuần này?", "Ai đang làm quá tải?"];
let tab = "biz", chat = [];
const fmtVN = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
const at = (iso) => { const p = Object.fromEntries(fmtVN.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute} ${p.day}/${p.month}`; };

export async function render(view) {
  try { tab = localStorage.getItem("thidua-v2-adv") || tab; } catch { /* bỏ qua */ }
  view.innerHTML = `<div class="page-h"><div><h1>🧠 Cố vấn AI</h1><p>3 trợ lý AI cho Giám đốc: đọc số thi đua, theo dõi sức khoẻ làm việc của nhân viên, trả lời câu hỏi bằng lời. Số liệu tính từ dữ liệu thật, AI chỉ viết nhận định.</p></div></div>
    <div class="subtabs" id="avTabs"></div><div id="avBody"></div>`;
  $("#avTabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; try { localStorage.setItem("thidua-v2-adv", tab); } catch { /* bỏ qua */ } draw(); };
  await draw();
}

async function draw() {
  $("#avTabs").innerHTML = TABS.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("");
  const body = $("#avBody");
  if (tab === "ask") return askView(body);
  body.innerHTML = `<div class="empty">Đang tải…</div>`;
  const { data, error } = await sb.from("advisor_reports").select("*").eq("kind", tab).order("created_at", { ascending: false }).limit(10);
  if (error) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(error))}</div></div>`; return; }
  const [last, ...old] = data || [];
  const when = tab === "biz" ? `Tự viết lúc ${(setting("ADV_BIZ_TIMES", ["10:00", "21:00"]) || []).join(" · ")} hằng ngày`
    : `Tự viết ${["CN", "thứ 2", "thứ 3", "thứ 4", "thứ 5", "thứ 6", "thứ 7"][Number(setting("ADV_PEOPLE_DOW", 1))]} lúc ${setting("ADV_PEOPLE_TIME", "09:00")} hằng tuần`;
  body.innerHTML = `<div class="row" style="margin-bottom:8px"><span class="small muted grow">${esc(when)} · gửi thông báo cho Giám đốc / QL${tab === "biz" ? " + Telegram" : (setting("ADV_PRIVATE_CHAT_IDS", []) || []).length ? " + Telegram riêng" : ""}</span>
      <button class="btn small primary" type="button" id="avRun">🔄 Phân tích ngay</button></div>
    ${last ? `<div class="av-card"><div class="tiny muted">${esc(at(last.created_at))}${last.by && last.by !== "tu-dong" ? " · " + esc(last.by) : " · tự động"}</div><div class="av-text">${esc(last.text)}</div></div>`
      : `<div class="empty">Chưa có báo cáo. Bấm <b>🔄 Phân tích ngay</b> để AI viết bản đầu tiên (mất khoảng 10–40 giây).</div>`}
    ${old.length ? `<details style="margin-top:10px"><summary class="linkish small">🕒 Các bản trước (${old.length})</summary>${old.map((r) => `<div class="av-card old"><div class="tiny muted">${esc(at(r.created_at))}</div><div class="av-text">${esc(r.text)}</div></div>`).join("")}</details>` : ""}
    ${isOwner() ? cfgHtml() : ""}`;
  $("#avRun").onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "⏳ AI đang phân tích…";
    try { await callFn("advisor", { mode: "run", kind: tab }); toast("Đã có báo cáo mới"); draw(); }
    catch (x) { toast(errMsg(x), 6000); b.disabled = false; b.textContent = "🔄 Phân tích ngay"; }
  };
  $("#avSave")?.addEventListener("click", saveCfg);
}

function askView(body) {
  body.innerHTML = `<div class="av-chat" id="avChat">${chat.length ? "" : `<p class="small muted">Hỏi bất cứ điều gì về doanh thu, thi đua, nhân viên, việc hôm nay, hộp duyệt. Ví dụ:</p>`}</div>
    <div class="chips" id="avSug" style="margin:6px 0">${SUGGEST.map((s) => `<button type="button" class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <form id="avForm" class="av-form"><textarea id="avQ" rows="2" placeholder="Nhập câu hỏi…" maxlength="1500"></textarea><button class="btn primary" type="submit" id="avSend">Gửi</button></form>`;
  const box = $("#avChat");
  const paint = () => {
    box.innerHTML = (chat.length ? "" : `<p class="small muted">Hỏi bất cứ điều gì về doanh thu, thi đua, nhân viên, việc hôm nay, hộp duyệt. Ví dụ:</p>`)
      + chat.map((m) => `<div class="av-msg ${m.role}">${esc(m.text)}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  };
  paint();
  const send = async (q) => {
    q = String(q || "").trim(); if (!q) return;
    const hist = chat.slice(-6);
    chat.push({ role: "me", text: q }, { role: "ai", text: "⏳ Đang xem số liệu…", wait: true }); paint();
    $("#avSend").disabled = true;
    try { const r = await callFn("advisor", { mode: "ask", question: q, history: hist.map((m) => ({ role: m.role === "ai" ? "ai" : "user", text: m.text })) }); chat[chat.length - 1] = { role: "ai", text: r.answer }; }
    catch (x) { chat[chat.length - 1] = { role: "ai", text: "⚠️ " + errMsg(x) }; }
    $("#avSend") && ($("#avSend").disabled = false);
    if ($("#avChat")) paint();
  };
  $("#avSug").onclick = (e) => { const c = e.target.closest("[data-q]"); if (c) send(c.dataset.q); };
  $("#avForm").onsubmit = (e) => { e.preventDefault(); const q = $("#avQ").value; $("#avQ").value = ""; send(q); };
}

function cfgHtml() {
  return `<details class="ag-cfg" style="margin-top:14px"><summary class="linkish">⚙️ Cài đặt Cố vấn AI</summary>
    <div class="fields" style="margin-top:8px">
      <label>Bật Cố vấn tự động<select id="vOn"><option value="1" ${setting("ADV_ON", true) !== false ? "selected" : ""}>Bật</option><option value="0" ${setting("ADV_ON", true) === false ? "selected" : ""}>Tắt</option></select></label>
      <label>Giờ báo cáo thi đua<input id="vBiz" value="${esc((setting("ADV_BIZ_TIMES", ["10:00", "21:00"]) || []).join(", "))}"></label>
      <label>Ngày báo cáo nhân sự<select id="vDow">${["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"].map((d, i) => `<option value="${i}" ${Number(setting("ADV_PEOPLE_DOW", 1)) === i ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label>Giờ báo cáo nhân sự<input type="time" id="vPt" value="${esc(setting("ADV_PEOPLE_TIME", "09:00"))}"></label>
      <label>Telegram riêng cho báo cáo nhân sự (mã chat, cách nhau dấu phẩy; trống = không gửi Telegram)<input id="vChat" value="${esc((setting("ADV_PRIVATE_CHAT_IDS", []) || []).join(", "))}" placeholder="vd 123456789"></label>
    </div>
    <p class="tiny muted">Báo cáo nhân sự có nhận xét từng người nên mặc định chỉ gửi thông báo cho Giám đốc / QL, không gửi nhóm Telegram chung. Mã chat lấy ở Quản lý → Telegram → Dò nơi nhận.</p>
    <div class="row"><button class="btn small primary" type="button" id="avSave">💾 Lưu</button></div></details>`;
}
async function saveCfg() {
  const times = $("#vBiz").value.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)).sort();
  if (!times.length) return toast("Giờ dạng 10:00, 21:00");
  const rows = [["ADV_ON", $("#vOn").value === "1"], ["ADV_BIZ_TIMES", times], ["ADV_PEOPLE_DOW", Number($("#vDow").value)], ["ADV_PEOPLE_TIME", $("#vPt").value || "09:00"],
    ["ADV_PRIVATE_CHAT_IDS", $("#vChat").value.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^-?\d{3,20}$/.test(x))]];
  const { error } = await sb.from("settings").upsert(rows.map(([key, value]) => ({ key, value, updated_by: S.me.email, updated_at: new Date().toISOString() })));
  if (error) return toast(errMsg(error), 5000);
  await loadSettings(); toast("Đã lưu"); draw();
}
