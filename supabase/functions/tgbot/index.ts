// D27 Edge Function "tgbot": Admin nhắn bot Telegram → AI soạn bản xem trước → bấm ✅ Lưu mới làm:
//   • thêm / sửa / tắt / bật việc lặp lại → ghi tab "Việc lặp lại (mẫu mới)" (Apps Script bản 6 sheet_row) → tool đọc lại + giao việc ngay
//   • giao việc 1 lần cho NV / bộ phận · 📢 thông báo cho mọi người (NV bấm Đã nhận, nhắc trước giờ diễn ra) · chữ chạy đầu trang
// Gọi từ Telegram (webhook, kèm X-Telegram-Bot-Api-Secret-Token) hoặc từ tool (Admin: setup / status / off).
// Nối: tool → Cài đặt → Telegram → 💬 Bot nhắc việc → Bật bot → nhắn /noi <mã> cho bot.
import { json, CORS, rest, rpc, member, gemini, vnParts, addDays, URL_BASE } from "../_shared/common.ts";
import { aiKey } from "../_shared/advisor.ts";
import { drive, driveVersion } from "../_shared/drive.ts";
import { rtSync } from "../_shared/rtask.ts";
import { NEW_TAB, parseRow2 } from "../_shared/rtask2.ts";
import { pushMany } from "../_shared/webpush.ts";

