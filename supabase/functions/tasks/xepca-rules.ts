// D17c 📝 Rule xếp ca bằng chữ: QL gõ rule tiếng Việt → AI (Gemini, chỉ chữ) chuyển thành thay đổi cấu hình XEPCA_CFG.
// Trả về bản xem trước (cfg mới + AI hiểu từng rule ra sao + rule chưa làm được) — CHƯA lưu; giao diện bấm Áp dụng mới gọi xepca_cfg_save.
import { gemini } from "../_shared/common.ts";
// Model đôi khi bọc JSON trong ```json … ``` → lấy đoạn { … } ngoài cùng
const parseJson = (out: string) => { const t = String(out || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); try { return JSON.parse(t); } catch { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return JSON.parse(t.slice(a, b + 1)); } };

const SCHEMA = {
  type: "OBJECT",
  properties: {
    understood: { type: "ARRAY", items: { type: "OBJECT", properties: { rule: { type: "STRING" }, meaning: { type: "STRING" } }, required: ["rule", "meaning"] } },
    unsupported: { type: "ARRAY", items: { type: "STRING" } },
    max_day_h: { type: "NUMBER", nullable: true },
    min_day_h: { type: "NUMBER", nullable: true },
    min_off: { type: "INTEGER", nullable: true },
    min_slots: { type: "INTEGER", nullable: true },
    prefer: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
    forbid: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
    count_pos: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
    pairs: { type: "ARRAY", nullable: true, items: { type: "OBJECT", properties: { a: { type: "STRING" }, b: { type: "STRING" } }, required: ["a", "b"] } },
    need: { type: "ARRAY", nullable: true, items: { type: "OBJECT", properties: {
      store: { type: "STRING" }, dows: { type: "ARRAY", items: { type: "INTEGER" } }, slots: { type: "ARRAY", items: { type: "INTEGER" } }, people: { type: "INTEGER" } }, required: ["store", "dows", "slots", "people"] } },
  },
  required: ["understood", "unsupported"],
};

function prompt(cfg: any, staff: { id: string; name: string }[], slots: string[]) {
  return `Bạn chuyển RULE XẾP CA (tiếng Việt, do quản lý siêu thị gõ) thành các thông số cho bộ xếp ca tự động. Chỉ dùng các thông số dưới đây; rule nào không diễn đạt được bằng chúng thì ghi vào "unsupported" (giải thích ngắn), KHÔNG bịa.
Ca trong ngày: ${[1, 2, 3, 4, 5, 6].map((i) => `Ca ${i} ${slots[i - 1] || ""}`).join(" · ")}. Mỗi ngày mỗi NV làm 1 khối ca LIỀN NHAU (luôn đúng, không cần thông số) — "không đi ca 1 rồi về chiều lên" chính là luật này.
Thông số (để null nếu rule không nói tới):
- max_day_h: giờ làm tối đa 1 ngày · min_day_h: giờ làm tối thiểu 1 ngày đi làm · min_off: số ngày nghỉ tối thiểu / tuần
- min_slots: số ca tối thiểu 1 ngày đi làm (VD "không xếp 1 ngày chỉ 1 ca" → 2)
- prefer: các khối ca ưu tiên, dạng "1-3", "4-6" (VD "ưu tiên 123 / 456" → ["1-3","4-6"]) · forbid: khối ca cấm
- count_pos: bộ phận được đếm vào số người mỗi ca
- pairs: cặp NV hạn chế làm chung giờ (a, b = mã NV trong danh sách, hoặc tên nếu không chắc)
- need: số người cần: store = mã siêu thị (${(cfg.stores || []).map((s: any) => `${s.code} ${s.name}`).join(", ")}), dows = thứ (1 = T2 … 7 = CN), slots = ca (1–6), people = số người
"understood": mỗi rule 1 dòng: rule (nguyên văn ngắn) + meaning (bạn hiểu thế nào, thông số nào). Rule chỉ là thao tác (VD "chưa đạt thì bấm sắp lại") → meaning giải thích, không cần thông số.
Nhân viên: ${staff.map((s) => `${s.id} ${s.name}`).join("; ")}
Cấu hình hiện tại: ${JSON.stringify({ max_day_h: cfg.max_day_h, min_day_h: cfg.min_day_h, min_off: cfg.min_off, min_slots: cfg.min_slots, prefer: cfg.prefer, forbid: cfg.forbid, count_pos: cfg.count_pos, pairs: cfg.pairs })}`;
}

