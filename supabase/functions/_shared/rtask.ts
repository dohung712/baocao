// D13 Việc lặp lại: đọc trang tính công việc (cột STT | Công Việc | Siêu Thị | Ngày | Time | Ghi Chú | Báo Cáo bằng gì ? | Nhóm Công Việc | Thông báo qua Telegram)
// → quy tắc giao việc (không dùng AI: quy tắc chữ cố định, sửa trang tính là tool hiểu lại). rt_generate (SQL) dùng quy tắc này để giao việc theo lịch ca.
import { rest, rpc, vnParts } from "./common.ts";
import { drive, driveVersion } from "./drive.ts";

const s = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const nv = (v: unknown) => s(v).replace(/Đ/g, "D").replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hm = (h: string, m?: string) => `${String(Number(h)).padStart(2, "0")}:${String(Number(m || 0)).padStart(2, "0")}`;

export type Rule = {
  stores: string[]; days: "daily" | number[]; who: "slots" | "at" | "all" | "cleaning"; kind: "group" | "each"; need_shift: boolean; early_days: number;
  times: { hm?: string; slot?: number; start?: string }[]; shift_end?: { minus: number; fallback: string } | null;
  photo_min: number; photo_max: number; links_min: number; detail: string; tg: boolean; text: string;
  // D13c: scope = ai phải làm (group: 1 người làm xong cho cả ca · shift_each: ai có ca cũng làm · always: có ca hay không đều làm · cleaning: theo lịch VS)
  //       screenshot = chỉ nhận ảnh chụp màn hình · links_opt = có ô link bổ sung không bắt buộc
  scope?: "group" | "shift_each" | "always" | "cleaning"; screenshot?: boolean; links_opt?: boolean;
};

// Hiểu 1 dòng trang tính
export function parseRow(cells: string[], row: number) {
  const [, title, store, day, time, note, how, group, tg] = cells.map(s);
  const D = nv(day), T = nv(time), F = nv(note), G = nv(how);
  const stores = [/tgd/.test(nv(store)) && "TGDD", /topzone/.test(nv(store)) && "TOPZONE", /\bpg\b/.test(nv(store)) && "PG"].filter(Boolean) as string[];
  // Ngày: hằng ngày · thứ 2..7, CN · theo lịch đăng ký
  const dows = [...D.matchAll(/thu\s*([2-7])/g)].map((m) => Number(m[1]) - 1).concat(/chu nhat|\bcn\b/.test(D) ? [0] : []);
  const cleaning = /theo lich/.test(D + " " + F) && /dk|dang ky/.test(D + " " + F);
  const days: Rule["days"] = dows.length && !/hang ngay|moi ngay/.test(D) ? [...new Set(dows)].sort() : "daily";
  const slots = [...D.matchAll(/ca\s*([1-6])/g)].map((m) => Number(m[1]));
  // Giờ: khung "từ 8h00 đến trước 11h" · "trước khi hết ca 30 phút … deadline 17h" · danh sách "14h00 và 21h15"
  const windows = [...T.matchAll(/tu\s*(\d{1,2})\s*h\s*(\d{2})?\s*den\s*(?:truoc\s*)?(\d{1,2})\s*h\s*(\d{2})?/g)].map((m) => ({ start: hm(m[1], m[2]), hm: hm(m[3], m[4]) }));
  const se = T.match(/truoc khi het ca\s*(\d+)\s*phut/);
  let shift_end: Rule["shift_end"] = null, times: Rule["times"] = [];
  if (se) { const fb = T.match(/deadline[^0-9]*(\d{1,2})\s*h\s*(\d{2})?/); shift_end = { minus: Number(se[1]), fallback: fb ? hm(fb[1], fb[2]) : "17:00" }; times = [{}]; }
  else if (windows.length) times = windows;
  else times = [...new Set([...T.matchAll(/(\d{1,2})\s*h\s*(\d{2})?/g)].map((m) => hm(m[1], m[2])))].map((x) => ({ hm: x }));
  // Giao cho ai
  let who: Rule["who"] = "at", kind: Rule["kind"] = "group";
  if (cleaning) { who = "cleaning"; kind = "each"; }
  else if (/all nhan su|tat ca nhan su|co ca hay khong|khong ca deu lam|du co ca hay khong/.test(F)) { who = "all"; kind = "each"; }
  else if (slots.length) who = "slots";
  if (who === "slots") {
    // ghép ca ↔ giờ theo thứ tự ("Ca 3 và Ca 6" · "14h00 và 21h15"); 1 giờ cho nhiều ca → mỗi ca cùng giờ; không ghi giờ → hết ca
    times = slots.map((sl, i) => ({ slot: sl, hm: times[i]?.hm || (times.length === 1 ? times[0].hm : undefined) }));
  }
  const early = /bao cao truoc|truoc cung/.test(T);
  // Báo cáo bằng gì: ảnh (số ảnh nếu ghi) · link (ít nhất n link)
  const linkN = /(up|nop|gui|dan)\s*link|it nhat\s*\d+\s*link/.test(G) ? Number((G.match(/it nhat\s*(\d+)\s*link/) || [])[1] || 1) : 0;
  const photoN = linkN ? 0 : Number((G.match(/(\d+)\s*(?:hinh|anh)/) || [])[1] || 1);
  const labels = (how.split(":")[1] || "").trim();
  const rule: Rule = {
    stores, days, who, kind, need_shift: who === "all" && !early && !shift_end && !/co ca hay khong|khong ca deu lam/.test(F), early_days: early ? 3 : 0, times, shift_end,
    photo_min: photoN, photo_max: Math.max(6, photoN), links_min: linkN, tg: /^co\b/.test(nv(tg)) || /^có/i.test(tg),
    detail: [how && `📷 Báo cáo: ${how}`, note && !/gui thong bao cho nhan su trong ca|all nhan su/.test(F) ? `📝 ${note}` : "", labels && photoN > 1 ? `Đủ ${photoN} ảnh: ${labels}` : ""].filter(Boolean).join("\n"),
    text: "",
  };
  rule.scope = who === "cleaning" ? "cleaning" : kind === "group" ? "group" : rule.need_shift ? "shift_each" : "always";
  rule.screenshot = /chup man hinh|anh man hinh|screenshot/.test(G) || SCREENSHOT_KEYS.some((k) => nv(title).includes(k));
  rule.links_opt = !rule.screenshot && !linkN;
  if (rule.screenshot) { rule.photo_min = Math.max(1, rule.photo_min); rule.links_min = 0; }
  rule.text = describe(rule);
  return { key: nv(title).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120), row, title, type: group || "Việc lặp lại", rule,
    raw: { stt: cells[0] || "", title, store, day, time, note, how, group, tg } };
}