const APP_URL = "https://dohung712.github.io/baocao/v2/";
const s = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const nv = (v: unknown) => s(v).replace(/Đ/g, "D").replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const priv = async (k: string) => (await rest("private_settings?select=value&key=eq." + k))[0]?.value as string | undefined;
const setPriv = (k: string, v: string) => rest("private_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: k, value: v, updated_at: new Date().toISOString() }) });
const setting = async (k: string) => (await rest("settings?select=value&key=eq." + k))[0]?.value;

async function tg(method: string, body: unknown) {
  const token = await priv("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Chưa có token bot Telegram.");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
  return j.result;
}
const say = (chat: string | number, text: string, extra: Record<string, unknown> = {}) => tg("sendMessage", { chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true, ...extra });
const admins = async () => { try { return (JSON.parse((await priv("TGBOT_ADMINS")) || "[]") as unknown[]).map(String); } catch { return []; } };

// ---------- Trang tính ----------
const COLS = ["STT", "Tên việc", "Báo cáo gì", "Siêu thị", "Ai nhận", "Mã NV", "Lặp lại", "Thứ / ngày", "Ca áp dụng", "Giờ hạn", "Không có ca thì hạn", "Mở nộp", "Giờ mở nộp",
  "Quá hạn", "Trừ sao khi trễ", "Cách xác nhận", "Chi tiết xác nhận", "Giờ diễn ra", "Nhóm việc", "Báo Telegram", "Ngày không giao", "Đang dùng"];
const CHOICES = `Siêu thị: Tất cả / TGDĐ / Topzone / PG / TGDĐ + Topzone / TGDĐ + PG / Topzone + PG
Ai nhận: Cả ca: 1 người làm là xong / Cả ca: ai cũng làm / Mọi NV: có ca hay không / Chia lượt trong ca / Theo lịch đăng ký vệ sinh / Người cụ thể (ghi Mã NV, cách nhau dấu phẩy)
Lặp lại: Hằng ngày / Theo thứ / Ngày trong tháng / 1 lần · Thứ / ngày: "T2, T5" · "29" hoặc "Cuối tháng" · "dd/mm/yyyy" (1 lần) · Hằng ngày để trống
Ca áp dụng: "Ca 3, Ca 6" (mỗi ca 1 giờ hạn theo thứ tự) hoặc để trống
Giờ hạn: "14:00, 21:15" · "Mỗi 2 giờ 08:30-18:30" · "Hết ca -30p" (+ Không có ca thì hạn "17:00")
Mở nộp: Ngay khi giao / Trước hạn 30 phút / Trước hạn 60 phút / Trước hạn 2 giờ / Từ giờ cố định (+ Giờ mở nộp "08:00") / Từ 1 ngày trước / Từ 3 ngày trước
Quá hạn: Vẫn nộp, ghi trễ / Khoá sau 2 giờ / Khoá cuối ngày / Khoá ngay khi hết hạn · Trừ sao khi trễ: số
Cách xác nhận: Ảnh / Ảnh chụp màn hình / Link / Tick từng mục / Ảnh + tick / Ảnh chụp màn hình + tick / Bấm hoàn tất / Đã nhận thông tin
Chi tiết xác nhận: "2 ảnh" · "2 link" · các mục tick cách nhau dấu ;
Giờ diễn ra: "20:00" · "20:00 cuối tháng" · "20:00 ngày 30" · Báo Telegram: Không / Ngày / Tuần / Ngày + Tuần
Ngày không giao: "01/01, 30/04" · Đang dùng: TRUE / FALSE`;
async function readSheet() {
  const sheet = await setting("RT_SHEET_ID"), tab = String((await setting("RT_SHEET_TAB")) || NEW_TAB);
  if (!sheet) throw new Error("Chưa có link trang tính việc lặp lại.");
  const r = await drive({ action: "sheet_read", sheet: String(sheet), tab });
  const values = (r.values || []) as string[][];
  const hi = values.findIndex((x) => x.some((c) => nv(c) === "ai nhan"));
  if (hi < 0) throw new Error("Không thấy tab việc lặp lại mẫu mới.");
  const col: Record<string, number> = {};
  values[hi].forEach((h, i) => { const k = nv(h).replace(/\s*\(.*\)\s*$/, "").trim(); if (k && !(k in col)) col[k] = i; });
  const rows = values.slice(hi + 1).map((c, i) => ({ row: hi + 2 + i, c })).filter((x) => s(x.c[col["ten viec"]]));
  return { sheet: String(sheet), tab: r.tab || tab, values, col, rows, hi };
}
const rowLine = (x: { row: number; c: string[] }, col: Record<string, number>) => {
  const g = (k: string) => s(x.c[col[k]]);
  return `Dòng ${x.row}: ${g("ten viec")} | ${g("sieu thi")} | ${g("ai nhan")} | ${g("lap lai")} ${g("thu / ngay")} | ${g("ca ap dung")} ${g("gio han")} | ${g("cach xac nhan")} ${g("chi tiet xac nhan")} | ${g("nhom viec")}${/^false$/i.test(g("dang dung")) ? " | ĐANG TẮT" : ""}`;
};

// ---------- AI hiểu tin nhắn ----------
const S_ = (d: string) => ({ type: "STRING", description: d });
const SCHEMA = {
  type: "OBJECT", required: ["action", "summary"],
  properties: {
    action: { type: "STRING", enum: ["rt_add", "rt_edit", "rt_off", "rt_on", "job_once", "notice", "ticker", "list", "help", "unclear"] },
    summary: S_("1 câu tiếng Việt: sẽ làm gì"), question: S_("khi unclear hoặc thiếu thông tin bắt buộc: hỏi lại ngắn gọn"),
    row: { type: "INTEGER", description: "số dòng trang tính (rt_edit / rt_off / rt_on)" },
    fields: { type: "ARRAY", description: "rt_add / rt_edit: các cột cần ghi", items: { type: "OBJECT", required: ["col", "value"], properties: { col: S_("tên cột đúng như danh sách"), value: S_("giá trị đúng ô chọn") } } },
    job: { type: "OBJECT", description: "job_once / notice", properties: {
      title: S_("tên việc ngắn"), detail: S_("nội dung / cần nộp gì"), staff_ids: { type: "ARRAY", items: { type: "STRING" } }, all: { type: "BOOLEAN", description: "giao cho mọi NV" },
      depts: { type: "ARRAY", items: { type: "STRING" }, description: "bộ phận: TGDĐ / Topzone / PG" }, due_date: S_("YYYY-MM-DD"), due_hm: S_("HH:MM"),
      proof: { type: "STRING", enum: ["photo", "check", "none"] }, photo_min: { type: "INTEGER" }, checklist: { type: "ARRAY", items: { type: "STRING" } },
      event_date: S_("YYYY-MM-DD giờ diễn ra (họp, học)"), event_hm: S_("HH:MM"), ticker: { type: "BOOLEAN", description: "notice: đăng thêm chữ chạy đầu trang" } } },
    ticker: { type: "OBJECT", properties: { text: S_("nội dung"), link: S_("link nếu có"), to_date: S_("YYYY-MM-DD hiện tới ngày"), to_hm: S_("HH:MM"), depts: { type: "ARRAY", items: { type: "STRING" } } } },
  },
};
async function plan(text: string, ctx: { sheet: Awaited<ReturnType<typeof readSheet>> | null; staff: any[]; groups: string[]; draft: any }) {
  const vn = vnParts(), dow = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][vn.dow];
  const sys = `Bạn là trợ lý nhắc việc của giám đốc siêu thị (TGDĐ, Topzone, PG). Hiểu tin nhắn tiếng Việt (có thể viết tắt, không dấu) và trả JSON đúng khuôn.
Hôm nay ${dow} ${vn.date}, ${vn.hm} (giờ Việt Nam). "mai" = ${addDays(vn.date, 1)}.
Loại việc:
- rt_add: thêm việc LẶP LẠI (hằng ngày / tuần / tháng) vào trang tính · rt_edit: sửa cột của 1 dòng có sẵn · rt_off / rt_on: tắt / bật 1 dòng (không xoá)
- job_once: giao việc 1 LẦN (có hạn cụ thể) cho NV / bộ phận / mọi người, cần nộp ảnh / tick / bấm xong
- notice: THÔNG BÁO cho mọi người hoặc bộ phận (họp, học, triển khai, quy định): NV chỉ bấm Đã nhận; có giờ diễn ra thì điền event_*
- ticker: chữ chạy đầu trang tool tới 1 thời điểm · list: xem danh sách việc lặp lại · help: hỏi cách dùng · unclear: không rõ → question
Quy tắc rt_add / rt_edit: chỉ dùng tên cột trong danh sách, giá trị đúng ô chọn. rt_add tối thiểu: Tên việc, Báo cáo gì, Siêu thị, Ai nhận, Lặp lại (+ Thứ / ngày), Giờ hạn, Cách xác nhận, Nhóm việc.
Thiếu thông tin quan trọng (giờ hạn, ai làm) thì vẫn trả action đúng loại kèm question để hỏi thêm.
Có "Bản nháp trước" mà tin mới là bổ sung / sửa nháp → trả lại TOÀN BỘ nháp đã cập nhật (cùng action).
job_once / notice: staff_ids lấy đúng mã trong danh sách NV (khớp tên gần đúng); "mọi người" → all = true; "Topzone" → depts. Không ghi giờ hạn → notice hạn 22:00 hôm nay, job_once hỏi lại.
Danh sách cột: ${COLS.join(" | ")}
Ô chọn:
${CHOICES}
Nhóm việc: ${ctx.groups.join(" / ")}`;
  const user = [ctx.sheet ? `Việc lặp lại đang có:\n${ctx.sheet.rows.map((x) => rowLine(x, ctx.sheet!.col)).join("\n")}` : "",
    `Nhân viên (mã | tên | bộ phận):\n${ctx.staff.map((x) => `${x.id} | ${x.name} | ${x.dept}`).join("\n")}`,
    ctx.draft ? `Bản nháp trước (chưa lưu): ${JSON.stringify(ctx.draft)}` : "", `TIN NHẮN: ${text}`].filter(Boolean).join("\n\n");
  const out = await gemini(await aiKey(), { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: "application/json", responseSchema: SCHEMA } });
  try { return JSON.parse(out); } catch { return { action: "unclear", summary: "", question: "Mình chưa hiểu, anh nói rõ hơn giúp mình nhé." }; }
}

