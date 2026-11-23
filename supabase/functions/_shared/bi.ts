// B16 Số liệu BI: AI (Gemini) đọc ảnh chụp app BI công ty trong thư mục Drive "00 - Nhập doanh thu và thi đua"
//   → bảng bi_files (số đọc được từng ảnh) → bảng thi đua siêu thị store_contest (TGD, AAR + TỔNG).
// Dùng ở Edge Function "bi" (QL bấm đọc / chọn ảnh) và "notify" (tự đọc 30 phút / lần).
import { rest, rpc, gemini } from "./common.ts";
import { drive, driveVersion } from "./drive.ts";
import { pushMany } from "./webpush.ts";

const N = (desc: string) => ({ type: "NUMBER", nullable: true, description: desc });
const I = (desc: string) => ({ type: "INTEGER", nullable: true, description: desc });
const T = (desc: string) => ({ type: "STRING", nullable: true, description: desc });
export const BI_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["store_revenue", "store_contest", "staff_card", "other"] },
    captured_at: T("Giờ cập nhật / chụp trên ảnh, dạng YYYY-MM-DD HH:MM"),
    data_through: T("Số liệu tính tới hết ngày, dạng YYYY-MM-DD"),
    month: T("Tháng của số liệu, dạng YYYY-MM"),
    days_elapsed: I("Số ngày đã qua trong kỳ (21 trong '21/30 ngày')"),
    days_total: I("Số ngày của kỳ (30 trong '21/30 ngày')"),
    store_code: T("Mã siêu thị, chỉ chữ số (933, 10341)"),
    store_label: T("Dòng tên siêu thị, vd '933 – TGD_DNA_HCH - 351 Nguyễn Hữu Thọ'"),
    channel: { type: "STRING", nullable: true, enum: ["TGD", "AAR", "DMX"], description: "TGD = Thế Giới Di Động, AAR = TopZone, DMX = Điện Máy Xanh" },
    revenue: {
      type: "OBJECT", nullable: true,
      properties: {
        dt_qd: N("DT quy đổi lũy kế, triệu đồng"), target: N("Target DT tháng, triệu đồng"), pct_target: N("% HT target DT"),
        forecast: N("DT dự kiến cả tháng, triệu đồng"), avg3m: N("TB3T cùng cửa sổ, triệu đồng"), vs3m_pct: N("TT vs TB 3 tháng, %"),
        ssg_pct: N("SSG lũy kế, %"), same_period: N("Cùng kỳ năm trước, triệu đồng"), installment_pct: N("Tỷ trọng trả chậm, %"),
        profit_pct: N("% HT LNQĐ"), bills: I("Số bill"), avg_bill: N("Giá trị TB bill, triệu đồng"), visitors: I("Lượt khách"),
      },
    },
    staff: {
      type: "OBJECT", nullable: true,
      properties: {
        code: T("Mã nhân viên (số trước ' - BP')"), name: T("Họ tên nhân viên"), dept: T("Bộ phận, vd 'BP All In One - ĐMX'"),
        group_rank: I("Hạng x trong 'Hạng x / y'"), group_size: I("y trong 'Hạng x / y'"), score: N("Số trong vòng tròn (13 trong 13/27)"), score_max: N("27 trong 13/27"),
        complete_pct: N("Hoàn thành ..%"), revenue_qd: N("DOANH THU QĐ, triệu đồng"), revenue_target: N("MT (target DT), triệu đồng"), pct_target: N("% TARGET"),
        bills: I("SỐ LƯỢT BILL BÁN HÀNG"), attach_pct: N("% BÁN KÈM"), erp_points: N("ĐIỂM THƯỞNG ERP"), contest_pct: N("% lớn ở mục THI ĐUA"),
        contest_passed: I("số chương trình đạt"), contest_total: I("tổng số chương trình tính tỷ lệ"), avg_price: N("TB SẢN PHẨM CHÍNH, triệu đồng"),
      },
    },
    programs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" }, unit: { type: "STRING", nullable: true, enum: ["SL", "DT"] },
          actual: N("THỰC HIỆN"), target: N("TARGET"), pct: N("% thực hiện / target (số nhỏ ở thanh tiến độ, hoặc % trong ô của thẻ NV)"),
          forecast: N("% DỰ KIẾN HOÀN THÀNH"), rank: T("HẠNG VÙNG"),
        },
        required: ["name"],
      },
    },
  },
  required: ["kind"],
};

