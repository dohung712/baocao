// Trang Trợ lý: hỏi nhanh số liệu thi đua (tự trả lời từ dữ liệu), câu hỏi tự do dùng AI nếu đã cài khoá
import { $, esc, fmt, sign, vnToday, addDays, weekStart, monthStart, dmy, dm, dow, norm, shortName } from "../ui.js";
import { sb, S, rpc, isManager, visibleStaff, staffById, setting, errMsg, SUPABASE_URL, SUPABASE_KEY } from "../store.js";

const GROUPS = [
  ["📝 Báo cáo", ["Ai chưa báo cáo hôm nay?", "Hôm qua ai thiếu báo cáo?", "Ai nộp trễ tháng này?", "Có gì đang chờ duyệt?"]],
  ["📅 Lịch", ["Ai OFF / bận hôm nay?", "Lịch bận 7 ngày tới", "Ai vệ sinh hôm nay?", "Lịch roadshow 7 ngày tới"]],
  ["⭐ Sao & BXH", ["Top sao tuần này", "Top sao tháng này", "Ai đang có chuỗi chưa về dài nhất?"]],
  ["📋 Môn", ["Môn nào yếu nhất tháng này?", "Tỉ lệ về số theo môn tuần này"]],
  ["📱 CV", ["Ai chưa nộp TikTok kỳ gần nhất?"]],
];
let msgs = [], aiOn = false;

