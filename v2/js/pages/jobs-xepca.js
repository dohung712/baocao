// D17 🤖 Xếp ca tự động (Giao việc → 🤖 Xếp ca, quản lý)
//   Ưu tiên: 1 OFF > 2 lịch bận (NV đăng ký ở CV → Lịch bận) > 3 rule QL (⚙️ Rule xếp ca, lưu XEPCA_CFG — sửa được bất cứ lúc nào)
//   Luồng: chọn siêu thị + tuần → 🤖 Xếp tự động → bấm ô để sửa tay → ✅ Duyệt = file .xlsx vào Drive "02 - Lịch ca làm việc" + lưu lịch ca
//   Sau duyệt: trợ lý Claude (máy chủ quản) nhập ca vào HRM "Phân ca ngày", xong thì đánh dấu 🏢 Đã nhập HRM.
import { $, $$, esc, toast, modal, confirmBox, vnToday, addDays, dm, dow, dmy, shortName, weekStart } from "../ui.js";
import { sb, S, rpc, callFn, setting, visibleStaff, errMsg, depts, loadSettings } from "../store.js";
import { solve, report, sheetAoa, importRows, slotHours, parsePat } from "../lib-xepca.js";

const err = (e) => toast(errMsg(e), 5000);
const X = { store: "", week: addDays(weekStart(vnToday()), 7), plan: null, grid: {}, rows: [], dirty: false, showCfg: false };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const range = (x) => { const s = [...(x || [])].sort((a, b) => a - b), g = []; for (const v of s) { const l = g[g.length - 1]; if (l && v === l[1] + 1) l[1] = v; else g.push([v, v]); } return g.map(([a, b]) => (a === b ? a : a + "–" + b)).join(","); };
const cfgNow = () => { const c = setting("XEPCA_CFG", null); return c && typeof c === "object" ? JSON.parse(JSON.stringify(c)) : { max_day_h: 9, min_off: 1, count_pos: ["All In One"], pairs: [], stores: [] }; };

