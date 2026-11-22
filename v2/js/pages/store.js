// Trang Thi đua siêu thị: dán số liệu realtime, xếp hạng môn, gợi ý sao
import { $, $$, esc, fmt, toast, copyText, sortTh, sorter, applySort, dmy } from "../ui.js";
import { sb, S, rpc, onChange, isManager, setting, errMsg, staffById } from "../store.js";
import { loadBi, biRevenueHtml, biStaffHtml, biToolsHtml, bindBiTools } from "../bi.js";

// Bóc tách văn bản báo cáo nội bộ (giữ đúng cách làm của bản cũ)
export function parseStoreText(text) {
  const normalized = text.replace(/TỔNG/g, "\nTỔNG").replace(/AAR_DNA_HCH/g, "\nAAR_DNA_HCH").replace(/TGD_DNA_HCH/g, "\nTGD_DNA_HCH");
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = []; let name = "", type = "DOANH THU";
  for (const line of lines) {
    if (!line.startsWith("TỔNG") && !line.startsWith("AAR_DNA_HCH") && !line.startsWith("TGD_DNA_HCH")) {
      if (line.includes("DOANH THU")) { type = "DOANH THU"; name = line.split("DOANH THU")[0].trim(); }
      else if (line.includes("SỐ LƯỢNG")) { type = "SỐ LƯỢNG"; name = line.split("SỐ LƯỢNG")[0].trim(); }
      else name = line;
      continue;
    }
    const branch = line.includes("AAR_DNA_HCH") ? "AAR" : line.includes("TGD_DNA_HCH") ? "TGD" : "TỔNG";
    const clean = line.replace(/TỔNG|AAR_DNA_HCH\s*-\s*351\s*Nguyễn\s*Hữu\s*Thọ|TGD_DNA_HCH\s*-\s*351\s*Nguyễn\s*Hữu\s*Thọ/g, "").trim();
    const t = clean.match(/([0-9.,]+%?|-)/g);
    if (t && t.length >= 3) {
      const rateMonth = parseFloat(t[2].replace("%", "")) || 0;
      let rank = t[4] || "-"; if (rank !== "-" && isNaN(parseInt(rank))) rank = "-";
      out.push({ name: name || "Chưa đặt tên", type, actual: parseFloat(t[0].replace(/,/g, "")) || 0, target: parseFloat(t[1].replace(/,/g, "")) || 0,
        rateMonth, forecast: t[3] ? (parseFloat(t[3].replace("%", "")) || 0) : rateMonth, rank: String(rank), branch });
    }
  }
  return out;
}

// 4 quy tắc gợi ý sao (giống bản cũ)
export function suggest(c) {
  const f = Number(c.forecast) || 0, r = Number(c.rate_month ?? c.rateMonth) || 0, gap = Math.max(0, c.target - c.actual);
  if (r === 0 || f === 0) return { bonus: 500, penalty: 300, label: "Phá băng", cls: "bad" };
  if (f > 150) return { bonus: 100, penalty: 0, label: "Về số cao", cls: "ok" };
  if (f >= 70 && f <= 100) return { bonus: 300, penalty: 200, label: "Sát nút", cls: "warn" };
  if (gap > 0 && gap <= 5 && f >= 60) return { bonus: 400, penalty: 250, label: "Thiếu ít", cls: "warn" };
  return { bonus: 200, penalty: 100, label: "Tiêu chuẩn", cls: "mute" };
}