export const BI_PROMPT = `Bạn đọc ẢNH CHỤP MÀN HÌNH app BI nội bộ của chuỗi bán lẻ (Thế Giới Di Động / TopZone / Điện Máy Xanh) và trả về JSON đúng khuôn.
Bỏ qua chữ watermark mờ lặp lại khắp ảnh (dạng "18450 Đỗ Xuân Hùng"): đó là người đang xem, KHÔNG phải số liệu, không phải tên nhân viên của thẻ.
Có 3 loại màn hình:
1) kind="store_revenue": tiêu đề "Doanh thu hợp nhất" của 1 siêu thị (dòng "933 – TGD_DNA_HCH - 351 Nguyễn Hữu Thọ", "Kênh: TGD" hoặc "Kênh: TopZone (AAR)").
   store_code = số đầu dòng siêu thị; channel = TGD nếu kênh TGD / TGD_..., AAR nếu TopZone / AAR_...
   revenue.dt_qd = "DT quy đổi" (lũy kế); days_elapsed / days_total từ "lũy kế 21/30 ngày"; revenue.pct_target = "% HT target DT"; revenue.target = số sau chữ "target";
   revenue.forecast = "DT dự kiến"; revenue.avg3m = "TB3T cùng cửa sổ"; revenue.vs3m_pct = "TT vs TB 3 tháng"; revenue.ssg_pct = "SSG lũy kế"; revenue.same_period = "Cùng kỳ";
   revenue.installment_pct = "Tỷ trọng trả chậm"; revenue.profit_pct = "% HT LNQĐ"; revenue.bills = số bill; revenue.avg_bill = "Giá trị TB bill"; revenue.visitors = "Lượt khách".
2) kind="store_contest": bảng "BC Thi đua - Tháng MM/YYYY - Lũy kế", dòng "Toàn công ty » Siêu thị 933 - ...". store_code = mã siêu thị.
   programs = MỌI dòng của bảng: name = tên chương trình (bỏ tiền tố "T11 - "), unit = nhãn nhỏ SL hoặc DT cạnh tên, actual = THỰC HIỆN, target = TARGET (null nếu trống / "chưa có target"),
   pct = số % nhỏ ở đầu thanh tiến độ, forecast = "% DỰ KIẾN HOÀN THÀNH" (số % bên phải), rank = HẠNG VÙNG (dấu gạch → null).
3) kind="staff_card": thẻ 1 nhân viên (tên to ở đầu, dưới là "mã - bộ phận - siêu thị", "Hạng x / y", vòng điểm "13 /27", "Hoàn thành 48%", "Tháng 11/2026 · 21/30 ngày").
   staff.code = mã NV (số đứng trước " - BP"); staff.name; staff.dept; channel nếu thấy (AAR_DNA_HCH → AAR, TGD_DNA_HCH → TGD); staff.group_rank / group_size từ "Hạng 1 / 5";
   staff.score / score_max từ vòng "13 /27"; staff.complete_pct = "Hoàn thành ..%"; staff.revenue_qd = "DOANH THU QĐ"; staff.revenue_target = số sau "MT"; staff.pct_target = "% TARGET";
   staff.bills = "SỐ LƯỢT BILL BÁN HÀNG"; staff.attach_pct = "% BÁN KÈM"; staff.erp_points = "ĐIỂM THƯỞNG ERP"; staff.contest_pct = số % lớn ở mục THI ĐUA;
   staff.contest_passed / contest_total từ "3/13 chương trình đạt"; programs = các ô chương trình trong mục THI ĐUA (name + pct, actual / target / forecast = null); staff.avg_price = "TB SẢN PHẨM CHÍNH".
Ảnh khác: kind="other".
Thời gian: captured_at từ "Cập nhật lúc HH:MM:SS DD/MM/YYYY" hoặc "Chụp lúc HH:MM DD/MM/YYYY" (trả "YYYY-MM-DD HH:MM"); data_through từ "Số tới hết ngày 21/11";
nếu chỉ có "lũy kế 21/30 ngày" thì data_through là ngày 21 của tháng đó; month = "YYYY-MM" (lấy năm từ giờ cập nhật / chụp).
Số: dấu phẩy là phân cách hàng nghìn, dấu chấm là thập phân ("1,192.08" = 1192.08; "2,299" = 2299; "3,982,932" = 3982932). Tiền tính bằng triệu đồng như trên ảnh.
Phần trăm trả về số (126.2 cho 126.2%). Dấu gạch / trống → null. Không bịa số; không chắc thì để null.`;