let XLSX = null;
async function xlsxB64(aoa, merges) {
  XLSX ||= await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs");
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!merges"] = merges;
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

export async function xepTab(body, alive) {
  const cfg = cfgNow(), slots = setting("SHIFT_SLOTS", []), hours = slotHours(slots);
  const stores = cfg.stores || [];
  if (!stores.some((s) => s.code === X.store)) X.store = stores[0]?.code || "";
  const store = stores.find((s) => s.code === X.store);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(X.week, i));
  const staffAll = store ? visibleStaff().filter((s) => s.dept === store.dept) : [];
  const ids = staffAll.map((s) => s.id);

  const [pr, br, posr, wr] = ids.length ? await Promise.all([
    sb.from("shift_plans").select("*").eq("store", X.store).eq("week", X.week).maybeSingle(),
    sb.from("busy").select("busy_date,staff_id,type,shifts").in("staff_id", ids).gte("busy_date", days[0]).lte("busy_date", days[6]),
    sb.from("shifts").select("staff_id,d,pos").in("staff_id", ids).neq("pos", "").gte("d", addDays(X.week, -60)).order("d", { ascending: false }).limit(500),
    sb.from("shifts").select("staff_id,d,slots").in("staff_id", ids).gte("d", days[0]).lte("d", days[6]),
  ]) : [{}, {}, {}, {}];
  if (!alive()) return;
  const busy = br.data || [];
  // Bộ phận từng NV: chỉnh tay trong rule (cfg.pos) > lịch ca gần nhất
  const pos = {}; for (const r of posr.data || []) pos[r.staff_id] ||= r.pos;
  Object.assign(pos, cfg.pos || {});
  const counts = (id) => { const p = norm(pos[id]); return !p || (cfg.count_pos || []).some((k) => k && p.includes(norm(k))); };
  const team = staffAll.filter((s) => counts(s.id)), others = staffAll.filter((s) => !counts(s.id));
  const rowsNow = [...team, ...others].map((s) => ({ id: s.id, name: s.name, pos: pos[s.id] || "" }));

  // Bản nháp đã lưu > lịch ca đang có trong tool (tuần này) > trống
  if (!X.dirty || X.loaded !== X.store + X.week) {
    X.plan = pr.data || null; X.loaded = X.store + X.week; X.dirty = false;
    X.grid = {};
    if (X.plan) Object.assign(X.grid, X.plan.grid || {});
    else for (const r of wr.data || []) X.grid[r.staff_id + "|" + r.d] = r.slots || [];
  }
  X.rows = rowsNow;
  const rep = store ? report({ days, staff: team, grid: X.grid, cfg, store, slots, busy }) : null;
  const bmap = new Map(busy.map((b) => [b.staff_id + "|" + b.busy_date, b]));
  const pairOf = new Map(); for (const h of rep?.pairHits || []) { pairOf.set(h.a + "|" + h.d, h); pairOf.set(h.b + "|" + h.d, h); }
  const nm = (id) => shortName(staffAll.find((s) => s.id === id)?.name || id);
  const st = X.plan?.status === "approved" && !X.dirty ? "approved" : X.plan || X.dirty ? "draft" : "none";
  const hasGrid = Object.values(X.grid).some((g) => g?.length);

  body.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>🤖 Xếp ca tự động</h3>
      <button class="btn small" type="button" data-wk="-7">‹</button><b>Tuần ${dm(days[0])} – ${dm(days[6])}</b><button class="btn small" type="button" data-wk="7">›</button>
      <div class="chips">${stores.map((s) => `<button type="button" class="chip ${s.code === X.store ? "on" : ""}" data-store="${esc(s.code)}">${esc(s.code)} · ${esc(s.name || "")}</button>`).join("")}</div></div>
    <p class="small muted">Ưu tiên: <b>1 OFF</b> → <b>2 lịch bận</b> NV đăng ký (CV → Lịch bận) → <b>3 rule quản lý</b> (⚙️ bên dưới). Chỉ đếm người bộ phận <b>${esc((cfg.count_pos || []).join(", "))}</b> vào số người mỗi ca; mỗi ngày 1 khối ca liền ${esc(cfg.min_day_h ?? 4)}–${esc(cfg.max_day_h)}h, ít nhất ${esc(cfg.min_off)} ngày OFF / tuần, chia đều giờ. Bấm ô để sửa tay.</p>
    ${!store ? `<div class="banner warn"><div>Chưa cấu hình siêu thị — mở ⚙️ Rule xếp ca bên dưới.</div></div>` : !staffAll.length ? `<div class="banner warn"><div>Không có NV nào thuộc bộ phận <b>${esc(store.dept || "(trống)")}</b> — chọn đúng bộ phận cho siêu thị trong ⚙️ Rule xếp ca.</div></div>` : `
    <div class="row" style="margin-bottom:8px">
      <button class="btn primary" type="button" id="xpRun">${hasGrid ? "🔁 Xếp lại (lịch khác)" : "🤖 Xếp tự động"}</button>
      ${hasGrid ? `<button class="btn" type="button" id="xpApprove" ${st === "approved" ? "disabled" : ""}>✅ Duyệt & lưu vào Drive</button><button class="btn" type="button" id="xpDl">⬇️ Tải file</button><button class="btn" type="button" id="xpClear">🧹 Xoá ca NV All In One</button>` : ""}
      <span class="small">${st === "approved" ? `✅ Đã duyệt ${esc(dmy((X.plan.approved_at || "").slice(0, 10)))} · ${X.plan.file_url ? `<a href="${esc(X.plan.file_url)}" target="_blank" rel="noopener">file Drive</a>` : ""} · ${X.plan.hrm_at ? "🏢 Đã nhập HRM" : `🏢 Chưa nhập HRM — nhờ trợ lý Claude: <i>“nhập ca tuần ${dm(days[0])} siêu thị ${esc(X.store)} vào HRM”</i> <button class="btn small" type="button" id="xpHrm">🏢 Đánh dấu đã nhập HRM</button>`}` : st === "draft" ? `📝 Bản nháp${X.dirty ? " (đang lưu…)" : ""} — chưa duyệt` : ""}</span></div>
    ${rep && hasGrid ? `<div class="banner ${rep.short.length || rep.busyHits.length ? "warn" : "ok"}"><div>
      ${rep.busyHits.length ? `<b>⛔ ${rep.busyHits.length} chỗ trùng OFF / bận</b>: ${rep.busyHits.map((h) => `${dow(h.d)} ${esc(nm(h.id))}`).join(", ")}<br>` : ""}
      ${rep.short.length ? `<b>⚠️ Thiếu ${rep.missingHours} giờ-người</b> (${rep.short.length} ô đỏ dưới bảng) — không đủ NV cho rule; có thể tăng giờ tối đa / ngày, giảm ngày OFF tối thiểu hoặc giảm số người ca.` : "✅ Đủ người mọi ca."}
      ${rep.pairHits.length ? `<br>👥 ${rep.pairHits.length} ngày cặp “trái ca” vẫn làm chung: ${rep.pairHits.map((h) => `${dow(h.d)} ${esc(nm(h.a))} + ${esc(nm(h.b))} (ca ${h.slots.join(",")})`).join(", ")}` : ""}
      ${rep.longDays.length ? `<br>⏱️ Quá ${esc(cfg.max_day_h)}h/ngày: ${rep.longDays.map((x) => `${dow(x.d)} ${esc(nm(x.id))} ${x.h}h`).join(", ")}` : ""}
      ${rep.fewSlots.length ? `<br>⛔ Ngày làm ít hơn ${esc(cfg.min_slots ?? 2)} ca:${rep.fewSlots.map((x) => `${dow(x.d)} ${esc(nm(x.id))}`).join(", ")}` : ""}
      ${(cfg.prefer || []).length ? `<br>🧩 ${rep.nonPref.length ? `${rep.nonPref.length} ngày-người không theo khối ưu tiên ${esc((cfg.prefer || []).join(" / "))} (để đủ người) — chưa ưng thì bấm 🔁 Xếp lại` : `Mọi ngày đều theo khối ưu tiên ${esc((cfg.prefer || []).join(" / "))}`}` : ""}
      ${rep.shortDays.length ? `<br>⏳ Dưới ${esc(cfg.min_day_h ?? 4)}h/ngày: ${rep.shortDays.map((x) => `${dow(x.d)} ${esc(nm(x.id))} ${x.h}h`).join(", ")}` : ""}
      ${rep.noOff.length ? `<br>😴 Thiếu ngày OFF: ${rep.noOff.map((x) => esc(nm(x.id))).join(", ")}` : ""}
      ${rep.gaps.length ? `<br>✂️ Ca không liền: ${rep.gaps.map((x) => `${dow(x.d)} ${esc(nm(x.id))}`).join(", ")}` : ""}</div></div>` : ""}
    <div class="tbl-wrap"><table class="nosort jb-grid"><thead><tr><th>NV</th><th class="num">Giờ</th>${days.map((d) => `<th class="num">${dow(d)}<br>${dm(d)}</th>`).join("")}</tr></thead><tbody>
    ${X.rows.map((r, i) => { const counted = i < team.length; const tot = days.reduce((t, d) => t + (X.grid[r.id + "|" + d] || []).reduce((s, x) => s + hours[x - 1], 0), 0);
      return `${i === team.length && others.length ? `<tr><td colspan="9" class="tiny muted">Không đếm vào số người (QL / Trưởng ca / bộ phận khác) — vẫn ghi vào file để nhập HRM</td></tr>` : ""}
      <tr><td style="white-space:nowrap">${esc(shortName(r.name))}<div class="tiny muted">${esc((r.pos || "chưa rõ bộ phận").replace(/^BP\s*/i, "").replace(/\s*-\s*ĐMX$/i, ""))}</div></td><td class="num">${Math.round(tot * 10) / 10}</td>
      ${days.map((d) => { const g = X.grid[r.id + "|" + d] || [], b = bmap.get(r.id + "|" + d), bad = b && g.length && (b.type === "OFF" || !b.shifts?.length || g.some((x) => b.shifts.includes(x))), pr2 = counted && pairOf.get(r.id + "|" + d);
        return `<td class="num ${g.length ? "" : "c-off"} ${bad ? "c-bad" : ""}" data-cell="${esc(r.id)}|${d}" style="cursor:pointer" title="${b ? (b.type === "OFF" ? "Đăng ký OFF" : "Bận ca " + (b.shifts?.join(",") || "cả ngày")) : ""}">${g.length ? esc(range(g)) : "OFF"}${b ? `<div class="tiny">${b.type === "OFF" ? "🛌OFF" : "⏳" + (b.shifts?.length ? b.shifts.join(",") : "bận")}</div>` : ""}${pr2 ? " 👥" : ""}</td>`; }).join("")}</tr>`; }).join("")}
    </tbody><tfoot>${[1, 2, 3, 4, 5, 6].map((x) => `<tr><td class="tiny">Ca ${x} <span class="muted">${esc(slots[x - 1] || "")}</span></td><td></td>${days.map((d) => { const c = rep?.cover[d]?.[x - 1] || { need: 0, have: 0 };
        return `<td class="num tiny" style="${c.have < c.need ? "background:var(--bad-bg,#fde2e2);color:var(--bad,#b42318);font-weight:600" : c.have > c.need ? "color:var(--muted)" : ""}">${c.have}/${c.need}</td>`; }).join("")}</tr>`).join("")}</tfoot></table></div>
    <p class="tiny muted">Dòng cuối: số người All In One đã xếp / cần. 🛌 OFF · ⏳ bận ca · 👥 cặp trái ca đang trùng giờ · ô đỏ = trùng lịch bận.</p>`}
  </div>
  <div class="card"><div class="card-h"><h3>⚙️ Rule xếp ca</h3><button class="btn small" type="button" id="xpCfgT">${X.showCfg ? "Thu gọn" : "Mở"}</button></div>
    ${X.showCfg ? cfgForm(cfg, slots) : `<p class="small muted">Giờ ${esc(cfg.min_day_h ?? 4)}–${esc(cfg.max_day_h)}h/ngày · ≥ ${esc(cfg.min_slots ?? 2)} ca/ngày làm · ưu tiên ${esc(patTxt(cfg.prefer) || "—")} · OFF ≥ ${esc(cfg.min_off)} ngày/tuần · ${(cfg.pairs || []).length} cặp trái ca · ${stores.length} siêu thị. Bấm Mở để gõ rule bằng chữ (AI tự hiểu) hoặc sửa thông số.</p>${(cfg.rule_notes || []).length ? `<p class="small" style="margin-bottom:0"><b>📝 Rule đang dùng:</b></p>${ruleNotes(cfg)}` : ""}`}
  </div>`;

  const save = async () => {
    const r2 = report({ days, staff: team, grid: X.grid, cfg, store, slots, busy });
    const r = await rpc("xepca_save", { p_store: X.store, p_week: X.week, p_grid: X.grid, p_rows: X.rows,
      p_stats: { missing: r2.missingHours, short: r2.short.length, pairs: r2.pairHits.length, busy: r2.busyHits.length, per: r2.per.map((p) => [p.id, p.hours]) } });
    X.dirty = false; X.loaded = ""; return r;
  };
  const redraw = () => xepTab(body, alive);

  body.onclick = async (e) => {
    const w = e.target.closest("[data-wk]"); if (w) { X.week = addDays(X.week, Number(w.dataset.wk)); X.dirty = false; return redraw(); }
    const sc = e.target.closest("[data-store]"); if (sc) { X.store = sc.dataset.store; X.dirty = false; return redraw(); }
    if (e.target.closest("#xpHrm")) { try { const r = await rpc("xepca_hrm_done", { p_id: X.plan.id }); toast(r.message); X.loaded = ""; } catch (x) { err(x); } return redraw(); }
    if (e.target.closest("#xpCfgT")) { X.showCfg = !X.showCfg; return redraw(); }
    if (e.target.closest("#xpCfgSave")) return saveCfg(cfg, redraw);
    if (e.target.closest("#xpRuleAI")) {
      const b = e.target.closest("#xpRuleAI"), text = $("#xcText").value.trim();
      if (!text) return toast("Gõ rule trước đã");
      b.disabled = true; b.textContent = "🤖 AI đang đọc…";
      try { const r = await callFn("tasks", { mode: "xepca_rules", text }); X.preview = { cfg: r.cfg, unsupported: r.unsupported || [] }; if ($("#xpRulePrev")) $("#xpRulePrev").innerHTML = previewBox(X.preview, cfg); }
      catch (x) { err(x); }
      if ($("#xpRuleAI")) { b.disabled = false; b.textContent = "🤖 AI đọc rule"; }
      return;
    }
    if (e.target.closest("#xpRuleCancel")) { X.preview = null; $("#xpRulePrev").innerHTML = ""; return; }
    if (e.target.closest("#xpRuleApply") && X.preview) {
      try { const r = await rpc("xepca_cfg_save", { p_cfg: X.preview.cfg }); X.preview = null; await loadSettings(); toast(r.message + " — bấm 🤖 Xếp tự động để xếp theo rule mới", 4000); } catch (x) { err(x); }
      return redraw();
    }
    if (e.target.closest("#xpPairAdd")) { const c = readCfg(cfg); c.pairs.push(["", ""]); await rpc("xepca_cfg_save", { p_cfg: c }).catch(err); await loadSettings(); return redraw(); }
    const pd = e.target.closest("[data-pdel]"); if (pd) { const c = readCfg(cfg); c.pairs.splice(Number(pd.dataset.pdel), 1); await rpc("xepca_cfg_save", { p_cfg: c }).catch(err); await loadSettings(); return redraw(); }
    if (e.target.closest("#xpRun")) {
      if (X.plan?.status === "approved" && !(await confirmBox("Xếp lại tuần đã duyệt?", "Bản đã duyệt sẽ quay về nháp, phải duyệt lại (và nhập lại HRM).", "Xếp lại"))) return;
      const b = e.target.closest("#xpRun"); b.disabled = true; b.textContent = "Đang xếp…";
      await new Promise((r) => setTimeout(r, 30));
      const res = solve({ days, staff: team, busy, cfg, store, slots, seed: (Date.now() % 2147483647) || 1 });   // mỗi lần bấm 1 lịch khác (rule 24/11: chưa đạt thì bấm sắp lại)
      for (const s of team) for (const d of days) X.grid[s.id + "|" + d] = res.grid[s.id + "|" + d];
      X.dirty = true;
      try { await save(); toast(res.short.length ? `Đã xếp — còn thiếu ${res.missingHours} giờ-người (xem ô đỏ)` : "Đã xếp đủ người mọi ca", 4000); } catch (x) { err(x); }
      return redraw();
    }
    if (e.target.closest("#xpClear")) { if (!(await confirmBox("Xoá ca NV All In One tuần này?", "Chỉ xoá trong bản nháp, chưa đụng tới lịch ca đã lưu.", "Xoá", true))) return; for (const s of team) for (const d of days) X.grid[s.id + "|" + d] = []; X.dirty = true; try { await save(); } catch (x) { err(x); } return redraw(); }
    const cell = e.target.closest("[data-cell]");
    if (cell) {
      const [id, d] = cell.dataset.cell.split("|"), g = X.grid[id + "|" + d] || [], b = bmap.get(id + "|" + d);
      const v = await modal(`<h3>${esc(nm(id))} · ${dow(d)} ${dmy(d)}</h3>${b ? `<p class="small" style="color:var(--warn)">${b.type === "OFF" ? "🛌 NV đã đăng ký OFF ngày này" : "⏳ NV bận ca " + (b.shifts?.join(", ") || "(chưa ghi ca — coi như cả ngày)")}</p>` : ""}
        <form><div class="fields">${[1, 2, 3, 4, 5, 6].map((x) => `<label class="chk"><input type="checkbox" name="c${x}" ${g.includes(x) ? "checked" : ""}> Ca ${x} <span class="tiny muted">${esc(slots[x - 1] || "")}</span></label>`).join("")}</div></form>
        <div class="modal-actions"><button class="btn" data-v="off">OFF cả ngày</button><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu</button></div>`);
      if (!v) return;
      X.grid[id + "|" + d] = v === "off" ? [] : [1, 2, 3, 4, 5, 6].filter((x) => v["c" + x]);
      X.dirty = true; try { await save(); } catch (x) { err(x); } return redraw();
    }
    if (e.target.closest("#xpDl")) {
      const { aoa, merges } = sheetAoa({ days, rows: X.rows, grid: X.grid, slots });
      const b64 = await xlsxB64(aoa, merges), a = document.createElement("a");
      a.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + b64; a.download = fileName(days); document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    if (e.target.closest("#xpApprove")) {
      const r2 = report({ days, staff: team, grid: X.grid, cfg, store, slots, busy });
      if (r2.busyHits.length && !(await confirmBox("Còn xếp trùng OFF / bận", `${r2.busyHits.length} chỗ trùng lịch NV đã đăng ký (ưu tiên 1–2). Vẫn duyệt?`, "Vẫn duyệt", true))) return;
      if (!(await confirmBox(`Duyệt lịch ca ${X.store} tuần ${dm(days[0])}?`, `Lưu file <b>${esc(fileName(days))}</b> vào Drive “02 - Lịch ca làm việc”, cập nhật lịch ca trong tool (NV thấy ngay)${r2.short.length ? ` · ⚠️ còn thiếu ${r2.missingHours} giờ-người` : ""}.`, "Duyệt"))) return;
      const b = e.target.closest("#xpApprove"); b.disabled = true; b.textContent = "Đang lưu…";
      try {
        const saved = await save();
        const { aoa, merges } = sheetAoa({ days, rows: X.rows, grid: X.grid, slots });
        const up = await callFn("tasks", { mode: "shift_put", name: fileName(days), data: await xlsxB64(aoa, merges) });
        const im = await rpc("shift_import", { p_rows: importRows({ days, rows: X.rows, grid: X.grid, slots }), p_source: up.file.name, p_file: { id: up.file.id, updated: up.file.updated || "", unmatched: 0 } });
        await rpc("xepca_approve", { p_id: saved.id, p_file: { id: up.file.id, url: up.file.url } });
        toast("✅ " + im.message, 5000); await loadSettings();
      } catch (x) { err(x); }
      return redraw();
    }
  };
  function fileName(ds) { return `CA LAM VIEC ${X.store} ${ds[0].slice(8, 10)}-${ds[0].slice(5, 7)} den ${ds[6].slice(8, 10)}-${ds[6].slice(5, 7)}.xlsx`; }
}

// ---------- ⚙️ Rule xếp ca ----------
const DN = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const patTxt = (a) => (Array.isArray(a) ? a : []).join(", ");
function ruleNotes(cfg) {
  const n = Array.isArray(cfg.rule_notes) ? cfg.rule_notes : [];
  return n.length ? `<ul class="small" style="margin:4px 0 0 18px">${n.map((x) => `<li><b>${esc(x.rule)}</b> → ${esc(x.meaning)}</li>`).join("")}</ul>` : "";
}
function previewBox(p, cfg) {
  if (!p) return "";
  const keys = [["max_day_h", "Giờ tối đa / ngày"], ["min_day_h", "Giờ tối thiểu / ngày làm"], ["min_slots", "Số ca tối thiểu / ngày làm"], ["min_off", "Ngày OFF tối thiểu"], ["prefer", "Khối ưu tiên"], ["forbid", "Khối cấm"], ["count_pos", "Bộ phận được đếm"], ["pairs", "Cặp trái ca"]];
  const show = (v) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x.join(" ↔ ") : x)).join(", ") || "(không)" : v ?? "(mặc định)");
  const ch = keys.filter(([k]) => JSON.stringify(p.cfg[k] ?? null) !== JSON.stringify(cfg[k] ?? null)).map(([k, l]) => `<li>${esc(l)}: ${esc(show(cfg[k]))} → <b>${esc(show(p.cfg[k]))}</b></li>`);
  const needCh = (p.cfg.stores || []).some((s, i) => JSON.stringify(s.need) !== JSON.stringify(cfg.stores?.[i]?.need)) ? `<li>Số người cần mỗi ca: <b>có thay đổi</b> (xem bảng sau khi áp dụng)</li>` : "";
  return `<div class="banner ${p.unsupported.length ? "warn" : "ok"}" style="margin-top:8px"><div>
    <b>🤖 AI hiểu rule như sau:</b>${ruleNotes(p.cfg) || " (không có)"}
    <b>Thay đổi cấu hình:</b>${ch.length || needCh ? `<ul class="small" style="margin:4px 0 0 18px">${ch.join("")}${needCh}</ul>` : " không đổi gì."}
    ${p.unsupported.length ? `<b>⚠️ Chưa làm được / cần xem lại:</b><ul class="small" style="margin:4px 0 0 18px">${p.unsupported.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="row" style="margin-top:6px"><button class="btn primary small" type="button" id="xpRuleApply">✅ Áp dụng</button><button class="btn small" type="button" id="xpRuleCancel">Bỏ</button></div></div></div>`;
}
function cfgForm(cfg, slots) {
  const staff = visibleStaff(), opt = (v) => `<option value="">— chọn NV —</option>${staff.map((s) => `<option value="${esc(s.id)}" ${String(v) === s.id ? "selected" : ""}>${esc(s.name)} (${esc(s.id)})</option>`).join("")}`;
  return `<h4 style="margin:0 0 4px">📝 Rule bằng chữ</h4>
    <p class="small muted">Gõ rule bằng tiếng Việt, mỗi dòng 1 rule (VD: “ưu tiên sắp ca 123 / 456”, “không xếp 1 ngày chỉ 1 ca”, “T7 CN ca 5 cần 3 người”, “Thy và Nhân trái ca”). Bấm 🤖 AI đọc rule → xem AI hiểu đúng chưa → ✅ Áp dụng. Rule AI chưa làm được sẽ được liệt kê riêng.</p>
    <textarea id="xcText" rows="6" style="width:100%">${esc(cfg.text_rules || "")}</textarea>
    <div class="row" style="margin-top:6px"><button class="btn primary small" type="button" id="xpRuleAI">🤖 AI đọc rule</button></div>
    <div id="xpRulePrev">${previewBox(X.preview, cfg)}</div>
    <h4 style="margin:14px 0 4px">🔧 Thông số (AI điền, hoặc sửa tay)</h4>
    <div class="fields">
      <label>Giờ tối đa / ngày<input id="xcMax" type="number" min="1" max="15" step="0.5" value="${esc(cfg.max_day_h)}"></label>
      <label>Giờ tối thiểu / ngày làm<input id="xcMin" type="number" min="0" max="15" step="0.5" value="${esc(cfg.min_day_h ?? 4)}"></label>
      <label>Số ca tối thiểu / ngày làm<input id="xcSlots" type="number" min="1" max="6" value="${esc(cfg.min_slots ?? 2)}"></label>
      <label>Khối ca ưu tiên (VD 1-3, 4-6)<input id="xcPref" value="${esc(patTxt(cfg.prefer))}"></label>
      <label>Khối ca cấm (VD 1-2)<input id="xcForbid" value="${esc(patTxt(cfg.forbid))}"></label>
      <label>Ngày OFF tối thiểu / tuần<input id="xcOff" type="number" min="0" max="6" value="${esc(cfg.min_off)}"></label>
      <label>Bộ phận được đếm số người (cách nhau dấu phẩy)<input id="xcPos" value="${esc((cfg.count_pos || []).join(", "))}"></label></div>
    <h4 style="margin:12px 0 4px">👥 Cặp “trái ca” (không làm chung giờ nếu có thể)</h4>
    ${(cfg.pairs || []).map((p, i) => `<div class="row xc-pair" style="margin-bottom:4px"><select class="xpA">${opt(p[0])}</select> ↔ <select class="xpB">${opt(p[1])}</select><button class="btn small" type="button" data-pdel="${i}">✕</button></div>`).join("")}
    <button class="btn small" type="button" id="xpPairAdd">＋ Thêm cặp</button>
    ${(cfg.stores || []).map((s, k) => `<h4 style="margin:14px 0 4px">🏬 ${esc(s.code)}</h4><div class="fields xc-store" data-k="${k}">
        <label>Tên<input class="xsName" value="${esc(s.name || "")}"></label>
        <label>Bộ phận NV trong tool<select class="xsDept">${["", ...depts()].map((d) => `<option ${d === s.dept ? "selected" : ""} value="${esc(d)}">${esc(d || "— chọn —")}</option>`).join("")}</select></label></div>
      <div class="tbl-wrap"><table class="nosort xc-need" data-k="${k}"><thead><tr><th>Số người</th>${[1, 2, 3, 4, 5, 6].map((x) => `<th class="num">Ca ${x}<div class="tiny muted">${esc(slots[x - 1] || "")}</div></th>`).join("")}</tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<tr><td>${DN[d]}</td>${[0, 1, 2, 3, 4, 5].map((x) => `<td><input class="xn" data-d="${d}" data-x="${x}" type="number" min="0" max="20" style="width:52px" value="${esc(s.need?.[d]?.[x] ?? 0)}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("")}
    <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="xpCfgSave">💾 Lưu rule</button></div>`;
}
function readCfg(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  if (!$("#xcMax")) return c;
  c.max_day_h = Number($("#xcMax").value) || 9; c.min_day_h = Math.max(0, Number($("#xcMin").value) || 0);
  c.min_slots = Math.max(1, Math.min(6, Number($("#xcSlots").value) || 1));
  const pats = (s) => s.split(/[,;\s]+/).map((x) => parsePat(x)).filter(Boolean).map((p) => `${p[0]}-${p[p.length - 1]}`);
  c.prefer = pats($("#xcPref").value); c.forbid = pats($("#xcForbid").value);
  c.text_rules = $("#xcText").value;
  c.min_off = Number($("#xcOff").value) || 0;
  c.count_pos = $("#xcPos").value.split(",").map((x) => x.trim()).filter(Boolean);
  c.pairs = $$(".xc-pair").map((r) => [r.querySelector(".xpA").value, r.querySelector(".xpB").value]);
  for (const box of $$(".xc-store")) { const s = c.stores[Number(box.dataset.k)]; s.name = box.querySelector(".xsName").value.trim(); s.dept = box.querySelector(".xsDept").value; }
  for (const t of $$(".xc-need")) { const s = c.stores[Number(t.dataset.k)]; s.need = {}; for (const i of t.querySelectorAll(".xn")) { (s.need[i.dataset.d] ||= [0, 0, 0, 0, 0, 0])[Number(i.dataset.x)] = Math.max(0, Number(i.value) || 0); } }
  return c;
}
async function saveCfg(cfg, redraw) {
  const c = readCfg(cfg); c.pairs = c.pairs.filter(([a, b]) => a && b && a !== b);
  try { const r = await rpc("xepca_cfg_save", { p_cfg: c }); await loadSettings(); toast(r.message); redraw(); } catch (x) { err(x); }
}