// ---------- Bản xem trước ----------
const storeOf = (dept: string) => { const x = nv(dept).toUpperCase().replace(/\s/g, ""); return x.includes("TGD") ? "TGDD" : x.includes("TOPZONE") || x.includes("AAR") ? "TOPZONE" : x.startsWith("PG") ? "PG" : x; };
const fmtD = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
function pickStaff(job: any, staff: any[]) {
  const want = new Set((job.depts || []).map((d: string) => storeOf(d)));
  if (job.all || (!job.staff_ids?.length && want.size)) return staff.filter((x) => !want.size || want.has(storeOf(x.dept)));
  const ids = new Set((job.staff_ids || []).map(String));
  return staff.filter((x) => ids.has(String(x.id)));
}
async function preview(p: any, sh: Awaited<ReturnType<typeof readSheet>> | null, staff: any[]) {
  const A = p.action;
  if (["rt_add", "rt_edit", "rt_off", "rt_on"].includes(A)) {
    if (!sh) throw new Error("Không đọc được trang tính.");
    const cur = A === "rt_add" ? null : sh.rows.find((x) => x.row === Number(p.row));
    if (A !== "rt_add" && !cur) return { ok: false, text: `Không thấy dòng ${p.row ?? "?"} trong trang tính. Nhắn "danh sách" để xem số dòng.` };
    const width = Math.max(...Object.values(sh.col)) + 1;
    const cells = cur ? [...cur.c] : Array(width).fill("");
    while (cells.length < width) cells.push("");
    const set: [number, unknown][] = [], diff: string[] = [];
    const put = (k: string, v: unknown, label: string) => { const i = sh.col[k]; if (i === undefined) return; if (s(cells[i]) !== s(v)) { diff.push(`${label}: ${s(cells[i]) || "∅"} → ${s(v) || "∅"}`); } cells[i] = typeof v === "boolean" ? String(v).toUpperCase() : String(v); set.push([i + 1, v]); };
    if (A === "rt_add") {
      const stt = Math.max(0, ...sh.rows.map((x) => Number(s(x.c[sh.col["stt"]])) || 0)) + 1;
      const def: Record<string, unknown> = { stt: String(stt), "lap lai": "Hằng ngày", "mo nop": "Ngay khi giao", "qua han": "Vẫn nộp, ghi trễ", "tru sao khi tre": "0", "bao telegram": "Ngày", "dang dung": true };
      for (const [k, v] of Object.entries(def)) put(k, v, k);
    }
    if (A === "rt_off" || A === "rt_on") put("dang dung", A === "rt_on", "Đang dùng");
    for (const f of p.fields || []) {
      const k = nv(f.col).replace(/\s*\(.*\)\s*$/, "").trim();
      if (k === "tool hieu" || k === "stt" || !(k in sh.col)) continue;
      put(k, k === "dang dung" ? /^(true|co|bat|x|1)$/i.test(nv(f.value)) : s(f.value), COLS.find((c) => nv(c) === k) || f.col);
    }
    if (!set.length) return { ok: false, text: "Không có gì thay đổi." };
    const rowNo = cur ? cur.row : sh.rows.reduce((a, x) => Math.max(a, x.row), sh.hi + 1) + 1;
    const pr = parseRow2(cells.map((x) => String(x ?? "")), rowNo, sh.col);
    const title = s(cells[sh.col["ten viec"]]);
    const head = { rt_add: "➕ THÊM VIỆC LẶP LẠI", rt_edit: `✏️ SỬA DÒNG ${rowNo}`, rt_off: `⏸️ TẮT DÒNG ${rowNo}`, rt_on: `▶️ BẬT LẠI DÒNG ${rowNo}` }[A as "rt_add"];
    const body = `${head}: ${title}\n` + (A === "rt_add" ? COLS.slice(1).map((c) => { const v = s(cells[sh.col[nv(c)]]); return v ? `• ${c}: ${v}` : ""; }).filter(Boolean).join("\n") : diff.map((d) => "• " + d).join("\n"));
    if (pr.errs.length && pr.active) return { ok: false, text: `${body}\n\n⚠️ Chưa lưu được: ${pr.errs.join("; ")}\nAnh nhắn bổ sung (vd "giờ hạn 17:00, 2 ảnh") — mình sửa tiếp bản nháp này.`, draft: true };
    return { ok: true, text: `${body}\n\n🤖 Tool sẽ hiểu: ${pr.active ? pr.rule.text : "đang tắt, không giao"}`, exec: { kind: "row", row: cur ? cur.row : 0, cells: set, title } };
  }
  if (A === "job_once" || A === "notice") {
    const j = p.job || {}, who = pickStaff(j, staff), info = A === "notice";
    const vn = vnParts(), due_date = /^\d{4}-\d{2}-\d{2}$/.test(j.due_date || "") ? j.due_date : info ? vn.date : "", due_hm = /^\d{2}:\d{2}$/.test(j.due_hm || "") ? j.due_hm : info ? "22:00" : "";
    const miss = [!s(j.title) && "tên việc", !who.length && "giao cho ai", !due_date && "ngày hạn", !due_hm && "giờ hạn"].filter(Boolean);
    if (miss.length) return { ok: false, text: `${info ? "📢 THÔNG BÁO" : "📌 VIỆC 1 LẦN"}: ${s(j.title) || "?"}\nCòn thiếu: ${miss.join(", ")}. Anh nhắn bổ sung giúp mình.`, draft: true };
    if (Date.parse(`${due_date}T${due_hm}:00+07:00`) < Date.now()) return { ok: false, text: `Giờ hạn ${due_hm} ${fmtD(due_date)} đã qua. Anh cho giờ khác nhé.`, draft: true };
    const proof = info ? "none" : (["photo", "check", "none"].includes(j.proof) ? j.proof : "photo");
    const checklist = (j.checklist || []).map(s).filter(Boolean);
    const pmin = proof === "none" ? 0 : Math.max(proof === "check" ? 0 : 1, Math.min(10, Number(j.photo_min) || (proof === "check" ? 0 : 1)));
    if (proof === "check" && !checklist.length) return { ok: false, text: "Việc tick cần các mục tick. Anh nhắn các mục giúp mình.", draft: true };
    const ev = info && /^\d{2}:\d{2}$/.test(j.event_hm || "") ? { event_hm: j.event_hm, event_date: /^\d{4}-\d{2}-\d{2}$/.test(j.event_date || "") ? j.event_date : due_date } : {};
    const payload = { title: s(j.title).slice(0, 200), detail: s(j.detail), staff_ids: who.map((x) => x.id), due_date, due_hm, proof, photo_min: pmin, photo_max: Math.max(6, pmin), checklist, info, ...ev };
    const names = who.length > 12 ? `${who.slice(0, 12).map((x) => x.name).join(", ")} … (+${who.length - 12})` : who.map((x) => x.name).join(", ");
    const tk = info && j.ticker ? { text: `📢 ${s(j.title)}${ev.event_hm ? ` · ${ev.event_hm} ${fmtD(ev.event_date)}` : ""}`, to_at: new Date(Date.parse(`${ev.event_date || due_date}T${ev.event_hm || due_hm}:00+07:00`) + 3600e3).toISOString(), audience: tickAud(j.depts, staff) } : null;
    return { ok: true, exec: { kind: "job", payload, ticker: tk },
      text: `${info ? "📢 THÔNG BÁO (NV bấm Đã nhận)" : "📌 GIAO VIỆC 1 LẦN"}: ${payload.title}\n${payload.detail ? `• Nội dung: ${payload.detail}\n` : ""}• Cho ${who.length} NV: ${names}\n• Hạn: ${due_hm} ${fmtD(due_date)}${ev.event_hm ? `\n• Diễn ra: ${ev.event_hm} ${fmtD(ev.event_date)} (nhắc trước 60 / 15 phút)` : ""}\n• Nộp: ${info ? "bấm Đã nhận" : proof === "none" ? "bấm hoàn thành" : proof === "check" ? `tick ${checklist.length} mục${pmin ? ` + ${pmin} ảnh` : ""}` : `${pmin} ảnh`}${tk ? "\n• Kèm chữ chạy đầu trang tới hết giờ diễn ra" : ""}\nNV nhận thông báo đẩy ngay khi lưu.` };
  }
  if (A === "ticker") {
    const t = p.ticker || {}, vn = vnParts();
    const to = `${/^\d{4}-\d{2}-\d{2}$/.test(t.to_date || "") ? t.to_date : vn.date}T${/^\d{2}:\d{2}$/.test(t.to_hm || "") ? t.to_hm : "22:00"}:00+07:00`;
    if (!s(t.text)) return { ok: false, text: "Chữ chạy cần nội dung.", draft: true };
    if (Date.parse(to) <= Date.now()) return { ok: false, text: "Thời điểm kết thúc đã qua.", draft: true };
    const link = /^https?:\/\/\S+$/i.test(s(t.link)) ? s(t.link) : "";
    const aud = tickAud(t.depts, staff);
    return { ok: true, exec: { kind: "ticker", payload: { text: s(t.text).slice(0, 500), link, to_at: new Date(Date.parse(to)).toISOString(), audience: aud } },
      text: `📢 CHỮ CHẠY ĐẦU TRANG\n• ${s(t.text)}${link ? `\n• Link: ${link}` : ""}\n• Hiện tới: ${to.slice(11, 16)} ${fmtD(to.slice(0, 10))}\n• Ai thấy: ${aud[0] === "*" ? "mọi người" : aud.join(", ")}` };
  }
  return { ok: false, text: p.question || "Mình chưa hiểu, anh nói rõ hơn giúp mình nhé." };
}
function tickAud(depts: string[] | undefined, staff: any[]) {
  const want = new Set((depts || []).map(storeOf));
  if (!want.size) return ["*"];
  return [...new Set(staff.filter((x) => want.has(storeOf(x.dept))).map((x) => x.dept))];
}

