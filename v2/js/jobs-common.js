// D12 Bảng việc — dùng chung cho trang Hôm nay (NV) và Giao việc (QL):
// đọc giờ VN, trạng thái việc, thẻ việc, hộp nộp việc (chụp / chọn ảnh → nén → Google Drive → job_submit), hộp chi tiết cho QL.
import { $, $$, esc, toast, modal, confirmBox, dm, dow, vnToday, addDays, shortName } from "./ui.js";
import { sb, S, rpc, callFn, errMsg, staffById, isManager } from "./store.js";
import { compress } from "./photos.js";

const fmtVN = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function vnAt(iso) { const p = Object.fromEntries(fmtVN.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` }; }
export const whenTxt = (iso, today = vnToday()) => { const p = vnAt(iso); return p.date === today ? p.hm : `${p.hm} ${dow(p.date)} ${dm(p.date)}`; };
export const minsTxt = (n) => n >= 1440 ? `${Math.floor(n / 1440)} ngày${Math.floor((n % 1440) / 60) ? " " + Math.floor((n % 1440) / 60) + " giờ" : ""}` : n >= 60 ? `${Math.floor(n / 60)} giờ${n % 60 ? " " + (n % 60) + " phút" : ""}` : `${n} phút`;
export const nPhotos = (j) => (Array.isArray(j.photos) ? j.photos.length : 0);
export const thumb = (f, w = 400) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w${w}`;

// Trạng thái hiển thị: done · late (nộp trễ) · missed · over (quá hạn chưa nộp) · soon (≤ 2 giờ) · todo
export function stateOf(j, now = Date.now()) {
  if (j.status === "done") return Number(j.late_min) > 0 ? "late" : "done";
  if (j.status === "missed") return "missed";
  const t = Date.parse(j.due_at);
  return t < now ? "over" : t - now <= 2 * 3600e3 ? "soon" : "todo";
}
export const STATE = {
  done: ["✅", "Đã nộp", "ok"], late: ["⏰", "Nộp trễ", "warn"], missed: ["❌", "Bỏ lỡ", "bad"], over: ["⚠️", "Quá hạn", "bad"], soon: ["⏳", "Sắp tới hạn", "warn"], todo: ["⏳", "Chưa nộp", "mute"],
};

let typesP = null;
export function loadTypes(force = false) {
  if (force) typesP = null;
  typesP ||= Promise.all([
    sb.from("job_types").select("*").order("sort").order("id"),
    sb.from("job_templates").select("id,rule"),   // D13c: ai phải làm, chỉ nhận ảnh chụp màn hình…
  ]).then(([{ data, error }, tp]) => {
    if (error) throw error;
    S.jobTypes = data || [];
    S.jobTpl = Object.fromEntries((tp.data || []).map((t) => [t.id, t.rule || {}]));
    return S.jobTypes;
  });
  return typesP;
}

// D13c: ai phải làm việc này (theo cột Ghi chú của trang tính việc lặp lại)
const SCOPE = {
  group: ["👥", "Việc của ca", "1 người làm xong là xong cho cả ca"],
  shift_each: ["👤", "Việc trong ca", "ai có ca cũng phải tự làm"],
  always: ["📌", "Việc mặc định", "có ca hay không có ca đều phải làm"],
  cleaning: ["🧹", "Theo lịch vệ sinh", "người đã đăng ký làm"],
  own: ["👤", "Việc giao riêng", "bạn tự làm"],
};
function scopeOf(j) {
  const r = j.template_id ? S.jobTpl?.[j.template_id] : null;
  if (r) return r.scope || (r.who === "cleaning" ? "cleaning" : r.kind === "group" ? "group" : r.need_shift ? "shift_each" : "always");
  return j.group_staff?.length > 1 ? "group" : "own";
}
const isShotJob = (j) => !!(j.template_id && S.jobTpl?.[j.template_id]?.screenshot);
const scopeHtml = (j) => { const [ic, t, d] = SCOPE[scopeOf(j)]; return `<div class="jb-scope">${ic} <b>${t}</b> — ${d}</div>`; };
// Chi tiết việc: dòng "📷 Báo cáo: …" chữ đỏ đậm ở trên; ghi chú (📝 …, Đủ n ảnh) chữ nhỏ ở cuối
function splitDetail(detail) {
  const lines = String(detail || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const isReq = (l) => /^📷\s*Báo cáo:/i.test(l), isNote = (l) => /^📝/.test(l) || /^Đủ \d+ ảnh/i.test(l);
  let req = lines.filter(isReq).map((l) => l.replace(/^📷\s*Báo cáo:\s*/i, ""));
  if (!req.length) req = lines.filter((l) => !isNote(l));   // việc giao tay: nội dung việc = phần báo cáo
  const notes = lines.filter((l) => isNote(l) || (lines.some(isReq) && !isReq(l)));
  return {
    req: req.length ? `<div class="jb-req-red">📷 Báo cáo: ${esc(req.join(" "))}</div>` : "",
    notes: notes.length ? `<div class="jb-note">${notes.map((l) => esc(l.replace(/^📝\s*/, "📝 Ghi chú: "))).join("<br>")}</div>` : "",
  };
}// Ảnh chụp màn hình? — ảnh từ camera có thông số chụp (tốc độ, khẩu độ, ISO…) trong EXIF hoặc khổ 4:3; màn hình điện thoại / máy tính dài ≥ 1,55 lần
async function looksLikeScreenshot(file) {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) === 0xffd8) {   // JPEG: tìm khối EXIF, xem có thông số máy ảnh không
      let p = 2;
      while (p + 4 < buf.byteLength) {
        const mk = buf.getUint16(p), len = buf.getUint16(p + 2);
        if (mk === 0xffe1 && buf.getUint32(p + 4) === 0x45786966) {   // "Exif"
          const t = p + 10, le = buf.getUint16(t) === 0x4949, u16 = (o) => buf.getUint16(t + o, le), u32 = (o) => buf.getUint32(t + o, le);
          const tags = (ifd) => { const n = u16(ifd), out = {}; for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (t + e + 12 > buf.byteLength) break; out[u16(e)] = u32(e + 8); } return out; };
          const ifd0 = tags(u32(4));
          if (ifd0[0x8769]) { const ex = tags(ifd0[0x8769]); if (ex[0x829a] || ex[0x829d] || ex[0x8827] || ex[0x920a]) return { ok: false, why: "ảnh chụp bằng camera" }; }
          break;
        }
        if ((mk & 0xff00) !== 0xff00 || mk === 0xffda) break;
        p += 2 + len;
      }
    }
    const bmp = await createImageBitmap(file);
    const ratio = Math.max(bmp.width, bmp.height) / Math.min(bmp.width, bmp.height); bmp.close?.();
    if (ratio < 1.55) return { ok: false, why: "khổ ảnh không giống màn hình" };
    return { ok: true };
  } catch { return { ok: true }; }   // không đọc được thì không chặn
}
export const typeOf = (id) => (S.jobTypes || []).find((t) => t.id === id);
export const typeLabel = (id) => { const t = typeOf(id); return t ? `${t.icon} ${t.name}` : "📌 Việc khác"; };