let st;
export async function render(view) {
  st = { rows: [], branch: "TỔNG", filter: "", sort: { key: "forecast", dir: -1 }, draft: null, updated: null };
  view.innerHTML = `
    <div class="page-h"><div><h1>Thi đua siêu thị</h1><p>${esc(setting("STORE_NAME", ""))} · TGDĐ (TGD) và Topzone (AAR)</p></div>
      <div class="row"><button class="btn small" id="sCopy" type="button">📋 Copy báo cáo</button><button class="btn small" id="sCopy70" type="button">🎯 Copy môn 70–100%</button></div></div>
    ${isManager() ? `<details class="card" id="sPaste" style="margin-bottom:14px"><summary><b>📥 Dán số liệu lũy kế & realtime</b> <span class="muted small">— copy báo cáo nội bộ rồi dán vào đây</span></summary>
      <textarea id="sText" style="margin-top:10px;min-height:120px" placeholder="Dán nguyên văn bảng báo cáo (có các dòng TỔNG, TGD_DNA_HCH, AAR_DNA_HCH)…"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="sParse" type="button">⚡ Bóc tách</button><button class="btn primary" id="sSave" type="button" disabled>💾 Lưu cho mọi người</button><span class="muted small" id="sParseMsg"></span></div></details>` : ""}
    ${isManager() ? `<div id="sBiTools"></div>` : ""}
    <div id="sBi"></div>
    <h3 class="td-sec">🏁 Thi đua từng môn</h3>
    <div class="stats" id="sStats"></div>
    <div class="row" style="margin-bottom:10px">
      <div class="seg" id="sBranch"><button data-b="TỔNG" class="on" type="button">Toàn siêu thị</button><button data-b="TGD" type="button">TGDĐ</button><button data-b="AAR" type="button">Topzone</button></div>
      <div class="seg" id="sFilter"><button data-f="" class="on" type="button">Tất cả</button><button data-f="near" type="button">70–100%</button><button data-f="high" type="button">&gt;150%</button><button data-f="zero" type="button">0%</button></div>
      <span class="muted small" id="sUpdated"></span>
    </div>
    <div id="sTable"></div>
    <div id="sBiStaff"></div>`;
  $("#sBranch").onclick = (e) => { const b = e.target.closest("[data-b]"); if (!b) return; $$("#sBranch button").forEach((x) => x.classList.toggle("on", x === b)); st.branch = b.dataset.b; draw(); };
  $("#sFilter").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; $$("#sFilter button").forEach((x) => x.classList.toggle("on", x === b)); st.filter = b.dataset.f; draw(); };
  $("#sTable").addEventListener("click", (e) => { const th = e.target.closest("th[data-sort]"); if (th) { sorter(st.sort, th.dataset.sort); draw(); } });
  $("#sCopy").onclick = () => copyReport(false);
  $("#sCopy70").onclick = () => copyReport(true);
  if (isManager()) {
    $("#sParse").onclick = () => {
      const parsed = parseStoreText($("#sText").value);
      if (!parsed.length) { $("#sParseMsg").textContent = "Không nhận ra dữ liệu — kiểm tra lại đoạn dán."; return; }
      st.draft = parsed; $("#sSave").disabled = false;
      $("#sParseMsg").textContent = `Bóc tách được ${parsed.length} dòng — xem trước bên dưới, bấm Lưu để cập nhật cho mọi người.`;
      draw();
    };
    $("#sSave").onclick = async () => {
      try { const r = await rpc("save_store_contest", { p_rows: st.draft }); toast(`Đã lưu ${r.rows} dòng`); st.draft = null; $("#sSave").disabled = true; $("#sText").value = ""; $("#sParseMsg").textContent = ""; load(); }
      catch (e) { toast(errMsg(e), 4000); }
    };
  }
  await load();
  const off = onChange((w) => { if (w === "contest") load(); });
  return () => off();
}

async function load() {
  if (!$("#sTable")) return;
  const [{ data, error }, bi] = await Promise.all([sb.from("store_contest").select("*").order("sort"), loadBi().catch(() => null)]);
  if (error) { $("#sTable").innerHTML = `<div class="banner bad"><div>${esc(errMsg(error))}</div></div>`; return; }
  if (!$("#sTable")) return;
  st.rows = data; st.updated = data.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), "");
  st.bi = bi;
  if (bi) {
    $("#sBi").innerHTML = biRevenueHtml(bi);
    $("#sBiStaff").innerHTML = biStaffHtml(bi, (id) => staffById(id)?.name);
    const tools = $("#sBiTools");
    if (tools) { const open = tools.querySelector("details")?.open; tools.innerHTML = biToolsHtml(bi); if (open) tools.querySelector("details").open = true; bindBiTools(tools, load); }
  }
  draw();
}

function current() {
  const src = st.draft ? st.draft.map((r) => ({ ...r, rate_month: r.rateMonth })) : st.rows;
  return src.filter((r) => r.branch === st.branch).filter((r) => {
    const f = Number(r.forecast) || 0;
    if (st.filter === "near") return f >= 70 && f <= 100;
    if (st.filter === "high") return f > 150;
    if (st.filter === "zero") return f === 0;
    return true;
  }).map((r) => {
    const gap = Number(r.target) ? Math.max(0, Number(r.target) - Number(r.actual)) : 0;
    return { ...r, rankNum: parseInt(r.rank) || 9999, sug: suggest(r), gap, perDay: gap ? gap / Math.max(1, daysLeft()) : 0 };
  });
}
// Số ngày còn lại để bán: theo ảnh BI (21/30 → 9 ngày), không có thì theo lịch (tính cả hôm nay)
function daysLeft() {
  if (st.bi?.days?.left !== null && st.bi?.days?.left !== undefined) return st.bi.days.left;
  const d = new Date(Date.now() + 7 * 36e5), tot = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return tot - d.getUTCDate() + 1;
}

