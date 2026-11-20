// CV → 📄 Biên bản (D10): quản lý úp biên bản vi phạm (ảnh lưu Google Drive qua Edge Function "tasks"),
// xem số lần vi phạm + thời gian theo tháng. Mỗi biên bản = 1 dòng vi phạm (trừ VIOLATION_POINTS điểm xếp hạng).
// Ai thấy gì do RLS bảng violations quyết định (can_see_staff): chủ quản tất cả, quản lý theo bộ phận, NV chỉ của mình.
import { $, $$, esc, fmt, toast, modal, vnToday, vnHM, dmy, ymOf, shiftMonth, monthLabel } from "../ui.js";
import { sb, rpc, callFn, isManager, visibleStaff, staffById, setting, errMsg } from "../store.js";
import { compress, fillPhotos } from "../photos.js";

let ym = ymOf(vnToday()), who = "", drive = null;
const MAX_PHOTOS = 10;
const name = (id) => staffById(id)?.name || id;
const when = (v) => `${dmy(v.v_date)}${v.v_time ? " lúc " + String(v.v_time).slice(0, 5) : ""}`;
const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Không đọc được ảnh")); r.readAsDataURL(blob); });
const err = (e) => toast(errMsg(e), 4500);

export async function violationDocs(body) {
  const mgr = isManager();
  // Mở từ hồ sơ 360° (Quản lý → Nhân sự): lọc sẵn theo NV đó, 1 lần
  try { const w = localStorage.getItem("thidua-v2-vio-who"); if (w) { who = w; ym = ymOf(vnToday()); localStorage.removeItem("thidua-v2-vio-who"); } } catch { /* bỏ qua */ }
  if (mgr && drive === null) drive = await rpc("private_setting_status").then((s) => !!s?.DRIVE).catch(() => false);
  const { data, error } = await sb.from("violations").select("*").gte("v_date", ym + "-01").lte("v_date", monthEnd(ym))
    .order("v_date", { ascending: false }).order("v_time", { ascending: false, nullsFirst: false }).order("id", { ascending: false });
  if (error) throw error;
  if (!body.isConnected) return;
  const pts = Number(setting("VIOLATION_POINTS", 2));
  // Gom theo NV: số lần, tổng điểm trừ, lần gần nhất (dữ liệu đã xếp mới nhất trước)
  const by = new Map();
  for (const v of data) {
    const g = by.get(v.staff_id) || { id: v.staff_id, n: 0, pts: 0, last: v, photos: 0 };
    g.n++; g.pts += Number(v.points) || 0; g.photos += (v.photos || []).length; by.set(v.staff_id, g);
  }
  const groups = [...by.values()].sort((a, b) => b.n - a.n || name(a.id).localeCompare(name(b.id), "vi"));
  if (who && !by.has(who)) who = "";
  const list = who ? data.filter((v) => v.staff_id === who) : data;
  body.innerHTML = `
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h2>📄 Biên bản vi phạm</h2>${mgr ? `<button class="btn small primary" id="vbAdd" type="button">+ Úp biên bản</button>` : ""}</div>
      <div class="cal-nav"><button class="btn small" data-vm="-1" type="button">‹</button><h3>${monthLabel(ym)}</h3><button class="btn small" data-vm="1" type="button">›</button><button class="btn small ghost" data-vm="0" type="button">Tháng này</button></div>
      <p class="small muted" style="margin:6px 0 10px">Mỗi biên bản = 1 lần vi phạm, trừ <b>${fmt(pts, 1)} điểm</b> xếp hạng. Ảnh biên bản lưu trên Google Drive.
        ${mgr ? "Bạn thấy biên bản của nhân viên trong bộ phận mình phụ trách." : "Bạn chỉ thấy biên bản của chính mình."}</p>
      ${mgr && !drive ? `<div class="banner warn" style="margin-bottom:10px"><div><b>Chưa nối Google Drive</b>Vẫn ghi biên bản được nhưng chưa kèm ảnh. Chủ quản nối Drive (DRIVE_UPLOAD_URL) để lưu ảnh.</div></div>` : ""}
      <div class="tbl-wrap"><table class="nosort"><thead><tr><th>Nhân viên</th><th class="num">Số lần</th><th class="num">Điểm trừ</th><th>Lần gần nhất</th></tr></thead><tbody id="vbSum">
        ${groups.length ? groups.map((g) => `<tr data-who="${esc(g.id)}" class="vb-pick${who === g.id ? " sel" : ""}" title="Bấm để xem biên bản của người này">
          <td><b>${esc(name(g.id))}</b>${g.photos ? ` <span class="tiny muted">📷 ${g.photos}</span>` : ""}</td><td class="num"><span class="pill bad">${g.n}</span></td><td class="num neg">−${fmt(g.pts, 1)}</td>
          <td class="small">${esc(when(g.last))}<div class="tiny muted">${esc(g.last.type)}</div></td></tr>`).join("")
          : `<tr><td colspan="4" class="muted">Không có vi phạm trong ${monthLabel(ym).toLowerCase()} 🎉</td></tr>`}
      </tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>${who ? `Biên bản của ${esc(name(who))}` : "Tất cả biên bản"} (${list.length})</h3>${who ? `<button class="btn small ghost" id="vbAll" type="button">Xem tất cả</button>` : ""}</div>
      ${list.length ? `<div class="vb-list">${list.map((v) => `<div class="vb-item">
        <div class="vb-h"><b>${esc(name(v.staff_id))}</b><span class="pill bad">−${fmt(v.points, 1)} điểm</span><span class="grow"></span><span class="small"><b>🕒 ${esc(when(v))}</b></span></div>
        <div><b>${esc(v.type)}</b>${v.note ? `<span class="muted">: ${esc(v.note)}</span>` : ""}</div>
        ${(v.photos || []).length ? `<div class="photos" data-vph="${v.id}"></div>` : `<div class="tiny muted">Không kèm ảnh biên bản</div>`}
        <div class="vb-f"><span class="tiny muted">Lập bởi ${esc(v.created_by || "?")} · ${new Date(v.created_at).toLocaleString("vi-VN")}</span>${mgr ? `<button class="btn small ghost danger" data-vdel="${v.id}" type="button">🗑️ Xoá</button>` : ""}</div>
      </div>`).join("")}</div>` : `<div class="empty">Chưa có biên bản nào.</div>`}</div>`;
  list.forEach((v) => { const el = body.querySelector(`[data-vph="${v.id}"]`); if (el) fillPhotos(el, v.photos); });

  $$("[data-vm]", body).forEach((b) => b.onclick = () => { ym = b.dataset.vm === "0" ? ymOf(vnToday()) : shiftMonth(ym, Number(b.dataset.vm)); who = ""; violationDocs(body).catch(err); });
  $("#vbSum").onclick = (e) => { const tr = e.target.closest("[data-who]"); if (!tr) return; who = who === tr.dataset.who ? "" : tr.dataset.who; violationDocs(body).catch(err); };
  $("#vbAll")?.addEventListener("click", () => { who = ""; violationDocs(body).catch(err); });
  $("#vbAdd")?.addEventListener("click", () => addDoc(body));
  body.onclick = async (e) => {
    const d = e.target.closest("[data-vdel]"); if (!d) return;
    const v = await modal(`<h3>Xoá biên bản?</h3><p class="small muted">Điểm trừ của lần vi phạm này sẽ được trả lại; ảnh trên Drive chuyển vào thùng rác.</p>
      <form><label>Lý do xoá<input name="r" required minlength="3"></label></form><div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn danger" data-v="submit">Xoá</button></div>`);
    if (!v) return;
    try {
      const r = await rpc("delete_violation", { p_id: Number(d.dataset.vdel), p_reason: v.r });
      const ids = (r.photos || []).filter((x) => /^[\w-]{20,}$/.test(x));
      if (ids.length) callFn("tasks", { mode: "delete", ids }).catch(() => {});
      toast("Đã xoá biên bản"); violationDocs(body).catch(err);
    } catch (x) { err(x); }
  };
}

