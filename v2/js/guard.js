// D18 bảo mật dữ liệu với Nhân viên (Admin / Quản lý không bị áp dụng):
//  • copy / cắt tối đa 500 ký tự mỗi lần (dài hơn → chỉ chép 500 ký tự đầu)
//  • in chìm tên + mã NV + giờ mờ chéo khắp màn hình → ảnh chụp màn hình lộ ra ai chụp (trình duyệt không chặn được nút chụp màn hình của máy)
//  • chặn in trang
import { S, staffById } from "./store.js";
import { toast } from "./ui.js";

const MAX = 500;
let bound = false, timer = null;
const isEmp = () => S.me?.role === "employee" && !S.me?.viewAs;

function selectedText() {
  const a = document.activeElement;
  if (a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /text|search|url|tel|email|number/.test(a.type || "text")))) {
    try { return String(a.value || "").slice(a.selectionStart || 0, a.selectionEnd || 0); } catch { return ""; }
  }
  return String(document.getSelection() || "");
}
function onCopy(e) {
  if (!isEmp()) return;
  const t = selectedText();
  if (t.length <= MAX) return;
  e.preventDefault();
  try { e.clipboardData.setData("text/plain", t.slice(0, MAX)); } catch { /* bỏ qua */ }
  if (e.type === "cut") return;
  toast(`Đã chép ${MAX} ký tự`, 1800);
}

function stamp() {
  const s = staffById(S.me?.staff_id), d = new Date(Date.now() + 7 * 3600e3).toISOString();
  return `${s?.name || S.me?.email?.split("@")[0] || ""} · ${S.me?.staff_id || ""} · ${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
function paintMark() {
  let el = document.getElementById("wmark");
  if (!isEmp()) { el?.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "wmark"; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); }
  const txt = stamp().replace(/[<&>"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="190"><text x="10" y="120" transform="rotate(-24 170 95)" font-family="sans-serif" font-size="15" fill="rgb(120,120,120)" fill-opacity="0.16">${txt}</text></svg>`;
  el.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

export function initGuard() {
  document.documentElement.classList.toggle("emp-guard", isEmp());
  if (!bound) { bound = true; document.addEventListener("copy", onCopy, true); document.addEventListener("cut", onCopy, true); }
  paintMark();
  clearInterval(timer);
  if (isEmp()) timer = setInterval(paintMark, 60000);
}