function draw() {
  if (!$("#sTable")) return;
  const all = (st.draft ? st.draft : st.rows).filter((r) => r.branch === st.branch);
  const done = all.filter((r) => r.forecast >= 100).length, near = all.filter((r) => r.forecast >= 70 && r.forecast < 100).length, zero = all.filter((r) => !r.forecast).length;
  $("#sStats").innerHTML = `<div class="stat"><small>Số môn</small><b>${all.length}</b></div><div class="stat"><small>Dự báo về số</small><b class="pos">${done}</b></div>
    <div class="stat"><small>Sát nút 70–100%</small><b class="star">${near}</b></div><div class="stat"><small>Chưa phát sinh</small><b class="neg">${zero}</b></div>`;
  $("#sUpdated").innerHTML = st.draft ? '<span class="pill warn">Bản xem trước — chưa lưu</span>' : st.updated ? `Cập nhật ${new Date(st.updated).toLocaleString("vi-VN")}` : "";
  const list = applySort(current(), st.sort);
  if (!list.length) { $("#sTable").innerHTML = `<div class="tbl-wrap"><div class="empty">Chưa có số liệu${isManager() ? " — dán báo cáo ở khung phía trên" : ""}.</div></div>`; return; }
  $("#sTable").innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>#</th>${sortTh(st.sort, "name", "Môn thi đua")}${sortTh(st.sort, "actual", "Đạt", "num")}${sortTh(st.sort, "target", "Target", "num")}${sortTh(st.sort, "gap", "Còn thiếu", "num")}${sortTh(st.sort, "perDay", `Cần/ngày (${daysLeft()}n)`, "num")}${sortTh(st.sort, "rate_month", "% HT tháng", "num")}${sortTh(st.sort, "forecast", "% Dự báo")}${sortTh(st.sort, "rankNum", "Hạng vùng", "num")}<th>Gợi ý sao</th></tr></thead><tbody>
    ${list.map((r, i) => { const f = Number(r.forecast) || 0; return `<tr><td class="muted">${i + 1}</td><td><b>${esc(r.name)}</b><div class="tiny muted">${esc(r.type)}</div></td>
      <td class="num">${fmt(r.actual, 2)}</td><td class="num">${fmt(r.target, 2)}</td>
      <td class="num">${!Number(r.target) ? '<span class="muted">—</span>' : r.gap ? fmt(r.gap, 2) : '<span class="pos">✅</span>'}</td><td class="num">${r.gap ? `<b>${fmt(r.perDay, r.type === "SỐ LƯỢNG" ? 1 : 2)}</b>` : '<span class="muted">—</span>'}</td><td class="num">${fmt(r.rate_month, 1)}%</td>
      <td><div class="row" style="gap:6px;flex-wrap:nowrap"><div class="bar ${f >= 100 ? "" : f >= 70 ? "mid" : "low"}" style="width:80px"><i style="width:${Math.min(100, f)}%"></i></div><b class="small">${fmt(f, 1)}%</b></div></td>
      <td class="num">${r.rank === "-" ? '<span class="muted">—</span>' : esc(r.rank)}</td>
      <td><span class="pill ${r.sug.cls}">${r.sug.label}</span> <span class="small">+${r.sug.bonus} / −${r.sug.penalty}</span></td></tr>`; }).join("")}
    </tbody></table></div>`;
}

async function copyReport(onlyNear) {
  const list = current().filter((r) => !onlyNear || (r.forecast >= 70 && r.forecast <= 100)).sort((a, b) => b.forecast - a.forecast);
  const label = { TỔNG: "TOÀN SIÊU THỊ", TGD: "TGDĐ", AAR: "TOPZONE" }[st.branch];
  const text = [`📊 TIẾN ĐỘ THI ĐUA ${label}${onlyNear ? " – MÔN 70–100%" : ""}`, `${setting("STORE_NAME", "")} · ${dmy(new Date().toISOString().slice(0, 10))}`, "",
    ...list.map((r, i) => `${i + 1}. ${r.name} (${r.type})\n   • Đạt ${fmt(r.actual, 2)} / ${fmt(r.target, 2)} · Tháng ${fmt(r.rate_month, 1)}% · Dự báo ${fmt(r.forecast, 1)}%${r.rank !== "-" ? " · Hạng " + r.rank : ""}${r.gap ? `\n   • Còn thiếu ${fmt(r.gap, 2)} → cần ${fmt(r.perDay, 2)}/ngày (${daysLeft()} ngày)` : ""}`)].join("\n");
  toast((await copyText(text)) ? "Đã copy" : "Không copy được");
}
