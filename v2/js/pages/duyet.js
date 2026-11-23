// 📥 Duyệt (D14 Trợ lý vận hành, quản lý) — NƠI DUY NHẤT cần xem để quyết:
//  • Trợ lý gom: việc trễ (cho nộp bù / ghi trễ), NV xin dời hạn / xin miễn, cảnh báo hệ thống, phân tích tuần
//  • Các mục chờ duyệt cũ của trang Quản lý: 🔥 thưởng nóng, 🎁 thưởng bán thêm, ✏️ sửa báo cáo sau giờ chốt (D14b)
//  • Tình trạng chạy tự động (system_health): lượt gần nhất, lỗi đang có
import { $, esc, toast, modal, shortName } from "../ui.js";
import { sb, S, rpc, callFn, onChange, setting, errMsg, staffById, loadSettings, isOwner, loadPending, loadStaff } from "../store.js";

const LABEL = {
  late: ["⏰", "Việc trễ chưa nộp", "Cho nộp bù (Trợ lý tạo việc mới, việc cũ vẫn ghi trễ) hoặc chỉ ghi trễ"],
  req_delay: ["🙋", "NV xin dời hạn", ""], req_excuse: ["🙋", "NV xin miễn việc", ""],
  no_shift: ["🗓️", "Lịch ca", ""], rt: ["📄", "Trang tính việc lặp lại", ""], bi: ["📊", "Ảnh BI", ""], bi_stuck: ["📊", "Số BI kẹt", ""],
  no_push: ["🔕", "Chưa bật thông báo", ""], guide: ["📖", "Hướng dẫn & nhập môn", ""], shift_conflict: ["⚠️", "Lịch ca trùng lịch bận", ""], sys: ["🛠️", "Lỗi chạy tự động", ""], weekly: ["📈", "Phân tích tuần", ""],
};
const LINK = { guide: ["guide", "👥 Mở Theo dõi"], no_shift: ["jobs", "🗓️ Mở Lịch ca"], shift_conflict: ["jobs", "🗓️ Mở Lịch ca"], bi: ["store", "📊 Mở Siêu thị"], bi_stuck: ["admin", "📊 Mở Quản lý"], rt: ["jobs", "🔁 Mở Lặp lại"] };
const ORDER = ["req_delay", "req_excuse", "late", "no_shift", "rt", "sys", "shift_conflict", "bi", "bi_stuck", "no_push", "weekly"];
let F = "need", goFn;
const fmtVN = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const at = (iso) => { const p = Object.fromEntries(fmtVN.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.hour}:${p.minute} ${p.day}/${p.month}`; };
const dmy = (d) => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : "";
const localInput = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 16);   // giờ VN cho ô datetime-local
const fromInput = (v) => new Date(v + ":00+07:00").toISOString();
const nm = (id, fb) => esc(shortName(staffById(id)?.name || fb || id));

export async function render(view, _p, { go } = {}) {
  goFn = go;
  view.innerHTML = `<div class="page-h"><div><h1>📥 Duyệt</h1><p>Mọi thứ cần anh/chị quyết nằm ở đây: Trợ lý vận hành gom việc trễ, đề nghị của NV, cảnh báo hệ thống, cùng thưởng nóng / bán thêm / sửa báo cáo. Tóm tắt gửi lúc <b id="agTimes"></b> qua Telegram + thông báo.</p></div></div>
    <div id="agHealth"></div><div class="chips" id="agF"></div><div id="agBody"><div class="empty">Đang tải…</div></div><div id="agCfg"></div>`;
  $("#agF").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { F = b.dataset.f; draw(); } };
  await draw();
  const off = onChange((w) => { if (["agent", "jobs", "pending", "proposals"].includes(w) && $("#agBody")) draw(true); });
  return () => off();
}

async function draw(quiet = false) {
  const body = $("#agBody"); if (!body) return;
  $("#agTimes").textContent = (setting("AGENT_TIMES", ["12:00", "17:00", "21:30"]) || []).join(" · ");
  if (!quiet) body.innerHTML = `<div class="empty">Đang tải…</div>`;
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const [op, dn, hp, pp, cr, hl] = await Promise.all([
    sb.from("agent_items").select("*").eq("status", "open").order("urgent", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    F === "done" ? sb.from("agent_items").select("*").neq("status", "open").gte("decided_at", since).order("decided_at", { ascending: false }).limit(200) : { data: [] },
    sb.from("hot_bonuses").select("*").eq("status", "Chờ duyệt").order("created_at").limit(100),
    sb.from("extra_proposals").select("*").eq("status", "Chờ duyệt").order("created_at").limit(100),
    sb.from("change_requests").select("*").eq("status", "pending").order("created_at").limit(100),
    sb.from("system_health").select("*").eq("key", "tick").maybeSingle(),
  ]);
  if (op.error) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(op.error))}</div></div>`; return; }
  healthBar(hl?.data);
  const QL = [...(hp.data || []).map((x) => ({ ...x, _k: "hot" })), ...(pp.data || []).map((x) => ({ ...x, _k: "prop" })), ...(cr.data || []).map((x) => ({ ...x, _k: "chg" }))];
  const open = op.data || [], need = open.filter((x) => x.needs_decision), info = open.filter((x) => !x.needs_decision);
  $("#agF").innerHTML = [["need", `🟠 Chờ duyệt ${need.length + QL.length}`], ["info", `🔵 Cần biết ${info.length}`], ["done", "✔️ Đã xử lý (3 ngày)"]]
    .map(([k, l]) => `<button type="button" class="chip ${F === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("");
  const list = F === "need" ? need : F === "info" ? info : dn.data || [];
  const kinds = [...new Set(list.map((x) => x.kind))].sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);
  const qlHtml = F === "need" && QL.length ? qlSection(QL) : "";
  const empty = F === "need" ? "✅ Không có mục nào chờ duyệt." : F === "info" ? "Không có cảnh báo nào." : "Chưa xử lý mục nào trong 3 ngày.";
  body.innerHTML = (!list.length && !qlHtml ? `<div class="empty">${empty}</div>` : "") + kinds.map((k) => {
    const l = list.filter((x) => x.kind === k), [ic, lb, hint] = LABEL[k] || ["📌", k, ""];
    return `<section class="ag-sec"><div class="ag-h"><b>${ic} ${esc(lb)}</b> <span class="muted small">(${l.length})</span>
      ${F === "need" && k === "late" && l.length > 1 ? `<button class="btn small ghost" type="button" data-bulk="close" data-kind="late">📝 Ghi trễ tất cả</button>` : ""}
      ${F === "info" && l.length > 1 ? `<button class="btn small ghost" type="button" data-bulk="close" data-kind="${esc(k)}">✔️ Đã biết tất cả</button>` : ""}</div>
      ${hint && F === "need" ? `<p class="tiny muted" style="margin:0 0 6px">${esc(hint)}</p>` : ""}
      ${l.map(card).join("")}</section>`;
  }).join("") + qlHtml;
  body.onclick = onClick(list);
  cfgPanel();
}

// Tình trạng chạy tự động: lượt gần nhất (5 phút / lần) + lỗi đang có
function healthBar(h) {
  const el = $("#agHealth"); if (!el) return;
  if (!h) { el.innerHTML = ""; return; }
  const age = Math.floor((Date.now() - Date.parse(h.at)) / 60000), errs = Object.entries(h.detail?.errors || {});
  const bad = age > 20, cls = bad ? "bad" : errs.length ? "warn" : "ok";
  el.innerHTML = `<div class="ag-health ${cls}">${bad ? "🔴" : errs.length ? "🟡" : "🟢"} Tự động (nhắc việc, Telegram, Trợ lý): lượt gần nhất <b>${esc(at(h.at))}</b>${age > 1 ? ` (${age} phút trước)` : ""}
    ${bad ? " — <b>đang dừng</b>, đã báo Telegram" : errs.length ? ` — lỗi: ${errs.map(([k]) => esc(k)).join(", ")}` : " — bình thường"}</div>`;
}

function card(x) {
  const who = x.kind.startsWith("req_") ? nm(x.staff_id, x.data?.name) : "";
  const due = x.kind === "req_delay" && x.data?.due_new ? ` · xin dời đến <b>${esc(at(x.data.due_new))}</b> (hạn cũ ${esc(at(x.data.due_old))})` : "";
  const st = x.status === "open" ? "" : `<span class="pill ${x.status === "rejected" ? "bad" : "ok"}">${{ approved: "✅ Đã duyệt", rejected: "❌ Từ chối", done: "✔️ Xong" }[x.status]}</span> <span class="tiny muted">${esc(x.note || "")}${x.decided_by ? " · " + esc(x.decided_by === "tro-ly" ? "Trợ lý tự đóng" : x.decided_by) : ""}${x.decided_at ? " · " + esc(at(x.decided_at)) : ""}</span>`;
  let btn = "";
  if (x.status === "open") {
    if (x.kind === "late") btn = `<button class="btn small primary" data-act="approve" data-id="${x.id}" data-ask="due">↩️ Cho nộp bù</button><button class="btn small" data-act="close" data-id="${x.id}">📝 Ghi trễ</button>`;
    else if (x.kind === "req_delay") btn = `<button class="btn small primary" data-act="approve" data-id="${x.id}">✅ Đồng ý dời</button><button class="btn small" data-act="reject" data-id="${x.id}" data-ask="note">❌ Từ chối</button>`;
    else if (x.kind === "req_excuse") btn = `<button class="btn small primary" data-act="approve" data-id="${x.id}">✅ Cho miễn</button><button class="btn small" data-act="reject" data-id="${x.id}" data-ask="note">❌ Từ chối</button>`;
    else btn = `${LINK[x.kind] ? `<button class="btn small ghost" data-go="${LINK[x.kind][0]}">${LINK[x.kind][1]}</button>` : ""}<button class="btn small" data-act="close" data-id="${x.id}">✔️ Đã biết</button>`;
  }
  return `<div class="ag-card ${x.urgent ? "urgent" : ""}">
    <div class="ag-t">${x.urgent ? "❗ " : ""}${who ? `<b>${who}</b>: ` : ""}${esc(x.title)}</div>
    ${x.detail ? `<div class="ag-d ${x.kind === "weekly" ? "pre" : ""}">${esc(x.detail)}${due}</div>` : due ? `<div class="ag-d">${due}</div>` : ""}
    <div class="ag-f"><span class="tiny muted">${esc(at(x.created_at))}</span>${st}<span class="grow"></span>${btn}</div></div>`;
}

// 🔥 Thưởng nóng · 🎁 Thưởng bán thêm · ✏️ Sửa báo cáo sau giờ chốt (trước đây ở Quản lý → Duyệt)
function qlSection(QL) {
  const T = { hot: "🔥 Thưởng nóng", prop: "🎁 Thưởng bán thêm ngoài thi đua", chg: "✏️ Sửa báo cáo sau giờ chốt" };
  return ["hot", "prop", "chg"].map((k) => {
    const l = QL.filter((x) => x._k === k); if (!l.length) return "";
    return `<section class="ag-sec"><div class="ag-h"><b>${T[k]}</b> <span class="muted small">(${l.length})</span></div>${l.map((x) => {
      const head = k === "hot" ? `<b>${nm(x.staff_id)}</b> · ${esc(x.item_name)} · ${dmy(x.report_date)}`
        : k === "prop" ? `<b>${nm(x.staff_id, x.staff_name)}</b> · ${dmy(x.report_date)}` : `<b>${nm(x.staff_id)}</b> · báo cáo ${dmy(x.report_date)}`;
      const detail = k === "hot" ? esc(x.reason) : k === "prop" ? esc(x.content)
        : `Lý do: <i>${esc(x.reason)}</i>${(x.payload?.reports || []).length ? `<div class="chips" style="margin-top:4px">${x.payload.reports.map((r) => `<span class="chip">${esc(r.itemName)}: <b>${esc(r.actual)}</b></span>`).join("")}</div>` : ""}${x.payload?.extraItem ? `<div>🎁 ${esc(x.payload.extraItem)} (${esc(x.payload.extraStars)}⭐)</div>` : ""}`;
      const stars = k !== "chg" ? `<label class="tiny muted">Sao <input type="number" min="0" step="${k === "hot" ? 100 : 50}" value="${Number(x.stars) || 0}" data-qs="${k}-${x.id}" style="width:84px;text-align:right"></label>` : "";
      return `<div class="ag-card"><div class="ag-t">${head}</div><div class="ag-d">${detail}</div>
        <div class="ag-f"><span class="tiny muted">${esc(at(x.created_at))}</span><span class="grow"></span>${stars}
          <button class="btn small primary" data-ql="${k}" data-id="${esc(x.id)}" data-ok="1">✅ Duyệt</button><button class="btn small" data-ql="${k}" data-id="${esc(x.id)}" data-ok="0">❌ Từ chối</button></div></div>`;
    }).join("")}</section>`;
  }).join("");
}

function onClick(list) {
  return async (e) => {
    const q = e.target.closest("[data-ql]");
    if (q) {
      const id = q.dataset.id, ok = q.dataset.ok === "1", k = q.dataset.ql;
      q.disabled = true;
      try {
        const stars = Number(document.querySelector(`[data-qs="${k}-${id}"]`)?.value) || 0;
        const r = k === "hot" ? await rpc("review_hot_bonus", { p_id: Number(id), p_approve: ok, p_stars: stars })
          : k === "prop" ? await rpc("review_proposal", { p_id: Number(id), p_approve: ok, p_stars: stars })
          : await rpc("review_change", { p_id: id, p_approve: ok });
        toast(r?.message || (ok ? "Đã duyệt" : "Đã từ chối"), 3000);
        loadPending(); if (k !== "chg") loadStaff();
        draw(true);
      } catch (x) { toast(errMsg(x), 5000); q.disabled = false; }
      return;
    }
    const g = e.target.closest("[data-go]"); if (g) { try { if (g.dataset.go === "jobs") localStorage.setItem("thidua-v2-jobs", "shift"); if (g.dataset.go === "guide") localStorage.setItem("thidua-v2-guide", "track"); } catch { /* bỏ qua */ } return goFn?.(g.dataset.go); }
    const bk = e.target.closest("[data-bulk]");
    const b = e.target.closest("[data-act]");
    if (!bk && !b) return;
    let ids, action, due = null, note = "";
    if (bk) { ids = list.filter((x) => x.kind === bk.dataset.kind && x.status === "open").map((x) => x.id); action = "close"; note = "Ghi nhận"; }
    else {
      ids = [Number(b.dataset.id)]; action = b.dataset.act;
      if (b.dataset.ask === "due") {
        const v = await modal(`<h3>↩️ Cho nộp bù</h3><p class="small muted">Trợ lý tạo việc "Nộp bù" cho NV với hạn mới; việc cũ vẫn ghi trễ. NV nhận thông báo.</p>
          <label>Hạn nộp bù<input type="datetime-local" id="agDue" value="${localInput(Date.now() + 2 * 3600e3)}"></label>
          <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="ok" id="agOk">Cho nộp bù</button></div>`,
          { onOpen(bd) { $("#agOk", bd).addEventListener("click", () => { due = $("#agDue", bd).value; }, { capture: true }); } });
        if (v !== "ok" || !due) return;
        due = fromInput(due);
      }
      if (b.dataset.ask === "note") {
        const v = await modal(`<h3>❌ Từ chối</h3><label>Lý do (NV sẽ thấy, không bắt buộc)<input id="agNote" maxlength="200"></label>
          <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn danger" data-v="ok" id="agOk">Từ chối</button></div>`,
          { onOpen(bd) { $("#agOk", bd).addEventListener("click", () => { note = $("#agNote", bd).value.trim(); }, { capture: true }); } });
        if (v !== "ok") return;
      }
    }
    if (!ids.length) return;
    try {
      const r = await rpc("agent_decide", { p_ids: ids, p_action: action, p_due: due, p_note: note });
      toast(r.message, 3500);
      // báo kết quả cho NV (cả ca nếu là việc của cả ca)
      for (const n of r.notify || []) {
        const to = [...new Set((n.group || [n.staff_id]).map(String))];
        callFn("push", { mode: "send", ids: to, title: "📋 Kết quả duyệt", body: n.text, tag: "agent-res", ...(n.job_id ? { jobs: [n.job_id] } : {}) }).catch(() => {});
      }
      loadPending();
      draw(true);
    } catch (x) { toast(errMsg(x), 5000); }
  };
}