const proofTxt = (j) => j.links_min > 0 ? `🔗 ≥ ${j.links_min} link${j.photo_min && j.proof !== "none" ? ` + ${j.photo_min} ảnh` : ""}` : j.proof === "none" ? "bấm hoàn thành" : j.proof === "check" ? `☑️ ${j.checklist.length} mục${j.photo_min ? ` + ${j.photo_min} ảnh` : ""}` : `📷 ${j.photo_min}${j.photo_max > j.photo_min ? "–" + j.photo_max : ""} ảnh`;
// D13 việc của cả ca: 1 người nộp là xong cho cả ca
const byOther = (j) => j.status === "done" && j.done_staff && j.done_staff !== j.staff_id;
// thẻ việc: ai phải làm (ngắn) + việc chỉ nhận ảnh chụp màn hình
const groupTxt = (j) => [{ group: "👥 1 người làm cho cả ca", shift_each: "👤 ai có ca cũng làm", always: "📌 ai cũng phải làm", cleaning: "🧹 theo lịch VS", own: "" }[scopeOf(j)], isShotJob(j) ? "📱 ảnh chụp màn hình" : ""].filter(Boolean).join(" · ");

// Thẻ việc (danh sách của NV)
export function jobCard(j, { who = false, today = vnToday() } = {}) {
  const st = stateOf(j), [ic, lb, cls] = STATE[st];
  const n = nPhotos(j), t = typeOf(j.type_id);
  const extra = st === "late" ? `nộp trễ ${minsTxt(j.late_min)}${j.penalty ? ` · −${j.penalty}⭐` : ""}`
    : st === "missed" ? `bỏ lỡ${j.penalty ? ` · −${j.penalty}⭐` : ""}`
    : st === "over" ? `trễ ${minsTxt(Math.floor((Date.now() - Date.parse(j.due_at)) / 60000))}${j.pen_late ? ` · nộp ngay (trễ −${j.pen_late}⭐)` : ""}`
    : st === "soon" ? `còn ${minsTxt(Math.max(1, Math.floor((Date.parse(j.due_at) - Date.now()) / 60000)))}` : "";
  return `<button type="button" class="jb-card st-${st}" data-job="${j.id}">
    <span class="jb-ic">${t?.icon || "📌"}</span>
    <span class="jb-main"><b>${esc(j.title)}</b>
      <span class="jb-meta">${who ? esc(shortName(staffById(j.staff_id)?.name || j.staff_id)) + " · " : ""}${j.start_at && Date.parse(j.start_at) > Date.now() ? `từ ${whenTxt(j.start_at, today)} · ` : ""}hạn ${whenTxt(j.due_at, today)} · ${byOther(j) ? `✅ ${esc(shortName(staffById(j.done_staff)?.name || j.done_staff))} đã nộp cho cả ca` : j.status === "done" ? (j.excused ? `🙏 ${esc(j.note || "Được miễn")}` : j.links?.length ? `🔗 ${j.links.length} link` : `📷 ${n} ảnh`) : proofTxt(j)}${groupTxt(j) && j.status !== "done" ? ` · ${groupTxt(j)}` : ""}${extra ? ` · <span class="jb-x">${extra}</span>` : ""}</span></span>
    <span class="pill ${cls}">${ic} ${lb}</span></button>`;
}