// ---------- Thực hiện ----------
async function execute(e: any, email: string) {
  if (e.kind === "row") {
    if ((await driveVersion()) < 6) throw new Error("Apps Script trên Google Drive cần cập nhật bản 6 (ghi dòng). Anh cập nhật theo hướng dẫn rồi bấm lại.");
    const sheet = await setting("RT_SHEET_ID"), tab = String((await setting("RT_SHEET_TAB")) || NEW_TAB);
    const w = await drive({ action: "sheet_row", sheet: String(sheet), tab, row: e.row || 0, cells: e.cells });
    const r = await rtSync("telegram");
    return `✅ Đã ghi dòng ${w.row} "${e.title}" vào trang tính.\n🔄 Tool đã đọc lại: ${r.rows} việc lặp lại · giao mới ${r.new} việc${r.removed ? ` · gỡ ${r.removed}` : ""}${r.errors ? ` · ⚠️ ${r.errors} dòng lỗi (xem cột Tool hiểu)` : ""}. App cập nhật ngay.`;
  }
  if (e.kind === "job") {
    const r = await rpc("_bot_job_assign", { p: e.payload, p_email: email });
    let extra = "";
    if (e.ticker) { try { await rpc("_bot_ticker_save", { p: e.ticker, p_email: email }); extra = " · đã đăng chữ chạy"; } catch (x) { extra = ` · chữ chạy lỗi: ${(x as Error).message}`; } }
    const pushed = r.batch ? await pushNew(String(r.batch)) : "";
    return `✅ ${r.message}${extra}${pushed ? `\n🔔 ${pushed}` : ""}`;
  }
  if (e.kind === "ticker") { await rpc("_bot_ticker_save", { p: e.payload, p_email: email }); return "✅ Đã đăng chữ chạy đầu trang."; }
  throw new Error("Không rõ việc cần làm.");
}
async function pushNew(batch: string) {   // giống push mode job_new (D22)
  const jobs: any[] = await rest(`jobs?select=id,staff_id,title,due_at,info&batch=eq.${batch}&status=eq.todo&pushed_at=is.null&order=due_at&limit=1000`);
  if (!jobs.length) return "";
  const by = new Map<string, any[]>(); for (const j of jobs) by.set(j.staff_id, [...(by.get(j.staff_id) || []), j]);
  const when = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600e3).toISOString(); return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`; };
  const r = await pushMany([...by.entries()].map(([staff_id, l]) => ({ staff_id, data: { title: (l[0].info ? "📢 Thông báo: " : "📌 Việc mới: ") + l[0].title, body: `Hạn ${when(l[0].due_at)} · bấm để xem`, url: APP_URL + "#today", tag: "jobs-new-" + batch.slice(0, 8), kind: "new", jobs: l.map((j) => j.id) } })));
  for (let i = 0; i < jobs.length; i += 150) await rest(`jobs?id=in.(${jobs.slice(i, i + 150).map((j) => j.id).join(",")})`, { method: "PATCH", body: JSON.stringify({ pushed_at: new Date().toISOString() }) });
  return `Đã báo ngay ${r.staff} NV${by.size - r.staff > 0 ? ` · ${by.size - r.staff} NV chưa bật thông báo` : ""}`;
}

const HELP = `🤖 Bot nhắc việc — nhắn bằng lời, mình soạn bản xem trước, anh bấm ✅ Lưu mới ghi:
• Việc lặp lại: "thêm việc kiểm kê phụ kiện T7 hàng tuần 17h, Topzone, cả ca 1 người làm, 2 ảnh"
• Sửa: "dòng 5 đổi giờ hạn 21:00" · Tắt / bật: "tắt việc chạy tủ LED" · "bật lại dòng 12"
• Việc 1 lần: "giao Trâm kiểm kho trước 17h mai, 3 ảnh"
• Thông báo: "thông báo cả siêu thị họp 8h sáng mai, nhớ có mặt đúng giờ"
• Chữ chạy: "chữ chạy: tuần này đẩy mạnh trả góp 0%, hiện tới chủ nhật"
• "danh sách" — xem việc lặp lại và số dòng · /huy — bỏ bản nháp`;

async function onMessage(m: any) {
  const chat = String(m.chat.id), from = String(m.from?.id || ""), text = s(m.text || m.caption || "");
  if (m.chat.type !== "private" || !text) return;
  const link = text.match(/^\/(?:noi|link|start)\s+(\d{6})$/i);
  if (link) {
    const L = JSON.parse((await priv("TGBOT_LINK")) || "{}");
    if (L.code === link[1] && Date.now() < Number(L.exp || 0)) {
      const a = await admins(); if (!a.includes(from)) a.push(from);
      await setPriv("TGBOT_ADMINS", JSON.stringify(a)); await setPriv("TGBOT_LINK", "{}");
      await say(chat, "✅ Đã nối Telegram của anh với tool. Từ giờ mình chỉ nhận lệnh từ tài khoản này.\n\n" + HELP);
    } else await say(chat, "Mã nối sai hoặc đã hết hạn. Vào tool → Cài đặt → Telegram → Bật bot để lấy mã mới.");
    return;
  }
  if (!(await admins()).includes(from)) return;   // người lạ: im lặng
  if (/^\/(start|help|huongdan)\b/i.test(text)) return void (await say(chat, HELP));
  const draftRow = (await rest(`tg_pending?select=id,payload,created_at&chat_id=eq.${chat}&status=eq.wait&order=id.desc&limit=1`))[0];
  if (/^\/huy\b|^huỷ$|^hủy$/i.test(text)) { if (draftRow) await rest(`tg_pending?id=eq.${draftRow.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancel" }) }); return void (await say(chat, "Đã bỏ bản nháp.")); }
  await tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  const [sh, staff, groupsTab] = await Promise.all([readSheet().catch(() => null), rest("staff?select=id,name,dept&hidden=eq.false&order=name"),
    (async () => { const sheet = await setting("RT_SHEET_ID"); return sheet ? drive({ action: "sheet_read", sheet: String(sheet), tab: "Hạng mục" }).catch(() => null) : null; })()]);
  const groups = ((groupsTab?.values || []) as string[][]).slice(1).map((x) => s(x[0])).filter((x) => x && x.length <= 40);
  const fresh = draftRow && Date.now() - Date.parse(draftRow.created_at) < 20 * 60e3 ? draftRow.payload?.plan : null;
  const p = await plan(text, { sheet: sh, staff, groups, draft: fresh });
  if (p.action === "help") return void (await say(chat, HELP));
  if (p.action === "list") {
    if (!sh) return void (await say(chat, "Không đọc được trang tính."));
    return void (await say(chat, `📋 Việc lặp lại (${sh.rows.length}):\n` + sh.rows.map((x) => `${x.row}. ${s(x.c[sh.col["ten viec"]])} — ${s(x.c[sh.col["lap lai"]])} ${s(x.c[sh.col["thu / ngay"]])} ${s(x.c[sh.col["gio han"]])}${/^false$/i.test(s(x.c[sh.col["dang dung"]])) ? " (đang tắt)" : ""}`).join("\n")));
  }
  if (p.action === "unclear") return void (await say(chat, p.question || "Mình chưa hiểu, anh nói rõ hơn giúp mình nhé. Nhắn /help để xem ví dụ."));
  const pv = await preview(p, sh, staff);
  if (draftRow) await rest(`tg_pending?id=eq.${draftRow.id}&status=eq.wait`, { method: "PATCH", body: JSON.stringify({ status: "cancel" }) });
  const row = (await rest("tg_pending", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ chat_id: chat, payload: { plan: p, exec: pv.exec || null } }) }))[0];
  if (!pv.ok) return void (await say(chat, pv.text));
  await say(chat, pv.text + (p.question ? `\n\n❓ ${p.question}` : ""), { reply_markup: { inline_keyboard: [[{ text: "✅ Lưu", callback_data: `ok:${row.id}` }, { text: "❌ Huỷ", callback_data: `no:${row.id}` }]] } });
}