// Úp biên bản: chọn NV, ngày giờ, loại lỗi, ghi chú, chụp/chọn ảnh → tải ảnh lên Drive → ghi vi phạm
async function addDoc(body) {
  const types = Array.isArray(setting("VIOLATION_TYPES", [])) ? setting("VIOLATION_TYPES", []) : [];
  const staff = visibleStaff();
  if (!staff.length) return toast("Không có nhân viên nào trong phạm vi của bạn");
  const picked = [];   // ảnh đã nén sẵn (nén ngay lúc chọn để điện thoại không mất file tạm)
  const v = await modal(`<h3>📄 Úp biên bản vi phạm</h3>
    <form class="fields vb-form">
      <label style="grid-column:1/-1">Nhân viên<select name="s" required>${staff.map((s) => `<option value="${esc(s.id)}" ${s.id === who ? "selected" : ""}>${esc(s.name)}${s.dept ? ` · ${esc(s.dept)}` : ""}</option>`).join("")}</select></label>
      <label>Ngày vi phạm<input name="d" type="date" required value="${vnToday()}" max="${vnToday()}"></label>
      <label>Giờ<input name="t" type="time" value="${vnHM()}"></label>
      <label style="grid-column:1/-1">Loại lỗi<select name="ty" required>${types.map((t) => `<option>${esc(t)}</option>`).join("")}${types.includes("Khác") ? "" : "<option>Khác</option>"}</select></label>
      <label style="grid-column:1/-1">Ghi chú<textarea name="n" rows="2" placeholder="Mô tả ngắn nội dung biên bản"></textarea></label>
      <div style="grid-column:1/-1"><div class="small" style="margin-bottom:6px"><b>Ảnh biên bản</b> ${drive ? `<span class="muted">(bắt buộc ít nhất 1 ảnh, tối đa ${MAX_PHOTOS})</span>` : `<span class="muted">(chưa nối Drive: lưu không kèm ảnh)</span>`}</div>
        ${drive ? `<div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn small">📷 Chụp ảnh<input type="file" accept="image/*" capture="environment" id="vbCam" hidden></label>
          <label class="btn small">🖼️ Chọn ảnh<input type="file" accept="image/*" multiple id="vbLib" hidden></label></div>
          <div class="photos vb-prev" id="vbPrev" style="margin-top:8px"></div>
          <input class="vb-req" id="vbReq" required tabindex="-1" aria-hidden="true" autocomplete="off">` : ""}
      </div></form>
    <p class="small muted" id="vbMsg" style="margin:8px 0 0"></p>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">Lưu biên bản</button></div>`, {
    onOpen(box) {
      // Ô ẩn "vbReq" giữ số ảnh để form tự báo "Cần ít nhất 1 ảnh" mà không đóng hộp thoại (không mất dữ liệu đã nhập)
      const req = box.querySelector("#vbReq");
      const prev = () => {
        const el = box.querySelector("#vbPrev"); if (!el) return;
        el.innerHTML = picked.map((p, i) => `<span class="ph"><img src="${p.url}" alt="Ảnh ${i + 1}"><button type="button" class="vb-x" data-x="${i}" aria-label="Bỏ ảnh ${i + 1}">✕</button></span>`).join("");
        if (req) { req.value = picked.length ? String(picked.length) : ""; req.setCustomValidity(picked.length ? "" : "Cần ít nhất 1 ảnh biên bản"); }
      };
      prev();
      const add = async (inp) => {
        const files = [...(inp.files || [])]; inp.value = "";
        for (const f of files) {
          if (picked.length >= MAX_PHOTOS) { toast(`Tối đa ${MAX_PHOTOS} ảnh`); break; }
          try { const blob = await compress(f); picked.push({ blob, url: URL.createObjectURL(blob) }); prev(); }
          catch (x) { toast(errMsg(x)); }
        }
      };
      box.querySelector("#vbCam")?.addEventListener("change", (e) => add(e.target));
      box.querySelector("#vbLib")?.addEventListener("change", (e) => add(e.target));
      box.querySelector("#vbPrev")?.addEventListener("click", (e) => {
        const x = e.target.closest("[data-x]"); if (!x) return; e.stopPropagation();
        const [p] = picked.splice(Number(x.dataset.x), 1); if (p) URL.revokeObjectURL(p.url); prev();
      });
    },
  });
  const cleanup = () => picked.forEach((p) => URL.revokeObjectURL(p.url));
  if (!v) return cleanup();
  if (drive && !picked.length) { cleanup(); return toast("Cần ít nhất 1 ảnh biên bản"); }
  const ids = [];
  try {
    for (const [i, p] of picked.entries()) {
      toast(`Đang tải ảnh ${i + 1}/${picked.length} lên Drive…`, 8000);
      const r = await callFn("tasks", { mode: "upload", name: `bien-ban_${v.s}_${v.d}_${i + 1}.jpg`, mime: "image/jpeg", data: await b64(p.blob), sub: "Bien ban " + v.d.slice(0, 7) });
      ids.push(r.file.id);
    }
    const res = await rpc("add_violation", { p_staff: v.s, p_date: v.d, p_type: v.ty, p_note: v.n, p_time: v.t || null, p_photos: ids });
    toast(res.message || "Đã lưu biên bản");
    ym = v.d.slice(0, 7); who = v.s;
    if (body.isConnected) violationDocs(body).catch(err);
  } catch (x) {
    if (ids.length) callFn("tasks", { mode: "delete", ids }).catch(() => {});   // ghi lỗi thất bại → dọn ảnh đã tải
    err(x);
  } finally { cleanup(); }
}