const b64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(new Error("Không đọc được ảnh")); fr.readAsDataURL(blob); });

// Hộp nộp việc. Trả về true nếu đã nộp / cập nhật.
export async function openSubmit(j) {
  await loadTypes();
  const own = S.me?.staff_id === j.staff_id, mgr = isManager();
  if (!own && !mgr) { toast("Đây không phải việc của bạn"); return false; }
  const st = stateOf(j), [ic, lb, cls] = STATE[st];
  const done = j.status === "done", old = Array.isArray(j.photos) ? [...j.photos] : [];
  const fresh = [];   // ảnh mới chọn: Blob đã nén
  const shot = isShotJob(j), D = splitDetail(j.detail), linksOpt = !shot && j.proof !== "none";
  const html = `<h3>${typeOf(j.type_id)?.icon || "📌"} ${esc(j.title)}</h3>
    <p class="small muted" style="margin:-4px 0 8px">${esc(typeLabel(j.type_id))} · hạn <b>${whenTxt(j.due_at)}</b> · <span class="pill ${cls}">${ic} ${lb}</span>${!own ? ` · NV: <b>${esc(staffById(j.staff_id)?.name || j.staff_id)}</b>` : ""}</p>
    ${scopeHtml(j)}
    ${j.group_staff?.length > 1 ? `<p class="small" style="margin:2px 0 6px">Cả ca: <b>${j.group_staff.map((id) => esc(shortName(staffById(id)?.name || id))).join(", ")}</b></p>` : ""}
    ${D.req}
    ${shot ? `<div class="jb-shot">⚠️ Chỉ nhận <b>ẢNH CHỤP MÀN HÌNH</b> (vd màn hình LINE đã báo cáo) — không chụp bằng camera.</div>` : ""}
    ${j.start_at && Date.parse(j.start_at) > Date.now() ? `<p class="small muted" style="margin:0 0 6px">⏱️ Làm từ ${whenTxt(j.start_at)} đến trước ${whenTxt(j.due_at)}.</p>` : ""}
    ${byOther(j) ? `<div class="banner ok"><div>✅ <b>${esc(staffById(j.done_staff)?.name || j.done_staff)}</b> đã nộp cho cả ca${j.done_at ? ` lúc ${whenTxt(j.done_at)}` : ""}. Bạn không cần nộp nữa.</div></div>`
    : j.status === "missed" ? `<div class="banner bad"><div>Việc đã bỏ lỡ${j.penalty ? ` (−${j.penalty}⭐)` : ""}. Nhờ quản lý mở lại nếu cần nộp.</div></div>` : `
    ${j.links_min > 0 || j.links?.length ? `<label style="margin-top:8px;display:block">🔗 Link${j.links_min ? ` (ít nhất ${j.links_min}, mỗi dòng 1 link)` : ""}<textarea id="jbLinks" rows="3" placeholder="https://www.tiktok.com/@…/video/…">${esc((j.links || []).join("\n"))}</textarea></label>`
      : linksOpt ? `<details style="margin-top:8px"><summary class="linkish small">🔗 Cần bổ sung? Dán link (không bắt buộc)</summary><textarea id="jbLinks" rows="2" placeholder="https://… (mỗi dòng 1 link)"></textarea></details>` : ""}
    ${j.proof === "check" ? `<div class="jb-checks">${j.checklist.map((c, i) => `<label><input type="checkbox" data-ck="${i}" ${(j.checks || []).includes(i) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>` : ""}
    ${j.proof !== "none" || old.length ? `<div class="jb-photos" id="jbPh"></div>
      <div class="row" style="margin-top:8px">${shot ? "" : `<label class="btn">📷 Chụp ảnh<input type="file" accept="image/*" capture="environment" id="jbCam" hidden></label>`}
        <label class="btn ${shot ? "btn-shot" : ""}">🖼️ ${shot ? "Chọn ảnh chụp màn hình" : "Chọn ảnh"}<input type="file" accept="image/*" multiple id="jbPick" hidden></label>
        <span class="small muted">${j.proof === "none" ? "Ảnh không bắt buộc" : `Cần ít nhất ${j.photo_min} ảnh, tối đa ${j.photo_max}`}</span></div>` : ""}
    <label style="margin-top:10px;display:block">Ghi chú (không bắt buộc)<textarea id="jbNote" rows="2">${esc(j.note || "")}</textarea></label>
    ${!done && Date.parse(j.due_at) < Date.now() && j.pen_late ? `<p class="small" style="color:var(--bad)">⏰ Đã quá hạn: nộp bây giờ bị trừ ${j.pen_late}⭐.</p>` : ""}
    <p class="small muted" id="jbMsg" style="min-height:1.2em"></p>
    ${own && j.status === "todo" && !j.excused ? `<details class="jb-req" style="margin-top:6px"><summary class="linkish small">🙋 Không kịp / không làm được? Xin dời hạn hoặc xin miễn</summary>
      <div class="fields" style="margin-top:6px"><label>Loại<select id="rqType"><option value="delay">Xin dời hạn</option><option value="excuse">Xin miễn việc này</option></select></label>
      <label id="rqDueL">Hạn mới<input type="datetime-local" id="rqDue" value="${new Date(Math.max(Date.parse(j.due_at), Date.now()) + 7 * 3600e3 + 3600e3).toISOString().slice(0, 16)}"></label></div>
      <label>Lý do<input id="rqWhy" maxlength="300" placeholder="VD: đang đông khách, máy hỏng, không có ca…"></label>
      <div class="row" style="margin-top:6px"><button class="btn small" type="button" id="rqSend">📨 Gửi quản lý duyệt</button><span class="small muted" id="rqMsg"></span></div></details>` : ""}`}
    ${D.notes}
    <div class="modal-actions"><button class="btn" data-v="cancel">Đóng</button><button class="btn" data-v="ok" hidden id="jbClose">ok</button>
      ${j.status === "missed" || byOther(j) ? "" : `<button class="btn primary" type="button" id="jbSend">${done ? "💾 Cập nhật" : j.proof === "none" && !j.links_min ? "✅ Hoàn thành" : "📤 Nộp việc"}</button>`}</div>`;
  const v = await modal(html, {
    onOpen(body) {
      const ph = $("#jbPh", body), msg = (t) => { const m = $("#jbMsg", body); if (m) m.textContent = t; };
      const draw = () => {
        if (!ph) return;
        ph.innerHTML = old.map((f, i) => `<span class="jb-th"><a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${thumb(f)}" alt="Ảnh ${i + 1}" loading="lazy"></a><button type="button" data-rmo="${i}" title="Bỏ ảnh">✕</button></span>`).join("")
          + fresh.map((b, i) => `<span class="jb-th new"><img src="${b._url}" alt="Ảnh mới ${i + 1}"><button type="button" data-rmn="${i}" title="Bỏ ảnh">✕</button></span>`).join("")
          || `<span class="small muted">Chưa có ảnh</span>`;
      };
      const add = async (files) => {
        for (const f of [...files]) {
          if (old.length + fresh.length >= j.photo_max) { toast(`Tối đa ${j.photo_max} ảnh`); break; }
          if (shot) { const c = await looksLikeScreenshot(f); if (!c.ok) { toast(`⚠️ Ảnh "${f.name || "đã chọn"}" không phải ảnh chụp màn hình (${c.why}). Chụp màn hình rồi chọn lại.`, 6000); continue; } }
          try { const b = await compress(f); b._url = URL.createObjectURL(b); fresh.push(b); } catch { toast("Có ảnh không đọc được, chụp / chọn lại", 4000); }
        }
        draw();
      };
      $("#jbCam", body)?.addEventListener("change", (e) => { add(e.target.files); e.target.value = ""; });
      $("#jbPick", body)?.addEventListener("change", (e) => { add(e.target.files); e.target.value = ""; });
      ph?.addEventListener("click", (e) => {
        const o = e.target.closest("[data-rmo]"), n = e.target.closest("[data-rmn]");
        if (o) { old.splice(Number(o.dataset.rmo), 1); draw(); }
        if (n) { const [b] = fresh.splice(Number(n.dataset.rmn), 1); URL.revokeObjectURL(b._url); draw(); }
      });
      draw();
      $("#rqType", body)?.addEventListener("change", (e) => { $("#rqDueL", body).hidden = e.target.value !== "delay"; });
      $("#rqSend", body)?.addEventListener("click", async (e) => {
        const btn = e.currentTarget, ty = $("#rqType", body).value, why = $("#rqWhy", body).value.trim(), m2 = (x) => { $("#rqMsg", body).textContent = x; };
        if (why.length < 3) return m2("Ghi lý do giúp quản lý duyệt.");
        const dv = $("#rqDue", body).value, due = ty === "delay" && dv ? new Date(dv + ":00+07:00").toISOString() : null;
        if (ty === "delay" && !due) return m2("Chọn hạn mới.");
        btn.disabled = true;
        try { const r = await rpc("agent_request", { p_job: j.id, p_type: ty, p_reason: why, p_due: due }); m2("✅ " + r.message); toast(r.message, 4000); }
        catch (x) { m2(errMsg(x)); btn.disabled = false; }
      });
      $("#jbSend", body)?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const checks = $$("[data-ck]", body).filter((c) => c.checked).map((c) => Number(c.dataset.ck));
        if (j.proof === "check" && checks.length < j.checklist.length) return msg("Tick đủ các mục trong checklist.");
        if (j.proof !== "none" && old.length + fresh.length < j.photo_min) return msg(`Cần ít nhất ${j.photo_min} ảnh.`);
        const links = ($("#jbLinks", body)?.value || "").split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^https?:\/\/\S+$/i.test(x));
        if (j.links_min > 0 && links.length < j.links_min) return msg(`Cần ít nhất ${j.links_min} link (bắt đầu bằng https://).`);
        btn.disabled = true;
        try {
          const files = [...old];
          for (const [i, b] of fresh.entries()) {
            msg(`Đang tải ảnh ${i + 1}/${fresh.length} lên Google Drive…`);
            const r = await callFn("tasks", { mode: "job_upload", job_id: j.id, idx: old.length + i + 1, data: await b64(b) });
            files.push(r.file); fresh[i].uploaded = true;
          }
          msg("Đang lưu…");
          const res = await rpc("job_submit", { p_id: j.id, p_photos: files, p_checks: checks, p_note: $("#jbNote", body).value.trim(), p_links: links });
          toast(res.message || "Đã nộp", 4000);
          $("#jbClose", body).click();
        } catch (x) {
          // ảnh đã tải xong thì giữ lại, lần bấm sau không tải lại
          for (let i = fresh.length - 1; i >= 0; i--) if (fresh[i].uploaded) fresh.splice(i, 1);
          msg(errMsg(x)); btn.disabled = false;
        }
      });
    },
  });
  fresh.forEach((b) => URL.revokeObjectURL(b._url));
  return v === "ok";
}