async function onCallback(q: any) {
  const from = String(q.from?.id || ""), chat = String(q.message?.chat?.id || ""), msgId = q.message?.message_id;
  const [act, id] = String(q.data || "").split(":");
  if (!(await admins()).includes(from) || !/^\d+$/.test(id || "")) return void (await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Không có quyền." }).catch(() => {}));
  const claimed = await rest(`tg_pending?id=eq.${id}&chat_id=eq.${chat}&status=eq.wait`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: act === "ok" ? "done" : "cancel", done_at: new Date().toISOString() }) });
  const old = String(q.message?.text || "");
  if (!claimed.length) { await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Bản này đã xử lý hoặc đã hết hạn." }).catch(() => {}); return; }
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: act === "ok" ? "Đang lưu…" : "Đã huỷ" }).catch(() => {});
  if (act !== "ok") return void (await tg("editMessageText", { chat_id: chat, message_id: msgId, text: old + "\n\n❌ Đã huỷ." }).catch(() => {}));
  if (Date.now() - Date.parse(claimed[0].created_at) > 30 * 60e3) {
    await rest(`tg_pending?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "error", result: "hết hạn" }) });
    return void (await tg("editMessageText", { chat_id: chat, message_id: msgId, text: old + "\n\n⌛ Bản xem trước quá 30 phút, anh nhắn lại giúp mình." }).catch(() => {}));
  }
  let res: string;
  try { res = await execute(claimed[0].payload.exec, String(await priv("TGBOT_EMAIL"))); }
  catch (x) { res = "⚠️ Lỗi, chưa lưu: " + (x as Error).message; await rest(`tg_pending?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "error" }) }); }
  await rest(`tg_pending?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ result: res.slice(0, 1000) }) }).catch(() => {});
  await tg("editMessageText", { chat_id: chat, message_id: msgId, text: (old + "\n\n" + res).slice(0, 4000) }).catch(() => say(chat, res));
}

async function remember(u: any) {
  const c = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
  if (!c) return;
  await rest("tg_chats?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: String(c.id), title: c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || String(c.id), type: c.type, last_at: new Date().toISOString() }) }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tgSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (tgSecret !== null) {   // Telegram gọi
    const sec = await priv("TGBOT_SECRET");
    if (!sec || tgSecret !== sec) return new Response("forbidden", { status: 403 });
    const u = await req.json().catch(() => ({}));
    try {
      await remember(u);
      if (u.callback_query) await onCallback(u.callback_query);
      else if (u.message) await onMessage(u.message);
    } catch (e) { const c = u.message?.chat?.id || u.callback_query?.message?.chat?.id; if (c && u.message?.chat?.type === "private") await say(c, "⚠️ Lỗi: " + (e as Error).message).catch(() => {}); }
    return new Response("ok");
  }
  try {   // Tool gọi (Admin)
    const m = await member(req);
    const me = (await rest(`memberships?select=is_admin&email=eq.${encodeURIComponent(m.email)}`))[0];
    if (m.role !== "owner" || !me?.is_admin) throw new Error("Chỉ Admin dùng được bot nhắc việc.");
    const body = await req.json().catch(() => ({}));
    if (body.mode === "status") {
      const [info, bot] = await Promise.all([tg("getWebhookInfo", {}).catch(() => null), tg("getMe", {}).catch(() => null)]);
      return json({ status: "success", bot: bot?.username || "", on: !!info?.url && info.url.includes("/functions/v1/tgbot"), linked: (await admins()).length, error: info?.last_error_message || "" });
    }
    if (body.mode === "setup") {
      const sec = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await setPriv("TGBOT_SECRET", sec); await setPriv("TGBOT_EMAIL", m.email);
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      await setPriv("TGBOT_LINK", JSON.stringify({ code, exp: Date.now() + 10 * 60e3 }));
      await tg("setWebhook", { url: `${URL_BASE}/functions/v1/tgbot`, secret_token: sec, allowed_updates: ["message", "callback_query", "my_chat_member", "channel_post"], drop_pending_updates: true });
      await tg("setMyCommands", { commands: [{ command: "help", description: "Cách nhắn bot" }, { command: "huy", description: "Bỏ bản nháp" }] }).catch(() => {});
      const bot = await tg("getMe", {});
      return json({ status: "success", bot: bot.username, code, linked: (await admins()).length });
    }
    if (body.mode === "off") {
      await tg("deleteWebhook", {}).catch(() => {});
      await setPriv("TGBOT_ADMINS", "[]"); await setPriv("TGBOT_LINK", "{}");
      return json({ status: "success", message: "Đã tắt bot nhắc việc." });
    }
    throw new Error("Chế độ không hợp lệ.");
  } catch (e) {
    return json({ status: "error", message: (e as Error).message || "Lỗi" });
  }
});