const norm = (x: string) => String(x || "").replace(/Đ/g, "D").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase().trim();
const okPat = (x: string) => { const s = String(x).replace(/\s+/g, ""), m = s.match(/^([1-6])[-–]([1-6])$/); if (m && +m[1] <= +m[2]) return `${m[1]}-${m[2]}`; if (/^[1-6]+$/.test(s)) { const a = s.split("").map(Number); if (a.every((v, i) => !i || v === a[i - 1] + 1)) return a.length === 1 ? `${a[0]}-${a[0]}` : `${a[0]}-${a[a.length - 1]}`; } return null; };

export async function xepcaRules(key: string, text: string, cfg: any, staff: { id: string; name: string }[], slots: string[]) {
  const out = await gemini(key, {
    systemInstruction: { parts: [{ text: prompt(cfg, staff, slots) }] },
    contents: [{ role: "user", parts: [{ text: "RULE:\n" + text }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  const r: any = parseJson(out);
  const c = JSON.parse(JSON.stringify(cfg)), warn: string[] = [];
  const num = (k: string, lo: number, hi: number) => { const v = r[k]; if (v === null || v === undefined || v === "") return; const n = Number(v); if (isFinite(n) && n >= lo && n <= hi) c[k] = n; else warn.push(`${k} = ${v} ngoài khoảng ${lo}–${hi}, bỏ qua`); };
  num("max_day_h", 1, 15); num("min_day_h", 0, 15); num("min_off", 0, 6); num("min_slots", 1, 6);
  for (const k of ["prefer", "forbid"]) if (Array.isArray(r[k])) { const v = r[k].map(okPat).filter(Boolean); if (v.length || !r[k].length) c[k] = [...new Set(v)]; }
  if (Array.isArray(r.count_pos) && r.count_pos.length) c.count_pos = r.count_pos.map(String).filter(Boolean);
  if (Array.isArray(r.pairs)) {   // tên / mã → mã NV; không khớp chắc chắn thì báo, không đoán
    const find = (x: string) => { const s = String(x).trim(); const byId = staff.find((t) => t.id === s); if (byId) return byId.id; const n = norm(s);
      const hit = staff.filter((t) => norm(t.name) === n || norm(t.name).endsWith(" " + n)); return hit.length === 1 ? hit[0].id : null; };
    const ps: string[][] = [];
    for (const p of r.pairs) { const a = find(p.a), b = find(p.b); if (a && b && a !== b) ps.push([a, b]); else warn.push(`Không xác định được cặp "${p.a}" – "${p.b}" (tên trùng / không có trong danh sách)`); }
    if (ps.length) c.pairs = ps;
  }
  if (Array.isArray(r.need)) for (const n of r.need) {
    const st = (c.stores || []).find((s: any) => String(s.code) === String(n.store));
    if (!st) { warn.push(`Không có siêu thị "${n.store}"`); continue; }
    const people = Math.max(0, Math.min(20, Number(n.people) || 0));
    for (const d of n.dows || []) for (const x of n.slots || []) if (d >= 1 && d <= 7 && x >= 1 && x <= 6) { (st.need ||= {})[String(d)] ||= [0, 0, 0, 0, 0, 0]; st.need[String(d)][x - 1] = people; }
  }
  c.text_rules = text;
  c.rule_notes = (Array.isArray(r.understood) ? r.understood : []).map((u: any) => ({ rule: String(u.rule || "").slice(0, 200), meaning: String(u.meaning || "").slice(0, 300) }));
  return { cfg: c, understood: c.rule_notes, unsupported: [...(Array.isArray(r.unsupported) ? r.unsupported.map(String) : []), ...warn] };
}
