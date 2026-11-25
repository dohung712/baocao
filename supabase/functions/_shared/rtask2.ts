// D24 Việc lặp lại mẫu mới: tab "Việc lặp lại (mẫu mới)" — mỗi cột 1 ý, phần lớn là ô chọn sẵn (xem tab "Cách điền").
// Cột: STT | Tên việc | Báo cáo gì | Siêu thị | Ai nhận | Mã NV | Lặp lại | Thứ / ngày | Ca áp dụng | Giờ hạn | Không có ca thì hạn |
//      Mở nộp | Giờ mở nộp | Quá hạn | Trừ sao khi trễ | Cách xác nhận | Chi tiết xác nhận | Giờ diễn ra | Nhóm việc | Báo Telegram |
//      Ngày không giao | Đang dùng | Tool hiểu (tool tự ghi)
// Không dùng AI: chữ trong ô chọn cố định → quy tắc. Dòng lỗi không giao việc, ghi lỗi vào cột "Tool hiểu".
const s = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const nv = (v: unknown) => s(v).replace(/Đ/g, "D").replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");
// "14:00" · "14h" · "14h30" · "8:5" → "HH:MM"
function hmOf(x: string): string | null {
  const m = nv(x).match(/^(\d{1,2})\s*(?:[:h]\s*(\d{1,2})?)?$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] || 0);
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
}
const hmList = (x: string) => s(x).split(/[,;]| va /i).map((t) => t.trim()).filter(Boolean);
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export const NEW_TAB = "Việc lặp lại (mẫu mới)";
export const isNewLayout = (values: string[][]) => values.slice(0, 3).some((r) => r.some((c) => nv(c) === "ai nhan") && r.some((c) => nv(c) === "mo nop"));

const DOW: Record<string, number> = { cn: 0, t2: 1, t3: 2, t4: 3, t5: 4, t6: 5, t7: 6 };
const DOWTXT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const STORE_TXT: Record<string, string> = { TGDD: "TGDĐ", TOPZONE: "Topzone", PG: "PG" };

