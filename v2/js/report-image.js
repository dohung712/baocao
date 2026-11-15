// Xuất ảnh "BÁO CÁO CHỐT THI ĐUA CA NGÀY" (PNG) đầy đủ như bản cũ: target, thực đạt, %, sao, hôm qua, chuỗi, bù/tăng ca, tổng kết
import { fmt, sign, toast } from "./ui.js";

const FONT = '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif';
const C = { navy: "#141a33", navy2: "#1f2750", gold: "#f2c94c", goldSoft: "#fff6d6", ink: "#1b1f2a", muted: "#7a8091", line: "#e6e8ee",
  ok: "#1a9b55", okBg: "#e3f6ea", bad: "#d64545", badBg: "#fde8e8", info: "#2f6fd6", infoBg: "#e6efff", star: "#f2b01e", white: "#fff", bg: "#f4f5f8", zebra: "#fafbfc", green: "#48d597" };
const W = 1240, PAD = 28;
// Cột: [tiêu đề, độ rộng, căn]
const COLS = [["#", 46, "c"], ["MÔN THI ĐUA", 404, "l"], ["TARGET", 96, "r"], ["THỰC ĐẠT", 102, "c"], ["% ĐẠT", 90, "r"], ["SAO ±", 110, "r"], ["H.QUA", 84, "c"], ["CHUỖI", 80, "c"], ["BÙ / TĂNG CA", 172, "c"]];

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(ctx, text, max, maxLines = 2) {
  const words = String(text).split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…"); }
  return lines;
}
function txt(ctx, s, x, y, align = "l", font, color) { if (font) ctx.font = font; if (color) ctx.fillStyle = color; ctx.textAlign = align === "r" ? "right" : align === "c" ? "center" : "left"; ctx.fillText(s, x, y); ctx.textAlign = "left"; }
function badge(ctx, cx, cy, label, fg, bg, w = 150) { ctx.fillStyle = bg; rr(ctx, cx - w / 2, cy - 20, w, 40, 12); ctx.fill(); txt(ctx, label, cx, cy + 8, "c", "700 21px " + FONT, fg); }