export async function render(view) {
  try { const st = await rpc("private_setting_status"); aiOn = !!(st.GEMINI_API_KEY || st.AI); } catch { aiOn = false; }
  view.innerHTML = `<div class="page-h"><div><h1>Trợ lý thi đua</h1><p>Bấm câu hỏi nhanh hoặc gõ tự nhiên, VD: <i>“Bình chưa báo cáo ngày nào”</i>, <i>“chuỗi của Lan”</i>, <i>“ai OFF ngày mai”</i>${aiOn && isManager() ? " · câu hỏi khác sẽ hỏi AI" : ""}</p></div></div>
    <div class="grid2" style="grid-template-columns:minmax(0,2fr) minmax(260px,1fr);align-items:start">
      <div class="card chat"><div class="msgs" id="msgs"></div>
        <form id="askF" class="row"><input id="ask" class="grow" style="width:auto" placeholder="Hỏi về báo cáo, sao, chuỗi, lịch bận, TikTok…" autocomplete="off"><button class="btn primary" type="submit">Gửi</button></form></div>
      <div class="card"><div class="card-h"><h3>Câu hỏi nhanh</h3></div>${GROUPS.map(([g, qs]) => `<p class="small muted" style="margin:8px 0 4px">${g}</p><div class="qchips">${qs.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>`).join("")}
        <p class="small muted" style="margin:10px 0 4px">👤 Tra cứu nhanh nhân viên</p><div class="qchips">${visibleStaff().map((s) => `<button type="button" data-q="${esc(shortName(s.name))}">${esc(shortName(s.name))}</button>`).join("")}</div></div>
    </div>`;
  if (!msgs.length) msgs.push({ role: "ai", html: `👋 Chào ${esc(S.me.email.split("@")[0])}! Mình trả lời từ dữ liệu thi đua hiện tại. Chọn câu hỏi bên phải hoặc gõ câu hỏi.` });
  drawMsgs();
  $("#askF").onsubmit = (e) => { e.preventDefault(); const q = $("#ask").value.trim(); if (q) { $("#ask").value = ""; ask(q); } };
  view.querySelector(".card:last-child").onclick = (e) => { const b = e.target.closest("[data-q]"); if (b) ask(b.dataset.q); };
}

function drawMsgs() {
  const el = $("#msgs"); if (!el) return;
  el.innerHTML = msgs.map((m) => `<div class="bubble ${m.role === "me" ? "me" : "bot"}">${m.role === "me" ? esc(m.text) : m.html}</div>`).join("");
  el.scrollTop = el.scrollHeight;
}
async function ask(q) {
  msgs.push({ role: "me", text: q }); msgs.push({ role: "ai", html: "⏳ Đang tra cứu…" }); drawMsgs();
  let html;
  try { html = await answer(q); } catch (e) { html = "⚠️ " + esc(errMsg(e)); }
  msgs[msgs.length - 1] = { role: "ai", html, text: html.replace(/<[^>]+>/g, " ") }; drawMsgs();
}

// ---------- Hiểu câu hỏi ----------
function findDate(t) {
  const today = vnToday();
  if (/hom qua/.test(t)) return addDays(today, -1);
  if (/ngay mai|\bmai\b/.test(t)) return addDays(today, 1);
  const m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (m) return `${m[3] || today.slice(0, 4)}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return today;
}
function findStaff(t) {
  const list = visibleStaff().map((s) => ({ s, full: norm(s.name), last2: norm(shortName(s.name)), last: norm(s.name).split(/\s+/).pop() }));
  const hit = list.filter((x) => t.includes(x.full)); if (hit.length) return hit[0].s;
  const h2 = list.filter((x) => new RegExp(`\\b${x.last2}\\b`).test(t)); if (h2.length === 1) return h2[0].s;
  const h1 = list.filter((x) => x.last.length > 1 && new RegExp(`\\b${x.last}\\b`).test(t)); if (h1.length === 1) return h1[0].s;
  return null;
}
const range = (t) => /tuan/.test(t) ? [weekStart(vnToday()), vnToday(), "tuần này"] : /thang truoc/.test(t) ? [monthStart(addDays(monthStart(vnToday()), -1)), addDays(monthStart(vnToday()), -1), "tháng trước"] : [monthStart(vnToday()), vnToday(), "tháng này"];
const ul = (arr) => arr.length ? "<ul style='margin:6px 0 0;padding-left:18px'>" + arr.map((x) => `<li>${x}</li>`).join("") + "</ul>" : "";
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

async function answer(raw) {
  const t = norm(raw), staff = findStaff(t), today = vnToday();
  if (/chua (bao cao|bc|nop bao cao)|thieu bao cao|quen bao cao/.test(t)) {
    if (staff) {
      const [from, to] = [monthStart(today), addDays(today, -1)];
      const [res, busy] = await Promise.all([q(sb.from("daily_results").select("report_date").eq("staff_id", staff.id).gte("report_date", from).lte("report_date", to)), q(sb.from("busy").select("busy_date,type").eq("staff_id", staff.id).gte("busy_date", from).lte("busy_date", to))]);
      const done = new Set(res.map((r) => r.report_date)), off = new Set(busy.filter((b) => b.type === "OFF").map((b) => b.busy_date));
      const miss = []; for (let d = from; d <= to; d = addDays(d, 1)) if (!done.has(d) && !off.has(d)) miss.push(d);
      return `<b>${esc(staff.name)}</b> — tháng này (đến hôm qua) chưa báo cáo <b>${miss.length}</b> ngày${miss.length ? ":" : " ✅"}${ul(miss.map((d) => `${dow(d)} ${dmy(d)}`))}<div class="tiny muted" style="margin-top:6px">Đã bỏ qua ngày đăng ký OFF.</div>`;
    }
    const d = findDate(t);
    const [res, busy] = await Promise.all([q(sb.from("daily_results").select("staff_id").eq("report_date", d)), q(sb.from("busy").select("staff_id,type").eq("busy_date", d))]);
    const done = new Set(res.map((r) => r.staff_id)), off = new Map(busy.map((b) => [b.staff_id, b.type]));
    const miss = visibleStaff().filter((s) => !done.has(s.id));
    return `${dow(d)} ${dmy(d)}: <b>${visibleStaff().length - miss.length}/${visibleStaff().length}</b> đã báo cáo.${miss.length ? " Chưa báo cáo:" : " ✅ Đủ cả."}${ul(miss.map((s) => `${esc(s.name)}${off.get(s.id) === "OFF" ? ' <span class="pill mute">OFF</span>' : off.get(s.id) ? ' <span class="pill warn">Bận</span>' : ""}`))}`;
  }
  if (/(\boff\b|nghi|\bban\b|lich ban)/.test(t) && !/bao cao/.test(t)) {
    const week = /7 ngay|tuan/.test(t), d = findDate(t), from = week ? today : d, to = week ? addDays(today, 6) : d;
    const rows = await q(sb.from("busy").select("busy_date,staff_id,type,shifts").gte("busy_date", from).lte("busy_date", to).order("busy_date"));
    if (!rows.length) return `Không ai đăng ký bận/OFF ${week ? "7 ngày tới" : dmy(d)}.`;
    return `Lịch bận / OFF ${week ? "7 ngày tới" : dow(d) + " " + dmy(d)}:${ul(rows.map((r) => `${week ? dow(r.busy_date) + " " + dm(r.busy_date) + ": " : ""}<b>${esc(staffById(r.staff_id)?.name || r.staff_id)}</b> — ${r.type === "OFF" ? "OFF" : "Bận" + (r.shifts?.length ? " ca " + r.shifts.join(", ") : "")}`))}`;
  }
  if (/ve sinh/.test(t)) {
    const week = /7 ngay|tuan/.test(t), d = findDate(t);
    const rows = await q(sb.from("cleaning").select("clean_date,staff_id,photos").gte("clean_date", week ? today : d).lte("clean_date", week ? addDays(today, 6) : d).order("clean_date"));
    return rows.length ? `Lịch vệ sinh:${ul(rows.map((r) => `${dow(r.clean_date)} ${dm(r.clean_date)}: <b>${esc(staffById(r.staff_id)?.name || r.staff_id)}</b> ${r.photos.length >= 3 ? "✅ đã nộp ảnh" : r.clean_date < today ? "⚠️ chưa nộp ảnh" : ""}`))}` : `Chưa ai đăng ký vệ sinh ${week ? "7 ngày tới" : dmy(d)}.`;
  }
  if (/roadshow|\brs\b/.test(t)) {
    const week = /7 ngay|tuan/.test(t), d = findDate(t);
    const rows = await q(sb.from("roadshow").select("rs_date,rs_time,staff_id,photos,km").gte("rs_date", week ? today : d).lte("rs_date", week ? addDays(today, 6) : d).order("rs_date"));
    return rows.length ? `Lịch roadshow:${ul(rows.sort((a, b) => (a.rs_date + a.rs_time).localeCompare(b.rs_date + b.rs_time)).map((r) => `${dow(r.rs_date)} ${dm(r.rs_date)} ${r.rs_time}: <b>${esc(staffById(r.staff_id)?.name || r.staff_id)}</b> ${r.photos.length >= 3 ? `✅ ${fmt(r.km, 1)} km` : ""}`))}` : `Chưa có lịch roadshow ${week ? "7 ngày tới" : dmy(d)}.`;
  }
  if (/tiktok/.test(t)) {
    const start = String(setting("TIKTOK_START_DATE", today)).slice(0, 10);
    let due = addDays(today, -1); while (due >= start && ![2, 5].includes(new Date(due + "T00:00:00Z").getUTCDay())) due = addDays(due, -1);
    if (due < start) return "Chưa tới kỳ TikTok nào.";
    const rows = await q(sb.from("tiktok_submissions").select("staff_id,status").eq("due", due));
    const has = new Map(rows.map((r) => [r.staff_id, r.status])), miss = visibleStaff().filter((s) => !has.has(s.id));
    return `Kỳ TikTok gần nhất: <b>${dow(due)} ${dmy(due)}</b> — ${visibleStaff().length - miss.length}/${visibleStaff().length} đã nộp.${miss.length ? " Chưa nộp (đang bị trừ mỗi ngày):" : " ✅"}${ul(miss.map((s) => esc(s.name)))}`;
  }
  if (/(top|xep hang|bxh|nhieu sao|dan dau|cao nhat)/.test(t)) {
    const [from, to, lbl] = range(t);
    const rows = (await rpc("leaderboard", { p_from: from, p_to: to })).sort((a, b) => b.period_star - a.period_star).slice(0, 7);
    return `🏆 Top sao ${lbl} (${dm(from)}–${dm(to)}):${ul(rows.map((r, i) => `${i + 1}. <b>${esc(r.name)}</b>: ${sign(r.period_star)}⭐ (tổng ${fmt(r.total_star)}) · về số ${r.all_items ? Math.round(r.ok_items * 100 / r.all_items) : 0}%`))}`;
  }
  if (/(tre|muon)/.test(t) && !staff) {
    const [from, to, lbl] = range(t);
    const rows = await q(sb.from("daily_results").select("staff_id,report_date,star_change").eq("compensation", "PHAT_TRE").gte("report_date", from).lte("report_date", to));
    const by = new Map(); rows.forEach((r) => { const x = by.get(r.staff_id) || { n: 0, star: 0, d: [] }; x.n++; x.star += r.star_change; x.d.push(dm(r.report_date)); by.set(r.staff_id, x); });
    return by.size ? `Nộp trễ ${lbl}:${ul([...by.entries()].sort((a, b) => b[1].n - a[1].n).map(([id, x]) => `<b>${esc(staffById(id)?.name || id)}</b>: ${x.n} lần (${sign(x.star)}⭐) — ${x.d.join(", ")}`))}` : `✅ Không ai nộp trễ ${lbl}.`;
  }
  if (/(chuoi|nguy co)/.test(t) && !staff) {
    const rows = (await rpc("leaderboard", { p_from: today, p_to: today })).filter((r) => r.risk_streak > 0).sort((a, b) => b.risk_streak - a.risk_streak).slice(0, 10);
    return rows.length ? `🔥 Chuỗi chưa về dài nhất:${ul(rows.map((r) => `<b>${esc(r.name)}</b> — ${esc(r.risk_item)}: <b>${r.risk_streak}</b> ngày`))}` : "Không ai đang có chuỗi chưa về.";
  }
  if (/(mon|ty le ve so)/.test(t) && !staff) {
    const [from, to, lbl] = range(t);
    const rows = await q(sb.from("daily_results").select("item_name,status").in("status", ["Về số", "Chưa về"]).gte("report_date", from).lte("report_date", to).limit(20000));
    const by = new Map(); rows.forEach((r) => { const x = by.get(r.item_name) || { ok: 0, all: 0 }; x.all++; if (r.status === "Về số") x.ok++; by.set(r.item_name, x); });
    const list = [...by.entries()].map(([n, x]) => ({ n, ...x, p: Math.round(x.ok * 100 / x.all) })).sort((a, b) => a.p - b.p);
    return list.length ? `Tỉ lệ về số theo môn ${lbl} (thấp → cao):${ul(list.map((x) => `${esc(x.n)}: <b>${x.p}%</b> (${x.ok}/${x.all})`))}` : `Chưa có dữ liệu ${lbl}.`;
  }
  if (/(duyet|cho duyet)/.test(t)) {
    if (!isManager()) return "Chỉ quản lý xem được mục chờ duyệt.";
    return `Đang chờ duyệt: <b>${S.pending.proposals}</b> đề xuất bán thêm, <b>${S.pending.changes}</b> yêu cầu sửa báo cáo. Vào Quản lý → Duyệt để xử lý.`;
  }
  if (staff) return staffProfile(staff);
  if (aiOn && isManager()) return askAi(raw);
  return `Mình chưa hiểu câu này. Thử: <i>“ai chưa báo cáo hôm nay”</i>, <i>“chuỗi của ${esc(shortName(visibleStaff()[0]?.name || "Lan"))}”</i>, <i>“ai OFF ngày mai”</i>, <i>“top sao tuần này”</i>, <i>“môn nào yếu nhất”</i>.${isManager() ? "<br><span class='tiny muted'>Muốn hỏi tự do bằng AI: chủ quản cài khoá Gemini trong Quản lý → Cài đặt.</span>" : ""}`;
}

async function staffProfile(s) {
  const today = vnToday(), from = monthStart(today);
  const [form, res] = await Promise.all([rpc("report_form", { p_staff: s.id, p_date: addDays(today, 1) }), q(sb.from("daily_results").select("report_date,status,star_change,compensation").eq("staff_id", s.id).gte("report_date", from))]);
  const items = res.filter((r) => r.status === "Về số" || r.status === "Chưa về"), ok = items.filter((r) => r.status === "Về số").length;
  const days = new Set(res.map((r) => r.report_date)), last = [...days].sort().pop();
  const streaks = form.items.filter((i) => i.streak > 0).sort((a, b) => b.streak - a.streak);
  return `👤 <b>${esc(s.name)}</b> · ${esc(s.dept)} · mã ${esc(s.id)}
    ${ul([`Tổng sao: <b class="star">${fmt(form.total_star)}⭐</b> · tháng này ${sign(res.reduce((a, r) => a + r.star_change, 0))}⭐`,
      `Tháng này: ${days.size} ngày báo cáo · về số ${items.length ? Math.round(ok * 100 / items.length) : 0}% (${ok}/${items.length}) · tăng ca ${res.filter((r) => r.compensation === "TANG_CA").length} · trễ ${res.filter((r) => r.compensation === "PHAT_TRE").length}`,
      `Báo cáo gần nhất: ${last ? dow(last) + " " + dmy(last) : "chưa có"}`,
      streaks.length ? `Chuỗi chưa về: ${streaks.map((i) => `${esc(i.name)} <b class="${i.streak >= 3 ? "neg" : ""}">${i.streak}</b>`).join(" · ")}` : "Không có chuỗi chưa về ✅"])}`;
}

async function askAi(question) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(SUPABASE_URL + "/functions/v1/assistant", { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (session?.access_token || "") },
    body: JSON.stringify({ question, history: msgs.slice(-8, -2).map((m) => ({ role: m.role, text: m.text || "" })) }) });
  const j = await r.json().catch(() => ({ status: "error", message: "AI không phản hồi" }));
  if (j.status !== "success") throw new Error(j.message);
  return "🤖 " + esc(j.answer).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*] /gm, "• ");
}
