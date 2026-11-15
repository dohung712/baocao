// Xuất ảnh báo cáo ngày (PNG) để nhân viên lưu / gửi qua Zalo, Line
import { fmt, sign, toast } from "./ui.js";

const W = 1080, PAD = 48;
const C = { brand: "#0f3d2e", brand2: "#1f6b4f", ink: "#14201b", muted: "#64706b", line: "#e3e8e5", ok: "#15803d", okBg: "#e8f6ee", bad: "#b42318", badBg: "#fdecea", info: "#1d4ed8", infoBg: "#e8efff", star: "#b7791f", bg: "#f4f6f5", zebra: "#fafbfa" };

function wrap(ctx, text, max) {
  const words = String(text).split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines.slice(0, 2);
}
function pill(ctx, x, y, text, fg, bg, align = "left") {
  ctx.font = "700 24px " + FONT; const w = ctx.measureText(text).width + 28, h = 40, x0 = align === "right" ? x - w : x;
  ctx.fillStyle = bg; round(ctx, x0, y - 29, w, h, 20); ctx.fill(); ctx.fillStyle = fg; ctx.fillText(text, x0 + 14, y); return w;
}
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const FONT = '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif';

// d: { store, name, id, dept, dateLabel, rows:[{name, actual, target, rate, star, status, comp}], late:[{name, star}], dayChange, total, revenue, unit, extra, okCount }
export async function reportPng(d) {
  try { await document.fonts?.ready; } catch { /* bỏ qua */ }
  const rowH = 92, headH = 300, kpiH = 150, foot = 110;
  const extraH = (d.late?.length || 0) * 64 + (d.extra ? 70 : 0);
  const H = headH + kpiH + 70 + d.rows.length * rowH + extraH + foot;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // Đầu trang
  const g = ctx.createLinearGradient(0, 0, W, headH); g.addColorStop(0, C.brand); g.addColorStop(1, C.brand2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "600 28px " + FONT; ctx.fillText("⚡ " + (d.store || "Thi Đua & BXH"), PAD, 70);
  ctx.fillStyle = "#fff"; ctx.font = "800 54px " + FONT; ctx.fillText("BÁO CÁO THI ĐUA", PAD, 146);
  ctx.font = "700 38px " + FONT; ctx.fillText(d.name, PAD, 210);
  ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "500 28px " + FONT; ctx.fillText(`${d.dept ? d.dept + " · " : ""}Mã ${d.id} · ${d.dateLabel}`, PAD, 258);
  // KPI
  const ky = headH - 34, kw = (W - PAD * 2 - 36) / 4;
  const kpis = [["Về số", `${d.okCount}/${d.rows.length}`, C.ok], ["Sao ca", sign(d.dayChange) + "⭐", d.dayChange >= 0 ? C.ok : C.bad], ["Tổng sao", fmt(d.total) + "⭐", C.star], ["DT QĐ", d.revenue == null ? "—" : fmt(d.revenue, 2), C.ink]];
  kpis.forEach(([l, v, col], i) => {
    const x = PAD + i * (kw + 12);
    ctx.fillStyle = "#fff"; round(ctx, x, ky, kw, kpiH - 20, 22); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.muted; ctx.font = "600 22px " + FONT; ctx.fillText(l.toUpperCase() + (i === 3 && d.unit ? ` (${d.unit})` : ""), x + 20, ky + 42);
    ctx.fillStyle = col; ctx.font = "800 40px " + FONT; ctx.fillText(v, x + 20, ky + 96);
  });
  // Bảng môn
  let y = headH + kpiH + 20;
  ctx.fillStyle = C.muted; ctx.font = "600 22px " + FONT;
  ctx.fillText("MÔN THI ĐUA", PAD, y + 10); ctx.textAlign = "right"; ctx.fillText("THỰC ĐẠT / TARGET", 700, y + 10); ctx.fillText("KẾT QUẢ", W - PAD, y + 10); ctx.textAlign = "left";
  y += 30;
  ctx.fillStyle = "#fff"; round(ctx, PAD - 16, y, W - PAD * 2 + 32, d.rows.length * rowH + 8, 22); ctx.fill();
  d.rows.forEach((r, i) => {
    const top = y + 4 + i * rowH, mid = top + rowH / 2;
    if (i % 2) { ctx.fillStyle = C.zebra; ctx.fillRect(PAD - 16, top, W - PAD * 2 + 32, rowH); }
    const okR = r.status === "Về số";
    ctx.fillStyle = okR ? C.ok : r.comp === "TANG_CA" ? C.info : r.star < 0 ? C.bad : C.muted;
    ctx.beginPath(); ctx.arc(PAD + 8, mid, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = "700 30px " + FONT;
    const lines = wrap(ctx, r.name, 420); lines.forEach((l, k) => ctx.fillText(l, PAD + 32, mid + 10 - (lines.length - 1) * 18 + k * 36));
    ctx.textAlign = "right"; ctx.font = "700 30px " + FONT; ctx.fillStyle = C.ink; ctx.fillText(fmt(r.actual, 2), 700, mid - 2);
    ctx.font = "500 22px " + FONT; ctx.fillStyle = C.muted; ctx.fillText(`/ ${fmt(r.target, 2)} · ${r.rate ?? 0}%`, 700, mid + 28); ctx.textAlign = "left";
    const label = okR ? (r.star ? sign(r.star) + "⭐" : "Về số") : r.comp === "TANG_CA" ? "Tăng ca" : r.star < 0 ? sign(r.star) + "⭐" : "Chưa đạt";
    pill(ctx, W - PAD, mid + 9, label, okR ? C.ok : r.comp === "TANG_CA" ? C.info : r.star < 0 ? C.bad : C.muted, okR ? C.okBg : r.comp === "TANG_CA" ? C.infoBg : r.star < 0 ? C.badBg : C.bg, "right");
  });
  y += d.rows.length * rowH + 28;
  for (const l of d.late || []) { ctx.fillStyle = C.badBg; round(ctx, PAD - 16, y, W - PAD * 2 + 32, 52, 16); ctx.fill(); ctx.fillStyle = C.bad; ctx.font = "600 24px " + FONT; ctx.fillText("⚠️ " + l.name + "  " + sign(l.star) + "⭐", PAD, y + 35); y += 64; }
  if (d.extra) { ctx.fillStyle = C.ink; ctx.font = "500 26px " + FONT; ctx.fillText("🎁 Bán thêm: " + wrap(ctx, d.extra, W - PAD * 2 - 200)[0], PAD, y + 36); y += 70; }
  ctx.fillStyle = C.muted; ctx.font = "500 22px " + FONT;
  ctx.fillText("Gửi lúc " + new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }), PAD, H - 44);
  ctx.textAlign = "right"; ctx.fillText("Thi Đua & BXH", W - PAD, H - 44); ctx.textAlign = "left";
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