// d: { store, name, id, dept, dateLabel, updatedAt, prevDay, rows:[{name,target,actual,rate,star,status,comp,streak,needed,prev}],
//      late:[{name,star}], dayChange, total, totalBefore, okCount, revenue, unit, extra, extraStars }
export async function reportPng(d) {
  try { await document.fonts?.ready; } catch { /* bỏ qua */ }
  // Gộp nhiều dòng phạt TikTok thành 1 dòng
  const tk = (d.late || []).filter((l) => /tiktok/i.test(l.name)), other = (d.late || []).filter((l) => !/tiktok/i.test(l.name));
  if (tk.length > 2) { const dates = tk.map((l) => (l.name.match(/\d{2}\/\d{2}/) || [""])[0]).filter(Boolean);
    d = { ...d, late: [...other, { name: `[Kỷ Luật] TikTok trễ hạn ${tk.length} kỳ (${dates[0]} → ${dates[dates.length - 1]})`, star: tk.reduce((a, l) => a + (Number(l.star) || 0), 0) }] }; }
  const probe = document.createElement("canvas").getContext("2d"); probe.font = "700 23px " + FONT;
  const rowH = d.rows.map((r) => (wrap(probe, r.name, COLS[1][1] - 16).length > 1 ? 74 : 58));
  const headH = 190, thH = 58, lateH = (d.late?.length || 0) * 46, extraH = 64, footH = 128;
  const H = PAD + headH + 20 + thH + rowH.reduce((a, b) => a + b, 0) + 12 + lateH + extraH + 16 + footH + PAD + 34;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  // ----- Đầu trang -----
  let y = PAD;
  ctx.fillStyle = C.navy; rr(ctx, PAD, y, W - PAD * 2, headH, 18); ctx.fill();
  txt(ctx, "BÁO CÁO CHỐT THI ĐUA CA NGÀY", PAD + 26, y + 40, "l", "700 20px " + FONT, "#c9cde0");
  ctx.font = "800 40px " + FONT; const nameW = Math.min(ctx.measureText(d.name).width, 620);
  txt(ctx, d.name, PAD + 26, y + 92, "l", "800 40px " + FONT, C.gold);
  txt(ctx, `Mã ${d.id}`, PAD + 26 + nameW + 18, y + 90, "l", "600 22px " + FONT, "#9aa0bb");
  txt(ctx, `Ngày làm việc: ${d.dateLabel}`, PAD + 26, y + 134, "l", "600 24px " + FONT, C.white);
  const up = d.updatedAt instanceof Date ? d.updatedAt : new Date();
  txt(ctx, `Cập nhật lúc: ${up.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`, PAD + 26, y + 168, "l", "600 21px " + FONT, C.green);
  // khối phải
  const rx = W - PAD - 26;
  if (d.dept) { ctx.font = "800 20px " + FONT; const bw = ctx.measureText(d.dept).width + 34; ctx.fillStyle = "#4f6bff"; rr(ctx, rx - bw, y + 22, bw, 34, 17); ctx.fill(); txt(ctx, d.dept, rx - bw / 2, y + 46, "c", "800 20px " + FONT, C.white); }
  txt(ctx, `Tổng sao trước ca: ${fmt(d.totalBefore)} ⭐`, rx, y + 104, "r", "600 26px " + FONT, C.white);
  txt(ctx, `Lũy kế sau ca: ${fmt(d.total)} ⭐`, rx, y + 146, "r", "800 32px " + FONT, C.gold);
  txt(ctx, d.store || "", rx, y + 176, "r", "500 19px " + FONT, "#9aa0bb");

  // ----- Bảng môn -----
  y += headH + 20;
  const tx = PAD, tw = W - PAD * 2, bodyH = rowH.reduce((a, b) => a + b, 0);
  ctx.fillStyle = C.white; rr(ctx, tx, y, tw, thH + bodyH + 8, 16); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); rr(ctx, tx, y, tw, thH + bodyH + 8, 16); ctx.clip();
  ctx.fillStyle = C.gold; ctx.fillRect(tx, y, tw, thH);
  let cx = tx; const colX = [];
  COLS.forEach(([, w], i) => { colX.push(cx); if (i === 6) { ctx.fillStyle = C.goldSoft; ctx.fillRect(cx, y + thH, w, bodyH + 8); ctx.fillStyle = "#f7d76a"; ctx.fillRect(cx, y, w, thH); } cx += w; });
  COLS.forEach(([h, w, a], i) => txt(ctx, h, a === "l" ? colX[i] + 10 : a === "r" ? colX[i] + w - 12 : colX[i] + w / 2, y + 36, a, "800 19px " + FONT, C.ink));
  let ry = y + thH;
  d.rows.forEach((r, i) => {
    const h = rowH[i], mid = ry + h / 2;
    if (i % 2) { ctx.fillStyle = C.zebra; ctx.fillRect(tx, ry, colX[6] - tx, h); ctx.fillRect(colX[7], ry, tx + tw - colX[7], h); }
    ctx.fillStyle = C.line; ctx.fillRect(tx, ry + h - 1, tw, 1);
    const ok = r.status === "Về số", star = Number(r.star) || 0;
    txt(ctx, String(i + 1), colX[0] + COLS[0][1] / 2, mid + 8, "c", "600 22px " + FONT, C.muted);
    ctx.font = "700 23px " + FONT; const ls = wrap(ctx, r.name.toUpperCase(), COLS[1][1] - 16);
    ls.forEach((l, k) => txt(ctx, l, colX[1] + 10, mid + 8 - (ls.length - 1) * 14 + k * 28, "l", "700 23px " + FONT, C.ink));
    txt(ctx, fmt(r.target, 2), colX[2] + COLS[2][1] - 12, mid + 8, "r", "700 24px " + FONT, C.ink);
    // ô thực đạt
    const aw = 62, ax = colX[3] + COLS[3][1] / 2 - aw / 2; ctx.fillStyle = ok ? C.okBg : "#f3f4f8"; rr(ctx, ax, mid - 20, aw, 40, 9); ctx.fill(); ctx.strokeStyle = ok ? C.ok : "#cfd3de"; ctx.lineWidth = 1.5; ctx.stroke();
    txt(ctx, fmt(r.actual, 2), colX[3] + COLS[3][1] / 2, mid + 8, "c", "800 22px " + FONT, ok ? C.ok : C.ink);
    txt(ctx, `${r.rate ?? 0}%`, colX[4] + COLS[4][1] - 12, mid + 8, "r", "800 24px " + FONT, ok ? C.ok : C.bad);
    if (ok) txt(ctx, sign(star), colX[5] + COLS[5][1] - 12, mid + 8, "r", "800 24px " + FONT, C.ok);
    else if (star < 0) txt(ctx, sign(star), colX[5] + COLS[5][1] - 12, mid + 8, "r", "800 24px " + FONT, C.bad);
    else { txt(ctx, "0", colX[5] + COLS[5][1] - 12, mid - 4, "r", "700 22px " + FONT, C.muted); txt(ctx, r.comp === "TANG_CA" ? "(tăng ca)" : "(chưa phạt)", colX[5] + COLS[5][1] - 12, mid + 20, "r", "500 16px " + FONT, C.muted); }
    txt(ctx, r.prev == null ? "–" : fmt(r.prev, 2), colX[6] + COLS[6][1] / 2, mid + 8, "c", "700 23px " + FONT, C.ink);
    const sk = Number(r.streak) || 0, scx = colX[7] + COLS[7][1] / 2;
    ctx.fillStyle = ok ? C.okBg : sk > 0 ? C.bad : "#eceef3"; ctx.beginPath(); ctx.arc(scx, mid, 17, 0, Math.PI * 2); ctx.fill();
    txt(ctx, ok ? "✓" : String(sk), scx, mid + 7, "c", "800 19px " + FONT, ok ? C.ok : sk > 0 ? C.white : C.muted);
    const bx = colX[8] + COLS[8][1] / 2;
    if (ok) badge(ctx, bx, mid, "✅ Về số", C.ok, C.okBg);
    else if (r.comp === "TANG_CA") badge(ctx, bx, mid, "⏰ Tăng ca", C.info, C.infoBg);
    else if (r.comp === "GHI_NHAN" || star === 0) badge(ctx, bx, mid, "📝 Ghi nhận", "#5b6275", "#eceef3");
    else badge(ctx, bx, mid, "⭐ Dùng sao", "#8a5a00", "#ffd76a");
    ry += h;
  });
  ctx.restore();
  y += thH + bodyH + 8 + 12;

  // ----- Kỷ luật (trễ ca, TikTok) -----
  for (const l of d.late || []) {
    ctx.fillStyle = C.badBg; rr(ctx, PAD, y, W - PAD * 2, 38, 10); ctx.fill();
    txt(ctx, "⚠️ " + l.name, PAD + 16, y + 26, "l", "600 20px " + FONT, C.bad); txt(ctx, sign(l.star) + " ⭐", W - PAD - 16, y + 26, "r", "800 21px " + FONT, C.bad);
    y += 46;
  }
  // ----- Bán thêm + DT -----
  ctx.fillStyle = "#fffbea"; rr(ctx, PAD, y, W - PAD * 2, 52, 12); ctx.fill(); ctx.strokeStyle = "#f2dc8a"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = "italic 600 21px " + FONT; const ext = d.extra ? `${d.extra}${d.extraStars ? ` (đề xuất ${fmt(d.extraStars)}⭐, chờ duyệt)` : ""}` : "Không có phát sinh trong ca";
  txt(ctx, "🎁 Bán thêm ngoài thi đua:", PAD + 16, y + 33, "l", "800 21px " + FONT, "#8a5a00");
  ctx.font = "500 21px " + FONT; txt(ctx, wrap(ctx, ext, 560, 1)[0], PAD + 300, y + 33, "l", "500 21px " + FONT, C.muted);
  txt(ctx, `💰 DT QĐ: ${d.revenue == null ? "—" : fmt(d.revenue, 2)}${d.unit ? " " + d.unit : ""}`, W - PAD - 16, y + 33, "r", "800 22px " + FONT, C.ink);
  y += 52 + 16;

  // ----- Tổng kết -----
  ctx.fillStyle = C.navy; rr(ctx, PAD, y, W - PAD * 2, footH, 18); ctx.fill();
  const plus = d.rows.reduce((a, r) => a + Math.max(0, Number(r.star) || 0), 0), minus = d.rows.reduce((a, r) => a + Math.min(0, Number(r.star) || 0), 0);
  const late = (d.late || []).reduce((a, l) => a + (Number(l.star) || 0), 0);
  const cells = [["KẾT QUẢ NGÀY", `ĐẠT ${d.okCount}/${d.rows.length} MÔN`, C.gold], ["THƯỞNG / TRỪ MÔN", null, null], ["KỶ LUẬT / TIKTOK", `${late ? sign(late) : "0"} ⭐`, late < 0 ? "#ff8a8a" : C.white], ["TỔNG SAO HÔM NAY", `${sign(d.dayChange)} ⭐`, d.dayChange >= 0 ? C.green : "#ff8a8a"]];
  const cw = (W - PAD * 2 - 250) / 4;
  cells.forEach(([l, v, col], i) => {
    const x = PAD + 20 + i * cw + cw / 2;
    txt(ctx, l, x, y + 48, "c", "700 17px " + FONT, "#aab0c8");
    if (v) txt(ctx, v, x, y + 92, "c", "800 28px " + FONT, col);
    else { ctx.font = "800 28px " + FONT; const a = "+" + fmt(plus), b = " | " + (minus ? fmt(minus) : "0"), wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, sx = x - (wa + wb) / 2;
      txt(ctx, a, sx, y + 92, "l", "800 28px " + FONT, C.green); txt(ctx, b, sx + wa, y + 92, "l", "800 28px " + FONT, "#ff8a8a"); }
  });
  const bxw = 230, bxx = W - PAD - 20 - bxw;
  ctx.fillStyle = C.navy2; rr(ctx, bxx, y + 18, bxw, footH - 36, 14); ctx.fill(); ctx.strokeStyle = "#3a4580"; ctx.lineWidth = 2; ctx.stroke();
  txt(ctx, "LŨY KẾ SAU CA", bxx + bxw / 2, y + 52, "c", "700 17px " + FONT, "#c9cde0");
  txt(ctx, `${fmt(d.total)} ⭐`, bxx + bxw / 2, y + 94, "c", "800 32px " + FONT, C.gold);
  txt(ctx, `H.QUA = thực đạt lần báo cáo trước${d.prevDay ? ` (${d.prevDay.slice(8, 10)}/${d.prevDay.slice(5, 7)})` : ""} · Chuỗi = số ngày liền chưa về số`, PAD + 4, H - PAD + 6, "l", "500 17px " + FONT, C.muted);
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

// Chia sẻ (điện thoại: mở bảng chia sẻ → Zalo/Line) hoặc tải về
export async function shareOrDownload(blob, fileName) {
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fileName }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "cancel"; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast("Đã tải ảnh về máy — mở Zalo/Line và gửi ảnh vừa tải");
  return "downloaded";
}
