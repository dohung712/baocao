// 📖 Hướng dẫn (D16, mọi vai trò) — nội dung đọc từ v2/guide.json:
//  📖 Hướng dẫn: thẻ chức năng theo vai trò (tìm nhanh) · 🆕 Có gì mới · ✅ Nhập môn (tự đánh dấu) · 💬 Hỏi cách dùng (AI)
//  QL / Giám đốc thêm: 📋 Lịch làm việc mẫu của Quản lý · 👥 Theo dõi ai đã đọc / đã xong nhập môn
import { $, esc, toast, shortName } from "../ui.js";
import { S, rpc, callFn, errMsg, isManager } from "../store.js";
import { loadGuide, progress, ack, visit, askedOnce, autoCheck, forMe, onboardList, roleKey } from "../guide-track.js";

const SHARE = "https://dohung712.github.io/baocao/v2/huongdan.html";
let tab = "cards", q = "", chat = [], goFn;

export async function render(view, _p, { go } = {}) {
  goFn = go;
  try { tab = localStorage.getItem("thidua-v2-guide") || tab; } catch { /* bỏ qua */ }
  view.innerHTML = `<div class="page-h"><div><h1>📖 Hướng dẫn</h1><p>Cách dùng tool theo vai trò <b>${esc({ nv: "Nhân viên", ql: "Quản lý", gd: "Giám đốc" }[roleKey()])}</b>. Tool cập nhật thường xuyên — mục 🆕 Có gì mới luôn ghi phần vừa thay đổi.</p></div>
    <button class="btn small ghost" type="button" id="gdShare">🔗 Link chia sẻ</button></div>
    <div class="subtabs" id="gdTabs"></div><div id="gdBody"><div class="empty">Đang tải…</div></div>`;
  $("#gdShare").onclick = async () => { try { await navigator.clipboard.writeText(SHARE); toast("Đã chép link hướng dẫn — dán vào Zalo để gửi", 3500); } catch { toast(SHARE, 6000); } };
  $("#gdTabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; try { localStorage.setItem("thidua-v2-guide", tab); } catch { /* bỏ qua */ } draw(); };
  visit("guide");
  await draw();
}

async function draw() {
  const mgr = isManager();
  const tabs = [["cards", "📖 Hướng dẫn"], ["news", "🆕 Có gì mới"], ["onboard", "✅ Nhập môn"], ["ask", "💬 Hỏi"], ...(mgr ? [["qlday", "📋 Lịch QL"], ["track", "👥 Theo dõi"]] : [])];
  if (!tabs.some(([k]) => k === tab)) tab = "cards";
  $("#gdTabs").innerHTML = tabs.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("");
  const body = $("#gdBody");
  try {
    const g = await loadGuide();
    if (tab === "cards") return cards(body, g);
    if (tab === "news") return news(body, g);
    if (tab === "onboard") return onboard(body, g);
    if (tab === "ask") return askView(body);
    if (tab === "qlday") { visit("qlday"); return qlday(body, g); }
    if (tab === "track") return track(body, g);
  } catch (e) { body.innerHTML = `<div class="banner bad"><div>${esc(errMsg(e))}</div></div>`; }
}

const cardHtml = (c) => `<details class="gd-card"><summary><span class="gd-ic">${c.icon}</span><b>${esc(c.title)}</b></summary>
  <div class="gd-c"><p>${esc(c.what)}</p><p>📍 <b>Ở đâu:</b> ${esc(c.where)}</p><p>🕑 <b>Khi nào:</b> ${esc(c.when)}</p>
  ${c.steps?.length ? `<ul>${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}</div></details>`;
function cards(body, g) {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  const paint = () => {
    const list = g.cards.filter((c) => forMe(c.roles) && (!q || norm([c.title, c.what, c.where, c.when, ...(c.steps || [])].join(" ")).includes(norm(q))));
    const groups = [...new Set(list.map((c) => c.group))];
    $("#gdList").innerHTML = list.length ? groups.map((gr) => `<h3 class="gd-g">${esc(gr)}</h3>${list.filter((c) => c.group === gr).map(cardHtml).join("")}`).join("")
      : `<div class="empty">Không thấy thẻ nào. Thử hỏi ở tab 💬 Hỏi.</div>`;
  };
  body.innerHTML = `<input id="gdQ" placeholder="🔎 Tìm: nộp việc, thông báo, dời hạn…" value="${esc(q)}" style="margin-bottom:8px"><div id="gdList"></div>`;
  $("#gdQ").oninput = (e) => { q = e.target.value; paint(); };
  paint();
}
async function news(body, g) {
  const p = await progress();
  const list = g.news.filter((n) => forMe(n.roles));
  body.innerHTML = list.map((n) => `<div class="gd-news ${p.news.has(n.id) ? "read" : ""}"><div class="row"><b class="grow">${esc(n.title)}</b><span class="tiny muted">${esc(n.date.slice(8))}/${esc(n.date.slice(5, 7))}</span></div>
    <ul>${n.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${p.news.has(n.id) ? `<span class="tiny muted">✔️ Đã đọc</span>` : `<button class="btn small primary" type="button" data-ack="${esc(n.id)}">✅ Đã hiểu</button>`}</div>`).join("") || `<div class="empty">Chưa có cập nhật.</div>`;
  body.onclick = async (e) => { const b = e.target.closest("[data-ack]"); if (!b) return; await ack("news", [b.dataset.ack]); news(body, g); };
}
async function onboard(body, g) {
  await autoCheck().catch(() => {});
  const p = await progress(true), list = onboardList(g), n = list.filter((x) => p.onboard.has(x.id)).length;
  body.innerHTML = `<p class="small muted">Làm lần lượt từng bước — tool tự đánh dấu khi bạn làm xong (bước nào tool không tự nhận ra thì bấm "Tôi đã làm").</p>
    <div class="gd-prog"><b>${n}/${list.length}</b> bước${p.onboard.has("done") || n === list.length ? " · 🎉 Đã hoàn thành" : ""}</div>
    ${list.map((x, i) => { const ok = p.onboard.has(x.id); return `<div class="gd-step ${ok ? "ok" : ""}"><span class="gd-n">${ok ? "✅" : i + 1}</span><div class="grow"><b>${esc(x.title)}</b><div class="small muted">${esc(x.how)}</div></div>
      ${ok ? "" : `<button class="btn small ghost" type="button" data-done="${esc(x.id)}">Tôi đã làm</button>`}</div>`; }).join("")}`;
  body.onclick = async (e) => { const b = e.target.closest("[data-done]"); if (!b) return; await ack("onboard", [b.dataset.done]); onboard(body, g); };
}
function askView(body) {
  const SUG = roleKey() === "nv" ? ["Nộp việc bằng link TikTok thế nào?", "Không kịp nộp thì làm sao?", "Sao tôi không nhận được thông báo?", "Việc cả ca là gì?"]
    : ["Cho nộp bù thế nào?", "Lịch ca ngày mai đưa vào đâu?", "Ảnh BI úp ở đâu, mấy giờ?", "Làm sao biết NV đã xem thông báo?"];
  body.innerHTML = `<div class="av-chat" id="gdChat"></div>
    <div class="chips" id="gdSug" style="margin:6px 0">${SUG.map((s) => `<button type="button" class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <form id="gdForm" class="av-form"><textarea id="gdAsk" rows="2" placeholder="Hỏi cách dùng tool…" maxlength="600"></textarea><button class="btn primary" type="submit" id="gdSend">Hỏi</button></form>`;
  const box = $("#gdChat");
  const paint = () => { box.innerHTML = chat.length ? chat.map((m) => `<div class="av-msg ${m.role}">${esc(m.text)}</div>`).join("") : `<p class="small muted">Gõ câu hỏi về cách dùng tool, AI trả lời theo hướng dẫn.</p>`; box.scrollTop = box.scrollHeight; };
  paint();
  const send = async (text) => {
    text = String(text || "").trim(); if (!text) return;
    chat.push({ role: "me", text }, { role: "ai", text: "⏳ Đang tìm trong hướng dẫn…" }); paint();
    $("#gdSend").disabled = true;
    try { const r = await callFn("advisor", { mode: "howto", question: text }); chat[chat.length - 1] = { role: "ai", text: r.answer }; askedOnce(); }
    catch (x) { chat[chat.length - 1] = { role: "ai", text: "⚠️ " + errMsg(x) }; }
    if ($("#gdSend")) $("#gdSend").disabled = false;
    if ($("#gdChat")) paint();
  };
  $("#gdSug").onclick = (e) => { const c = e.target.closest("[data-q]"); if (c) send(c.dataset.q); };
  $("#gdForm").onsubmit = (e) => { e.preventDefault(); const t = $("#gdAsk").value; $("#gdAsk").value = ""; send(t); };
}
function qlday(body, g) {
  body.innerHTML = `<p class="small muted">Lịch mẫu theo các chức năng hiện có — Giám đốc chỉnh lại cho đúng cách vận hành của siêu thị (báo người phụ trách tool sửa file guide.json).</p>
    ${g.qlday.map((s) => `<div class="gd-day"><div class="gd-time">${esc(s.icon)} <b>${esc(s.time)}</b> · ${esc(s.title)}</div><ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}`;
}
async function track(body, g) {
  body.innerHTML = `<div class="empty">Đang tải…</div>`;
  const rows = await rpc("guide_overview");
  const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const rk = (r) => (r === "owner" ? "gd" : r === "manager" ? "ql" : "nv");
  const list = (Array.isArray(rows) ? rows : []).map((r) => {
    const role = rk(r.role), news = g.news.filter((n) => (n.roles.includes(role) || (role === "gd" && n.roles.includes("ql"))) && n.date >= since);
    const ob = (role === "nv" ? g.onboard.nv : g.onboard.ql) || [];
    const unread = news.filter((n) => !r.news.includes(n.id));
    return { ...r, role, unread, obN: ob.filter((x) => r.onboard.includes(x.id)).length, obT: ob.length, obDone: r.onboard.includes("done") };
  });
  const bad = list.filter((x) => !x.first || x.unread.length || !x.obDone);
  body.innerHTML = `<p class="small muted">Có gì mới trong 21 ngày gần đây và bài Nhập môn của từng tài khoản. Quá 2 ngày chưa đọc / 3 ngày chưa xong nhập môn → Trợ lý báo trong 📥 Duyệt.</p>
    <div class="gd-prog">${list.length - bad.length}/${list.length} người đã đọc hết & xong nhập môn</div>
    <div class="tbl-wrap"><table><thead><tr><th>Người</th><th>Vai trò</th><th>Có gì mới</th><th>Nhập môn</th></tr></thead><tbody>
    ${list.sort((a, b) => Number(!b.first) - Number(!a.first) || b.unread.length - a.unread.length || a.obN - b.obN).map((x) => `<tr>
      <td>${esc(x.name ? shortName(x.name) : x.email.split("@")[0])}</td><td class="small">${esc({ nv: "NV", ql: "QL", gd: "GĐ" }[x.role])}</td>
      <td class="small">${!x.first ? `<span class="c-bad">chưa mở tool</span>` : x.unread.length ? `<span class="c-bad">chưa đọc ${x.unread.length}</span>` : "✅"}</td>
      <td class="small">${x.obDone ? "✅" : `${x.obN}/${x.obT}`}</td></tr>`).join("")}</tbody></table></div>`;
}