// D13c (chủ quản chốt 24/11): các việc chỉ nhận ẢNH CHỤP MÀN HÌNH (ngoài các dòng có chữ "chụp màn hình" ở cột Báo cáo)
const SCREENSHOT_KEYS = ["truyen thong hang ngay", "ve sinh ban tu van", "ve sinh hinh anh thu 2"];
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
// Mô tả cách tool hiểu dòng (hiện ở Giao việc → 🔁 Lặp lại để QL kiểm tra)
export function describe(r: Rule) {
  const st = r.stores.map((x) => ({ TGDD: "TGDĐ", TOPZONE: "Topzone", PG: "PG" }[x] || x)).join(" + ") || "chưa rõ siêu thị";
  const day = r.days === "daily" ? "hằng ngày" : r.days.map((d) => DOW[d]).join(", ");
  const tm = r.shift_end ? `hết ca − ${r.shift_end.minus} phút (không có ca: ${r.shift_end.fallback})` : r.times.map((t) => `${t.slot ? `Ca ${t.slot} ` : ""}${t.start ? `${t.start}→` : ""}${t.hm || "?"}`).join(", ");
  const who = r.who === "slots" ? "cả ca (1 người nộp là xong)" : r.who === "at" ? "cả ca đang làm lúc đó (1 người nộp là xong)" : r.who === "cleaning" ? "người đăng ký lịch vệ sinh" : r.need_shift ? "từng NV có ca hôm đó" : "từng NV (có ca hay không đều làm)";
  return `${st} · ${day} · ${tm} · ${who} · ${r.links_min ? `≥ ${r.links_min} link` : r.screenshot ? `≥ ${r.photo_min} ảnh CHỤP MÀN HÌNH` : `≥ ${r.photo_min} ảnh${r.links_opt ? " (+ link nếu cần)" : ""}`}`;
}

export function parseSheet(values: string[][]) {
  const hdr = values.findIndex((r) => r.some((c) => /c[oô]ng\s*vi[eệ]c/i.test(s(c))));
  const rows = values.slice(hdr + 1).map((r, i) => ({ r, i: hdr + 2 + i })).filter(({ r }) => s(r[1]));
  return rows.map(({ r, i }) => parseRow(r.map(s), i));
}

// Đọc trang tính qua Apps Script (bản 4) → lưu quy tắc → giao việc hôm nay
export async function rtSync(actor: string) {
  const sheet = (await rest("settings?select=value&key=eq.RT_SHEET_ID"))[0]?.value;
  if (!sheet) throw new Error("Chưa có link trang tính việc lặp lại (Giao việc → 🔁 Lặp lại).");
  if ((await driveVersion()) < 4) throw new Error("Apps Script trên Google Drive cần bản 4 (đọc trang tính).");
  const r = await drive({ action: "sheet_read", sheet: String(sheet) });
  const rows = parseSheet((r.values || []) as string[][]);
  if (!rows.length) throw new Error("Trang tính không có dòng công việc nào (cần cột 'Công Việc').");
  const saved = await rpc("_rt_save_templates", { p_rows: rows, p_actor: actor });
  const gen = await rpc("rt_generate", { p_date: vnParts().date });
  return { title: r.title || "", rows: rows.length, off: saved?.off ?? 0, new: gen?.new ?? 0, removed: gen?.removed ?? 0 };
}