// Hộp chi tiết cho QL: xem ảnh, nộp hộ, đổi hạn / người, mở lại, xoá, nhắc qua thông báo đẩy
export async function openManage(j, folders = {}) {
  await loadTypes();
  const st = stateOf(j), [ic, lb, cls] = STATE[st], s = staffById(j.staff_id), due = vnAt(j.due_at);
  const photos = Array.isArray(j.photos) ? j.photos : [];
  const html = `<h3>${typeOf(j.type_id)?.icon || "📌"} ${esc(j.title)}</h3>
    <p class="small muted" style="margin:-4px 0 8px">${esc(s?.name || j.staff_id)} · ${esc(typeLabel(j.type_id))} · <span class="pill ${cls}">${ic} ${lb}</span></p>
    ${scopeHtml(j)}${splitDetail(j.detail).req}${isShotJob(j) ? `<div class="jb-shot">⚠️ Chỉ nhận ẢNH CHỤP MÀN HÌNH</div>` : ""}
    <div class="small" style="display:grid;gap:4px;margin:8px 0">
      <span>⏰ Hạn: <b>${whenTxt(j.due_at)}</b>${j.done_at ? ` · nộp lúc <b>${whenTxt(j.done_at)}</b>${j.late_min ? ` (trễ ${minsTxt(j.late_min)})` : ""}` : ""}</span>
      <span>⭐ Trừ khi trễ: ${j.pen_late} · khi bỏ lỡ: ${j.pen_miss}${j.penalty ? ` · <b style="color:var(--bad)">đã trừ ${j.penalty}</b>` : ""}</span>
      ${j.note ? `<span>📝 ${esc(j.note)}</span>` : ""}
      ${folders[j.staff_id] ? `<span>📁 <a href="${esc(folders[j.staff_id])}" target="_blank" rel="noopener">Thư mục ảnh của ${esc(shortName(s?.name || ""))} trên Drive</a></span>` : ""}
    </div>
    ${photos.length ? `<div class="jb-photos">${photos.map((f, i) => `<span class="jb-th"><a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${thumb(f)}" alt="Ảnh ${i + 1}" loading="lazy"></a></span>`).join("")}</div>` : ""}
    ${j.links?.length ? `<div class="small" style="margin-top:6px">🔗 ${j.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.length > 40 ? l.slice(0, 39) + "…" : l)}</a>`).join("<br>")}</div>` : ""}
    ${splitDetail(j.detail).notes}
    <div id="mgPush" style="margin-top:10px"></div>
    ${j.status === "todo" ? `<details style="margin-top:10px"><summary class="linkish">✏️ Đổi hạn / người làm</summary>
      <div class="fields" style="margin-top:8px"><label>Ngày hạn<input type="date" id="mgD" value="${due.date}"></label><label>Giờ hạn<input type="time" id="mgH" value="${due.hm}"></label>
      <label>Người làm<select id="mgS">${S.staff.filter((x) => !x.hidden).map((x) => `<option value="${esc(x.id)}" ${x.id === j.staff_id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label></div>
      <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="mgAll"> Dời giờ hạn cho cả lần giao này (mọi NV / mọi ngày chưa nộp)</label>
      <div class="row" style="margin-top:8px"><button class="btn small primary" type="button" id="mgSave">💾 Lưu thay đổi</button></div></details>` : ""}
    <div class="modal-actions wrap">
      <button class="btn danger" data-v="del">🗑️ Xoá</button>
      ${j.status !== "todo" ? `<button class="btn" data-v="reopen">↩️ Mở lại${j.penalty ? ` (hoàn ${j.penalty}⭐)` : ""}</button>` : `<button class="btn" data-v="nudge">🔔 Nhắc NV</button>`}
      <button class="btn" data-v="submit2">${j.status === "done" ? "📷 Sửa ảnh" : "📤 Nộp hộ"}</button>
      <button class="btn" data-v="cancel">Đóng</button><button data-v="saved" hidden id="mgDone">x</button></div>`;
  const v = await modal(html, {
    onOpen(body) {
      import("./push-track.js").then((m) => m.fillPushTrack($("#mgPush", body), j)).catch(() => {});
      $("#mgSave", body)?.addEventListener("click", async () => {
        const p = { due_date: $("#mgD", body).value, due_hm: $("#mgH", body).value };
        if ($("#mgS", body).value !== j.staff_id) p.staff_id = $("#mgS", body).value;
        try { const r = await rpc("job_update", { p_id: j.id, p, p_all: $("#mgAll", body).checked }); toast(r.message); $("#mgDone", body).click(); } catch (x) { toast(errMsg(x), 4500); }
      });
    },
  });
  try {
    if (v === "submit2") return openSubmit(j);
    if (v === "del") {
      const all = await modal(`<h3>Xoá việc “${esc(j.title)}”?</h3><p class="muted">Ảnh đã nộp vẫn giữ trên Google Drive. Sao đã trừ (nếu có) được hoàn lại.</p>
        <div class="modal-actions wrap"><button class="btn" data-v="cancel">Huỷ</button><button class="btn danger" data-v="one">Xoá việc này</button><button class="btn danger" data-v="all">Xoá cả lần giao (mọi NV / ngày)</button></div>`);
      if (!all) return false;
      const r = await rpc("job_delete", { p_id: j.id, p_all: all === "all" }); toast(r.message); return true;
    }
    if (v === "reopen") {
      const today = vnToday();
      const nd = Date.parse(j.due_at) < Date.now() ? { p_due_date: today, p_due_hm: "21:00" } : {};
      if (!(await confirmBox("Mở lại việc?", `NV sẽ thấy lại việc này để nộp${nd.p_due_date ? " (hạn mới 21:00 hôm nay)" : ""}.${j.penalty ? ` Hoàn lại ${j.penalty}⭐ đã trừ.` : ""}`, "Mở lại"))) return false;
      const r = await rpc("job_reopen", { p_id: j.id, ...nd }); toast(r.message); return true;
    }
    if (v === "nudge") {
      const r = await callFn("push", { mode: "send", ids: [j.staff_id], title: "🔔 Nhắc việc: " + j.title, body: `Hạn ${whenTxt(j.due_at)} · mở tool để nộp ảnh`, tag: "job-" + j.id, jobs: [j.id] });
      toast(r.message, 4000); return false;
    }
  } catch (x) { toast(errMsg(x), 4500); }
  return v === "saved";
}

// Mở đúng chức năng cũ của CV (tab ẩn trên menu NV vẫn mở được từ trang Hôm nay)
export function openCv(go, sub) {
  try { localStorage.setItem("thidua-v2-cv", sub); localStorage.setItem("thidua-v2-cv-from", "today"); } catch { /* bỏ qua */ }
  go("cv");
}
export { addDays };