function cfgPanel() {
  const el = $("#agCfg"); if (!el) return;
  if (!isOwner()) { el.innerHTML = ""; return; }
  const t = (setting("AGENT_TIMES", ["12:00", "17:00", "21:30"]) || []).join(", ");
  el.innerHTML = `<details class="ag-cfg"><summary class="linkish">⚙️ Cài đặt Trợ lý vận hành</summary>
    <div class="fields" style="margin-top:8px">
      <label>Bật Trợ lý<select id="cOn"><option value="1" ${setting("AGENT_ON", true) !== false ? "selected" : ""}>Bật</option><option value="0" ${setting("AGENT_ON", true) === false ? "selected" : ""}>Tắt</option></select></label>
      <label>Khung giờ gửi hộp duyệt<input id="cTimes" value="${esc(t)}" placeholder="12:00, 17:00, 21:30"></label>
      <label>Báo lên trưởng ca / QL khi quá hạn (phút)<input type="number" id="cEsc" min="5" max="240" value="${Number(setting("AGENT_ESC_MIN", 30))}"></label>
      <label>… hoặc đã nhắc (lần) mà NV không mở<input type="number" id="cNag" min="1" max="10" value="${Number(setting("AGENT_ESC_NAGS", 3))}"></label>
      <label>Giờ kiểm tra lịch ca ngày mai<input type="time" id="cShift" value="${esc(setting("AGENT_SHIFT_CHECK", "20:00"))}"></label>
      <label>Giờ kiểm tra ảnh BI<input type="time" id="cBi" value="${esc(setting("AGENT_BI_CHECK", "09:30"))}"></label>
    </div>
    <p class="tiny muted">Tin Telegram gửi tới nơi nhận đang cài ở Quản lý → Telegram (mục "🤖 Trợ lý vận hành"). Tool ngừng chạy quá 30 phút → bộ canh riêng báo Telegram.</p>
    <div class="row"><button class="btn small primary" type="button" id="cSave">💾 Lưu</button></div></details>`;
  $("#cSave").onclick = async () => {
    const times = $("#cTimes").value.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)).sort();
    if (!times.length) return toast("Khung giờ dạng 12:00, 17:00, 21:30");
    const rows = [["AGENT_ON", $("#cOn").value === "1"], ["AGENT_TIMES", times], ["AGENT_ESC_MIN", Math.max(5, Number($("#cEsc").value) || 30)],
      ["AGENT_ESC_NAGS", Math.max(1, Number($("#cNag").value) || 3)], ["AGENT_SHIFT_CHECK", $("#cShift").value || "20:00"], ["AGENT_BI_CHECK", $("#cBi").value || "09:30"]];
    const { error } = await sb.from("settings").upsert(rows.map(([key, value]) => ({ key, value, updated_by: S.me.email, updated_at: new Date().toISOString() })));
    if (error) return toast(errMsg(error), 5000);
    await loadSettings(); toast("Đã lưu cài đặt Trợ lý"); draw(true);
  };
}
