// Giao việc → 🔁 Lặp lại (D13): việc nhắc nhở / lặp lại từ trang tính. QL dán link trang tính, tool đọc 30 phút / lần (hoặc bấm đồng bộ),
// hiểu từng dòng (siêu thị, ngày, ca, giờ, giao cho ai, báo cáo bằng gì) và tự giao việc mỗi ngày theo lịch ca.
import { esc, toast, vnToday, dm } from "../ui.js";
import { sb, callFn, setting, errMsg, staffById, loadSettings } from "../store.js";
import { whenTxt } from "../jobs-common.js";

export async function rtTab(body, alive) {
  const sheet = setting("RT_SHEET_ID", ""), last = setting("RT_LAST", null), today = vnToday();
  const [tq, jq] = await Promise.all([
    sb.from("job_templates").select("*").order("active", { ascending: false }).order("row_no"),
    sb.from("jobs").select("id,template_id,staff_id,due_at,status,group_key,done_staff").not("template_id", "is", null)
      .gte("due_at", new Date(today + "T00:00:00+07:00").toISOString()).lt("due_at", new Date(Date.parse(today + "T00:00:00+07:00") + 864e5).toISOString()),
  ]);
  if (!alive()) return;
  const tpls = tq.data || [], jobs = jq.data || [];
  const todayOf = (id) => {
    const l = jobs.filter((j) => j.template_id === id), g = new Map();
    for (const j of l) { const k = j.group_key || "p" + j.id; if (!g.has(k)) g.set(k, []); g.get(k).push(j); }
    const units = [...g.values()], done = units.filter((u) => u.some((j) => j.status === "done")).length;
    return { units: units.length, done, people: new Set(l.map((j) => j.staff_id)).size, list: units };
  };
  body.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>🔁 Việc lặp lại từ trang tính</h3></div>
      <p class="small muted">Sửa việc ngay trong trang tính (cột: STT · Công Việc · Siêu Thị · Ngày · Time · Ghi Chú · Báo Cáo bằng gì ? · Nhóm Công Việc · Thông báo qua Telegram). Tool đọc lại 30 phút / lần và tự giao việc mỗi ngày theo <b>lịch ca</b>:
        "nhân sự trong ca" → <b>cả ca nhận, 1 người nộp là xong</b> · "All nhân sự" → từng người · "Theo lịch đăng ký" → người đăng ký vệ sinh.
        Nhắc bằng thông báo đẩy: vào ca · trước hạn 1 giờ · trước hạn 5 phút · quá hạn cứ 15 phút (không nhắc sau 22:15). Trễ chỉ ghi nhận, không trừ sao.</p>
      <div class="row"><input id="rtLink" placeholder="Dán link trang tính docs.google.com/spreadsheets/d/…" value="${sheet ? esc("https://docs.google.com/spreadsheets/d/" + sheet) : ""}" style="flex:1;min-width:220px">
        <button class="btn primary" id="rtSave" type="button">${sheet ? "🔄 Đồng bộ ngay" : "💾 Lưu & đọc"}</button>${sheet ? `<a class="btn ghost" href="https://docs.google.com/spreadsheets/d/${esc(sheet)}" target="_blank" rel="noopener">Mở trang tính ↗</a>` : ""}</div>
      <p class="small" id="rtMsg">${last ? `Lần đọc gần nhất: <b>${last.n}</b> việc${last.off ? ` · ${last.off} việc đã bỏ khỏi trang tính` : ""} · ${last.at ? whenTxt(last.at) : ""} · ${last.by === "tu-dong" ? "tự động" : esc(String(last.by || "").split("@")[0])}` : '<span class="muted">Chưa đọc trang tính.</span>'}</p></div>
    ${tpls.length ? `<div class="tbl-wrap"><table class="nosort"><thead><tr><th>#</th><th>Việc</th><th>Tool hiểu là</th><th>Báo cáo</th><th class="num">Hôm nay</th></tr></thead><tbody>
      ${tpls.map((t) => { const x = todayOf(t.id); return `<tr class="${t.active ? "" : "muted"}"><td class="muted">${esc(t.raw?.stt || t.row_no)}</td><td><b>${esc(t.title)}</b><div class="tiny muted">${esc(t.raw?.group || "")}${t.rule?.tg ? " · Telegram" : ""}${t.active ? "" : " · đã bỏ khỏi trang tính"}</div></td>
        <td class="small">${esc(t.rule?.text || "")}${!t.rule?.v && t.rule?.early_days ? " · nộp trước được" : ""}<div class="tiny muted">Trang tính dòng ${t.row_no}${t.rule?.v ? "" : `: ${esc([t.raw?.day, t.raw?.time].filter(Boolean).join(" · "))}`}</div></td>
        <td class="small">${esc(t.raw?.how || "")}</td>
        <td class="num">${t.active ? (x.units ? `<b>${x.done}/${x.units}</b><div class="tiny muted">${x.people} người</div>` : '<span class="muted tiny">không có ca</span>') : "—"}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="tiny muted">"Hôm nay" = số lần việc cần làm hôm nay (việc của cả ca tính 1 lần) đã xong / tổng. Không có ca = hôm nay chưa có lịch ca phù hợp (hoặc không phải ngày làm việc này).</p>` : ""}`;
  body.onclick = async (e) => {
    const b = e.target.closest("#rtSave"); if (!b) return;
    const link = body.querySelector("#rtLink").value.trim(); if (!link) return toast("Dán link trang tính trước");
    b.disabled = true; body.querySelector("#rtMsg").textContent = "Đang đọc trang tính & giao việc hôm nay…";
    try {
      const r = await callFn("tasks", link.includes(sheet || "§") && sheet ? { mode: "rt_sync" } : { mode: "rt_link", sheet: link });
      toast(`Đã đọc ${r.rows} việc${r.tab ? ` (tab ${r.tab})` : ""} · giao mới ${r.new} việc hôm nay${r.removed ? ` · bỏ ${r.removed}` : ""}${r.errors ? ` · ⚠️ ${r.errors} dòng lỗi chưa giao, xem cột Tool hiểu` : ""}`, 7000);
      await loadSettings(); rtTab(body, alive);
    } catch (x) { body.querySelector("#rtMsg").textContent = errMsg(x); b.disabled = false; }
  };
}