const key = async () => (await rest("private_settings?select=value&key=eq.GEMINI_API_KEY"))[0]?.value as string | undefined;
const setting = async (k: string) => (await rest("settings?select=value&key=eq." + k))[0]?.value;
const num = (x: unknown) => (x === null || x === undefined || x === "" || isNaN(Number(x)) ? null : Number(x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const norm = (s: string) => String(s || "").replace(/Đ/g, "D").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
export const cleanProg = (s: string) => String(s || "").replace(/^\s*T\d{1,2}\s*[-–]\s*/i, "").replace(/\s+/g, " ").trim();
export const IMG = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

export async function extract(mime: string, b64: string) {
  const k = await key();
  if (!k) throw new Error("Chưa có khoá AI (GEMINI_API_KEY).");
  const out = await gemini(k, {
    contents: [{ role: "user", parts: [{ text: BI_PROMPT }, { inline_data: { mime_type: mime || "image/jpeg", data: b64 } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8000, responseMimeType: "application/json", responseSchema: BI_SCHEMA },
  });
  try { return JSON.parse(out); } catch { throw new Error("AI trả về không đúng khuôn."); }
}

type FileMeta = { id: string; name: string; updated?: string; url?: string };
// Ghi kết quả 1 ảnh: ghép kênh (TGD / AAR) và mã NV, chuẩn hoá ngày
export async function saveExtraction(f: FileMeta, p: any, actor: string) {
  const stores = (await setting("BI_STORES")) || {};
  const code = String(p.store_code || "").replace(/\D/g, "") || null;
  const channel = ["TGD", "AAR"].includes(p.channel) ? p.channel : (code && stores[code]) || null;
  let staff_id: string | null = null;
  if (p.kind === "staff_card" && p.staff) {
    const staff: { id: string; name: string }[] = await rest("staff?select=id,name");
    const sc = String(p.staff.code || "").trim();
    let st = staff.find((x) => x.id === sc);
    if (!st && p.staff.name) { const nn = norm(p.staff.name); const c = staff.filter((x) => norm(x.name) === nn); if (c.length === 1) st = c[0]; }
    staff_id = st?.id || null;
  }
  const month = /^\d{4}-\d{2}$/.test(String(p.month || "")) ? p.month : null;
  let through = /^\d{4}-\d{2}-\d{2}$/.test(String(p.data_through || "")) ? p.data_through : null;
  if (!through && month && num(p.days_elapsed)) through = `${month}-${String(p.days_elapsed).padStart(2, "0")}`;
  const cap = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(p.captured_at || "")) ? new Date(p.captured_at.replace(" ", "T") + ":00+07:00").toISOString() : null;
  if (p.programs) p.programs = p.programs.map((x: any) => ({ ...x, name: cleanProg(x.name) }));
  const row = {
    file_id: f.id, name: f.name || "", file_updated: f.updated || "", url: f.url || "", kind: ["store_revenue", "store_contest", "staff_card"].includes(p.kind) ? p.kind : "other",
    store_code: code, channel, staff_id, captured_at: cap, data_through: through, month: month || (through ? through.slice(0, 7) : null),
    data: p, status: "ok", error: "", processed_at: new Date().toISOString(), processed_by: actor,
  };
  await rest("bi_files?on_conflict=file_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  return row;
}
async function saveError(f: FileMeta, msg: string, actor: string) {
  await rest("bi_files?on_conflict=file_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ file_id: f.id, name: f.name || "", file_updated: f.updated || "", url: f.url || "", kind: "other", status: "error", error: msg.slice(0, 500), data: {}, processed_at: new Date().toISOString(), processed_by: actor }) });
}

// Bảng thi đua siêu thị từ ảnh "BC Thi đua" mới nhất của mỗi kênh trong tháng mới nhất + dòng TỔNG (cộng 2 kênh)
export async function applyContest(actor: string) {
  const rows: any[] = await rest("bi_files?select=channel,month,data_through,captured_at,data&kind=eq.store_contest&status=eq.ok&channel=not.is.null&order=month.desc.nullslast,data_through.desc.nullslast,captured_at.desc.nullslast&limit=40");
  if (!rows.length) return null;
  const month = rows[0].month, latest = new Map<string, any>();
  for (const r of rows) if (r.month === month && !latest.has(r.channel)) latest.set(r.channel, r);
  const rev: any[] = await rest(`bi_files?select=data&kind=eq.store_revenue&status=eq.ok${month ? `&month=eq.${month}` : ""}&order=data_through.desc.nullslast&limit=1`);
  const el = num(rev[0]?.data?.days_elapsed), tot = num(rev[0]?.data?.days_total);
  const out: any[] = [], sum = new Map<string, { name: string; type: string; actual: number; target: number; fc: number[]; rank: string }>();
  for (const ch of ["TGD", "AAR"]) {
    const r = latest.get(ch); if (!r) continue;
    for (const p of r.data?.programs || []) {
      const name = cleanProg(p.name); if (!name) continue;
      const type = p.unit === "SL" ? "SỐ LƯỢNG" : "DOANH THU", actual = num(p.actual) ?? 0, target = num(p.target) ?? 0;
      const rate = num(p.pct) ?? (target ? (actual * 100) / target : 0), fc = num(p.forecast) ?? (el && tot ? (rate * tot) / el : rate);
      out.push({ name, type, actual, target, rateMonth: r1(rate), forecast: r1(fc), rank: p.rank ? String(p.rank) : "-", branch: ch });
      const k = norm(name) + "|" + type, s = sum.get(k) || { name, type, actual: 0, target: 0, fc: [], rank: "-" };
      s.actual += actual; s.target += target; s.fc.push(fc); sum.set(k, s);
    }
  }
  for (const s of sum.values()) {
    const rate = s.target ? (s.actual * 100) / s.target : 0;
    const fc = s.target ? (el && tot ? (rate * tot) / el : s.fc.reduce((a, b) => a + b, 0) / s.fc.length) : 0;
    out.push({ name: s.name, type: s.type, actual: Math.round(s.actual * 100) / 100, target: Math.round(s.target * 100) / 100, rateMonth: r1(rate), forecast: r1(fc), rank: "-", branch: "TỔNG" });
  }
  if (!out.length) return null;
  await rpc("_store_contest_set", { p_rows: out, p_actor: actor });
  return out.length;
}

// ---------- B16b: thẻ NV → đề xuất chờ QL duyệt (bi_proposals) ----------
const ikey = (s: string) => norm(String(s || "").replace(/(\.\.\.|…)\s*$/, "")).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// Ghép tên chương trình trên BI với môn thi đua tháng của NV trong tool: trùng tên, hoặc 1 bên là phần đầu của bên kia (chỉ khi duy nhất)
export function matchItem(biName: string, tool: { name: string; target: number }[], used: Set<string>, exact = false) {
  const b = ikey(biName); if (!b) return null;
  const free = tool.filter((t) => !used.has(t.name));
  let c = free.filter((t) => ikey(t.name) === b);
  if (c.length !== 1 && !exact) c = free.filter((t) => { const k = ikey(t.name); return k && (b.startsWith(k + " ") || k.startsWith(b + " ")); });
  return c.length === 1 ? c[0] : null;
}
// Ghép cả danh sách: lượt 1 trùng tên, lượt 2 theo phần đầu tên (để "Sim" không tranh với "Sim ĐMX")
export function matchAll(names: string[], tool: { name: string; target: number }[]) {
  const used = new Set<string>(), out = new Array(names.length).fill(null);
  for (const exact of [true, false]) names.forEach((nm, i) => { if (out[i]) return; const m = matchItem(nm, tool, used, exact); if (m) { used.add(m.name); out[i] = m; } });
  return out as ({ name: string; target: number } | null)[];
}
// Tạo đề xuất cho các thẻ NV chưa có đề xuất; trả số đề xuất mới (và báo QL qua thông báo đẩy)
export async function proposeFromCards(actor: string) {
  const cards: any[] = await rest("bi_files?select=file_id,staff_id,data_through,data&kind=eq.staff_card&status=eq.ok&staff_id=not.is.null&data_through=not.is.null&order=data_through&limit=500");
  if (!cards.length) return 0;
  const have = new Set(((await rest("bi_proposals?select=file_id&limit=5000")) as any[]).map((x) => x.file_id));
  const todo = cards.filter((c) => !have.has(c.file_id));
  if (!todo.length) return 0;
  const measures = new Map(((await rest("item_measures?select=name,measure")) as any[]).map((x) => [x.name, x.measure]));
  let made = 0, applied = 0; const who: string[] = [];
  for (const c of todo) {
    const month = c.data_through.slice(0, 7) + "-01";
    const t = (await rest(`monthly_targets?select=items&staff_id=eq.${encodeURIComponent(c.staff_id)}&month=eq.${month}`))[0];
    const tool = ((t?.items || []) as any[]).map((x) => ({ name: String(x.name), target: Number(x.target) || 0 }));
    const progs = ((c.data?.programs || []) as any[]).filter((p) => num(p.pct) !== null);
    const hit = matchAll(progs.map((p) => p.name), tool), items: any[] = [];
    for (const [i, p] of progs.entries()) {
      const pct = num(p.pct)!, it = hit[i];
      if (!it) { items.push({ name: null, bi_name: p.name, pct }); continue; }
      const sl = (measures.get(it.name) || (it.target === Math.trunc(it.target) && it.target <= 200 ? "sl" : "dtqd")) === "sl";
      const v = (pct * it.target) / 100;
      items.push({ name: it.name, bi_name: p.name, pct, target: it.target, value: it.target ? (sl ? Math.round(v) : Math.round(v * 100) / 100) : null, sl });
    }
    const r = await rpc("_bi_propose", { p: { file_id: c.file_id, staff_id: c.staff_id, as_of: c.data_through, revenue: num(c.data?.staff?.revenue_qd), items }, p_actor: actor });
    if (r?.status === "applied") { made++; applied++; }
    else if (r?.status === "success") { made++; who.push(c.staff_id); }
  }
  // B16c: thường tự cập nhật luôn (BI_AUTO_APPLY) → chỉ báo QL khi còn thẻ phải duyệt tay (khoá sổ / tắt tự cập nhật)
  if (who.length) {
    try {
      const mgr: any[] = await rest("memberships?select=staff_id&active=eq.true&role=in.(owner,manager)&staff_id=not.is.null");
      await pushMany(mgr.map((x) => ({ staff_id: x.staff_id, data: { title: `🟡 ${who.length} số BI của NV chờ duyệt`, body: "Không tự cập nhật được (tắt tự cập nhật hoặc ngày đã khoá sổ) — mở trang Siêu thị để xử lý", url: "https://dohung712.github.io/baocao/v2/#store", tag: "bi-approve" } })));
    } catch { /* không có máy nào bật thông báo */ }
  }
  return made;
}

// Đọc các ảnh mới / đã sửa trong thư mục BI (mỗi lần tối đa `limit` ảnh để không quá giờ chạy)
export async function biSync(actor: string, limit = 4) {
  if ((await driveVersion()) < 3) throw new Error("Apps Script trên Google Drive cần bản 3 (supabase/apps-script/drive-upload.gs).");
  const p = await setting("BI_DRIVE_PATH");
  const path = Array.isArray(p) ? p.map(String) : ["Tool Báo Cáo", "00 - Nhập doanh thu và thi đua"];
  const l = await drive({ action: "list", path });
  const files: any[] = (l.files || []).filter((f: any) => IMG.test(f.mime));
  const done: any[] = await rest("bi_files?select=file_id,file_updated&limit=5000");
  const seen = new Map(done.map((d) => [d.file_id, d.file_updated]));
  const todo = files.filter((f) => !seen.has(f.id) || (seen.get(f.id) !== f.updated && seen.get(f.id) !== "upload"));
  let ok = 0, errors = 0;
  for (const f of todo.slice(0, limit)) {
    try {
      const g = await drive({ action: "get", id: f.id, path });
      await saveExtraction({ id: f.id, name: f.name, updated: f.updated, url: f.url }, await extract(g.file?.mime || f.mime, g.data), actor);
      ok++;
    } catch (e) { errors++; await saveError({ id: f.id, name: f.name, updated: f.updated, url: f.url }, String((e as Error).message), actor).catch(() => {}); }
  }
  const applied = ok ? await applyContest(actor).catch(() => null) : null;
  const proposals = ok ? await proposeFromCards(actor).catch(() => 0) : 0;
  return { total: files.length, read: ok, errors, remaining: Math.max(0, todo.length - limit), contestRows: applied, proposals, folder: l.folder?.url || "" };
}

// QL chọn ảnh từ máy: lưu vào thư mục BI trên Drive rồi đọc luôn
export async function biUpload(actor: string, items: { name: string; mime: string; data: string }[]) {
  const p = await setting("BI_DRIVE_PATH");
  const path = Array.isArray(p) ? p.map(String) : ["Tool Báo Cáo", "00 - Nhập doanh thu và thi đua"];
  const res: any[] = [];
  for (const it of items.slice(0, 4)) {
    if (!IMG.test(it.mime) || !it.data || it.data.length > 14_000_000) { res.push({ name: it.name, error: "Không phải ảnh hoặc quá lớn" }); continue; }
    const f = await drive({ action: "upload", path, name: String(it.name || "bi.jpg").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120), mime: it.mime, data: it.data });
    try { const row = await saveExtraction({ id: f.id, name: f.name, updated: "upload", url: f.url }, await extract(it.mime, it.data), actor); res.push({ name: f.name, kind: row.kind, staff_id: row.staff_id, channel: row.channel }); }
    catch (e) { await saveError({ id: f.id, name: f.name, updated: "upload", url: f.url }, String((e as Error).message), actor).catch(() => {}); res.push({ name: f.name, error: String((e as Error).message) }); }
  }
  const applied = res.some((r) => r.kind === "store_contest") ? await applyContest(actor).catch(() => null) : null;
  const proposals = res.some((r) => r.kind === "staff_card") ? await proposeFromCards(actor).catch(() => 0) : 0;
  return { files: res, contestRows: applied, proposals };
}