export function parseRow2(c: string[], rowNo: number, col: Record<string, number>) {
  const g = (k: string) => s(c[col[k]] ?? "");
  const title = g("ten viec"), errs: string[] = [];
  const report = g("bao cao gi"), storeT = nv(g("sieu thi")), whoT = nv(g("ai nhan")), rep = nv(g("lap lai")), dayT = g("thu / ngay");
  // Siêu thị
  const stores = /tat ca/.test(storeT) ? ["TGDD", "TOPZONE", "PG"]
    : [/tgd/.test(storeT) && "TGDD", /topzone/.test(storeT) && "TOPZONE", /\bpg\b/.test(storeT) && "PG"].filter(Boolean) as string[];
  if (!stores.length) errs.push("chưa chọn Siêu thị");
  // Lặp lại
  let days: "daily" | number[] = "daily", dom: number[] | undefined, once: string | undefined;
  if (/theo thu/.test(rep)) {
    const t = nv(dayT).replace(/thu\s*([2-7])/g, "t$1").replace(/chu nhat/g, "cn");
    const ds = [...new Set([...t.matchAll(/\b(t[2-7]|cn)\b/g)].map((m) => DOW[m[1]]))].sort();
    if (ds.length) days = ds; else errs.push("Theo thứ nhưng chưa ghi thứ (vd T2, T5)");
  } else if (/ngay trong thang/.test(rep)) {
    const t = nv(dayT);
    dom = [...new Set([...t.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 31).concat(/cuoi thang/.test(t) ? [-1] : []))];
    if (!dom.length) errs.push("Ngày trong tháng nhưng chưa ghi ngày (vd 29 hoặc Cuối tháng)");
  } else if (/1 lan/.test(rep)) {
    const m = dayT.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) once = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`; else errs.push("1 lần nhưng chưa ghi ngày dd/mm/yyyy");
  } else if (rep && !/hang ngay/.test(rep)) errs.push("Lặp lại không hiểu");
  // Ca + giờ hạn
  const slots = [...new Set([...nv(g("ca ap dung")).matchAll(/ca\s*([1-6])/g)].map((m) => Number(m[1])))];
  const dueT = nv(g("gio han"));
  let times: { hm?: string; slot?: number; start?: string }[] = [], shift_end: { minus: number; fallback: string } | null = null;
  const se = dueT.match(/het ca\s*(?:-|tru|truoc)?\s*(\d+)\s*(?:p|phut)?/), ev = dueT.match(/moi\s*(\d+)\s*(gio|g|phut|p)\b\s*(\d{1,2}[:h]\d{2})\s*-\s*(\d{1,2}[:h]\d{2})/);
  if (se) { shift_end = { minus: Number(se[1]), fallback: hmOf(g("khong co ca thi han")) || "17:00" }; times = [{}]; }
  else if (/het ca/.test(dueT)) { shift_end = { minus: 0, fallback: hmOf(g("khong co ca thi han")) || "17:00" }; times = [{}]; }
  else if (ev) {
    const step = Number(ev[1]) * (/^g/.test(ev[2]) ? 60 : 1), a = hmOf(ev[3]), b = hmOf(ev[4]);
    if (!a || !b || step < 15) errs.push("Giờ hạn 'Mỗi … giờ' không hiểu (vd Mỗi 2 giờ 08:30-18:30)");
    else for (let m = toMin(a), prev = -1; m <= toMin(b) && times.length < 30; prev = m, m += step) times.push({ hm: fromMin(m), ...(prev >= 0 ? { start: fromMin(prev) } : {}) });
  } else {
    const bad: string[] = [];
    for (const x of hmList(g("gio han"))) { const h = hmOf(x); if (h) times.push({ hm: h }); else bad.push(x); }
    if (bad.length) errs.push(`Giờ hạn không hiểu: ${bad.join(", ")}`);
    if (!times.length && !bad.length) errs.push("chưa ghi Giờ hạn");
  }
  // Ai nhận
  let who = "at", kind = "group", need_shift = false, scope = "group", staff_ids: string[] | undefined;
  if (/1 nguoi lam la xong/.test(whoT)) { who = slots.length ? "slots" : "at"; kind = "group"; scope = "group"; }
  else if (/ai cung lam/.test(whoT)) { scope = "shift_each"; kind = "each"; if (slots.length) who = "slots"; else if (shift_end) { who = "all"; need_shift = true; } else who = "at"; }
  else if (/co ca hay khong/.test(whoT)) { who = "all"; kind = "each"; scope = "always"; }
  else if (/chia luot/.test(whoT)) { who = "rotate"; kind = "each"; scope = "rotate"; }
  else if (/ve sinh/.test(whoT)) { who = "cleaning"; kind = "each"; scope = "cleaning"; }
  else if (/nguoi cu the/.test(whoT)) {
    who = "staff"; kind = "each"; scope = "own"; staff_ids = [...new Set(g("ma nv").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
    if (!staff_ids.length) errs.push("Người cụ thể nhưng chưa ghi Mã NV");
  } else errs.push("chưa chọn Ai nhận");
  if (who === "slots") {
    if (shift_end) times = slots.map((sl) => ({ slot: sl }));
    else if (times.length === slots.length) times = slots.map((sl, i) => ({ slot: sl, hm: times[i].hm }));
    else if (times.length === 1) times = slots.map((sl) => ({ slot: sl, hm: times[0].hm }));
    else errs.push(`${slots.length} ca nhưng ${times.length} giờ hạn (mỗi ca 1 giờ, theo thứ tự)`);
    if (shift_end) { errs.push("'Hết ca' không dùng chung với Ca áp dụng — để trống Ca áp dụng"); }
  }
  if ((who === "at" || who === "rotate") && shift_end) errs.push("'Hết ca' chỉ dùng với Ai nhận = ai cũng làm / Mọi NV");
  // Mở nộp
  const openT = nv(g("mo nop"));
  let open: Record<string, number | string> | undefined, early_days = 0;
  const ob = openT.match(/truoc han\s*(\d+)\s*(phut|p|gio|g)/), od = openT.match(/tu\s*(\d+)\s*ngay truoc/);
  if (ob) open = { before: Number(ob[1]) * (/^g/.test(ob[2]) ? 60 : 1) };
  else if (od) { early_days = Math.min(7, Number(od[1])); open = { days: early_days }; }
  else if (/gio co dinh/.test(openT)) { const h = hmOf(g("gio mo nop")); if (h) open = { fixed: h }; else errs.push("Từ giờ cố định nhưng chưa ghi Giờ mở nộp"); }
  else if (openT && !/ngay khi giao/.test(openT)) errs.push("Mở nộp không hiểu");
  // Quá hạn
  const lateT = nv(g("qua han"));
  let late: Record<string, number | boolean> | undefined;
  const la = lateT.match(/khoa sau\s*(\d+)\s*(gio|g|phut|p)/);
  if (la) late = { after: Number(la[1]) * (/^g/.test(la[2]) ? 60 : 1) };
  else if (/khoa cuoi ngay/.test(lateT)) late = { eod: true };
  else if (/khoa ngay/.test(lateT)) late = { after: 0 };
  else if (lateT && !/van nop/.test(lateT)) errs.push("Quá hạn không hiểu");
  const pen_late = Math.max(0, Math.min(20, Number(g("tru sao khi tre").replace(",", ".")) || 0));
  // Cách xác nhận
  const pT = nv(g("cach xac nhan")), detT = g("chi tiet xac nhan"), detN = nv(detT);
  const nIn = (re: RegExp, d: number) => Number((detN.match(re) || [])[1] || d);
  let proof = "photo", photo_min = 1, links_min = 0, screenshot = false, info = false, checklist: string[] = [];
  const items = () => detT.split(/[;\n]/).map((x) => x.trim()).filter((x) => x && !/^\d+\s*(anh|ảnh|hinh|hình|link)$/i.test(nv(x)));
  if (/da nhan thong tin/.test(pT)) { proof = "none"; photo_min = 0; info = true; }
  else if (/bam hoan tat/.test(pT)) { proof = "none"; photo_min = 0; }
  else if (/^link/.test(pT)) { proof = "none"; photo_min = 0; links_min = nIn(/(\d+)\s*link/, 1); }
  else if (/tick/.test(pT)) {
    checklist = items(); proof = "check";
    photo_min = /anh/.test(pT) ? nIn(/(\d+)\s*(?:anh|hinh)/, 1) : 0; screenshot = /man hinh/.test(pT);
    if (!checklist.length) errs.push("Có tick nhưng chưa ghi các mục tick ở Chi tiết xác nhận (cách nhau dấu ;)");
  } else if (/anh/.test(pT)) { photo_min = nIn(/(\d+)\s*(?:anh|hinh)/, 1); screenshot = /man hinh/.test(pT); }
  else if (pT) errs.push("Cách xác nhận không hiểu"); else errs.push("chưa chọn Cách xác nhận");
  // Giờ diễn ra
  const evT = nv(g("gio dien ra"));
  let event: { hm: string; day: string } | undefined;
  if (evT) {
    const h = hmOf((evT.match(/\d{1,2}\s*[:h]\s*\d{0,2}/) || [""])[0].replace(/\s/g, ""));
    const dn = evT.match(/ngay\s*(\d{1,2})/);
    if (!h) errs.push("Giờ diễn ra không hiểu (vd 20:00 hoặc 20:00 cuối tháng)");
    else event = { hm: h, day: /cuoi thang/.test(evT) ? "last" : dn ? dn[1] : "same" };
  }
  // Ngày không giao
  const skip: string[] = [];
  for (const m of g("ngay khong giao").matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)) skip.push(m[3] ? `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}` : `${pad(Number(m[2]))}-${pad(Number(m[1]))}`);
  const tgT = nv(g("bao telegram")), tg = !!tgT && !/^khong/.test(tgT);
  const activeT = nv(g("dang dung")), active = !activeT || /^(true|co|x|1|✓)/.test(activeT);
  const photo_max = Math.max(6, photo_min);
  const rule: Record<string, unknown> = {
    stores, days, ...(dom ? { dom } : {}), ...(once ? { once } : {}), ...(skip.length ? { skip } : {}),
    who, kind, need_shift, ...(staff_ids ? { staff_ids } : {}), early_days, times, shift_end,
    ...(open ? { open } : {}), ...(late ? { late } : {}), pen_late, proof, photo_min, photo_max, links_min, checklist, info, screenshot,
    links_opt: proof === "photo" && !screenshot, ...(event ? { event } : {}), tg, tg_mode: g("bao telegram"), scope,
    detail: [report && `📷 Báo cáo: ${report}`, photo_min > 1 && detT && !checklist.length ? `Đủ ${photo_min} ảnh: ${detT}` : ""].filter(Boolean).join("\n"),
    v: 2, text: "",
  };
  rule.text = describe2(rule);
  return { key: nv(title).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120), row: rowNo, title, type: g("nhom viec") || "Việc lặp lại", rule,
    raw: Object.fromEntries(Object.keys(col).map((k) => [k, g(k)])), errs, active };
}

export function describe2(r: Record<string, any>) {
  const st = (r.stores || []).map((x: string) => STORE_TXT[x] || x).join(" + ") || "?";
  const day = r.once ? `1 lần ${r.once.split("-").reverse().join("/")}` : r.dom ? `ngày ${r.dom.map((d: number) => (d === -1 ? "cuối tháng" : d)).join(", ")} hằng tháng`
    : r.days === "daily" ? "hằng ngày" : (r.days || []).map((d: number) => DOWTXT[d]).join(", ");
  const tm = r.shift_end ? `hạn hết ca${r.shift_end.minus ? ` − ${r.shift_end.minus} phút` : ""} (không có ca: ${r.shift_end.fallback})`
    : `hạn ${(r.times || []).map((t: any) => `${t.slot ? `Ca ${t.slot} ` : ""}${t.hm || "hết ca"}`).join(", ")}`;
  const who = { slots: "cả ca, 1 người nộp là xong", at: r.kind === "group" ? "cả ca đang làm lúc đó, 1 người nộp là xong" : "từng NV đang trong ca lúc đó",
    all: r.need_shift ? "từng NV có ca hôm đó" : "từng NV, có ca hay không", rotate: "chia lượt: mỗi mốc giờ 1 người trong ca", cleaning: "người đăng ký lịch vệ sinh",
    staff: `NV ${(r.staff_ids || []).join(", ")}` }[r.who as string] || r.who;
  const whoTxt = r.who === "slots" && r.kind === "each" ? "từng NV trong ca đó" : who;
  const pf = r.info ? "bấm Đã nhận" : r.proof === "none" ? (r.links_min ? `≥ ${r.links_min} link` : "bấm hoàn tất")
    : r.proof === "check" ? `tick ${r.checklist.length} mục${r.photo_min ? ` + ${r.photo_min} ảnh${r.screenshot ? " chụp màn hình" : ""}` : ""}`
    : `${r.photo_min} ảnh${r.screenshot ? " CHỤP MÀN HÌNH" : ""}`;
  const op = r.open?.before ? `mở nộp trước hạn ${r.open.before} phút` : r.open?.fixed ? `mở nộp từ ${r.open.fixed}` : r.open?.days ? `nộp trước được ${r.open.days} ngày` : "nộp ngay khi giao";
  const lt = r.late ? (r.late.eod ? "khoá cuối ngày" : r.late.after ? `khoá sau hạn ${r.late.after >= 60 && r.late.after % 60 === 0 ? r.late.after / 60 + " giờ" : r.late.after + " phút"}` : "khoá ngay khi hết hạn") : "trễ vẫn nộp";
  const ev = r.event ? ` · diễn ra ${r.event.hm}${r.event.day === "last" ? " ngày cuối tháng" : r.event.day !== "same" ? ` ngày ${r.event.day}` : ""}` : "";
  return `${st} · ${day} · ${tm} · ${whoTxt} · ${pf} · ${op} · ${lt}${r.pen_late ? ` (−${r.pen_late}⭐)` : ""}${ev}${r.skip?.length ? ` · trừ ${r.skip.length} ngày nghỉ` : ""}`;
}

// values = toàn bộ tab (dòng tiêu đề + các dòng). Trả về dòng hợp lệ để lưu + chữ "Tool hiểu" cho từng dòng (để ghi ngược vào trang tính)
export function parseSheet2(values: string[][]) {
  const hi = values.findIndex((r) => r.some((c) => nv(c) === "ai nhan"));
  const col: Record<string, number> = {};
  values[hi].forEach((h, i) => { const k = nv(h).replace(/\s*\(.*\)\s*$/, "").trim(); if (k && !(k in col)) col[k] = i; });
  const understood: { row: number; text: string }[] = [], rows: any[] = [], seen = new Map<string, number>();
  values.slice(hi + 1).forEach((r, i) => {
    const rowNo = hi + 2 + i;
    if (!s(r[col["ten viec"]])) { understood.push({ row: rowNo, text: "" }); return; }
    const p = parseRow2(r, rowNo, col);
    if (p.key && seen.has(p.key)) p.errs.push(`trùng tên việc với dòng ${seen.get(p.key)}`);
    seen.set(p.key, rowNo);
    if (!p.active) { understood.push({ row: rowNo, text: "Đang tắt (bỏ tick Đang dùng)" }); return; }
    if (p.errs.length) { understood.push({ row: rowNo, text: "LỖI, chưa giao: " + p.errs.join("; ") }); return; }
    understood.push({ row: rowNo, text: String(p.rule.text) });
    const { errs: _e, active: _a, ...keep } = p;
    rows.push(keep);
  });
  return { rows, understood, col: col["tool hieu"] ?? -1, header: hi };
}
