// D18/D19 📸 Chụp ảnh cho Admin / Quản lý (chụp xong: điện thoại mở bảng chia sẻ Zalo…, máy tính tải PNG)
//  • Nút nổi 📸: đang xem 1 việc / báo cáo (hộp chi tiết) → chụp riêng phần báo cáo (bỏ nút bấm) để gửi lại NV;
//    không có hộp mở → chọn mục cần chụp (cả trang / từng mục / nhiều mục → nhiều ảnh)
//  • Nút 📸 nhỏ ở góc từng mục của trang: bấm là chụp đúng mục đó
//  • Ảnh Google Drive trong bản chụp lấy qua Edge Function imgproxy (Drive không cho chép ảnh trực tiếp)
import { sb, S, isManager, SUPABASE_URL, SUPABASE_KEY } from "./store.js";
import { toast, modal, esc } from "./ui.js";

const LIB = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
let libP = null, obs = null, tmr = null;
const loadLib = () => (libP ||= new Promise((res, rej) => {
  if (window.htmlToImage) return res(window.htmlToImage);
  const s = document.createElement("script"); s.src = LIB; s.async = true;
  s.onload = () => (window.htmlToImage ? res(window.htmlToImage) : rej(new Error("Không tải được công cụ chụp")));
  s.onerror = () => { libP = null; rej(new Error("Không tải được công cụ chụp (kiểm tra mạng)")); };
  document.head.appendChild(s);
}));
const ok = () => isManager() && !S.me?.viewAs;
const textOf = (el) => (el?.textContent || "").replace(/\s+/g, " ").replace(/📸/g, "").trim();

// ---------- tìm các mục của trang ----------
function sections() {
  const root = document.getElementById("view"); if (!root) return [];
  const out = [];
  const heads = [...root.querySelectorAll(".td-h2")];
  if (heads.length) {   // trang Hôm nay: tiêu đề mục + các khối theo sau đến tiêu đề kế tiếp
    for (const h of heads) {
      const nodes = [h]; let n = h.nextElementSibling;
      while (n && !n.classList.contains("td-h2")) { nodes.push(n); n = n.nextElementSibling; }
      out.push({ title: textOf(h.querySelector("h2") || h).slice(0, 60), nodes, anchor: h });
    }
    return out;
  }
  for (const el of root.querySelectorAll(".card, .ag-sec, .gd-day, .av-card, .stats, .jb-board, .tbl-wrap, .gd-news")) {
    if (out.some((o) => o.nodes[0].contains(el)) || el.offsetHeight < 50) continue;
    const t = textOf(el.querySelector("h1, h2, h3, summary, b")) || "Mục " + (out.length + 1);
    out.push({ title: t.slice(0, 60), nodes: [el], anchor: el });
  }
  return out.slice(0, 40);
}

// ---------- chụp ----------
async function proxyImages(scope, restore) {
  const { data: { session } } = await sb.auth.getSession();
  const imgs = [...scope.querySelectorAll("img")].filter((i) => /drive\.google\.com\/thumbnail|googleusercontent/.test(i.src));
  await Promise.all(imgs.map(async (img) => {
    const id = (img.src.match(/[?&]id=([\w-]+)/) || [])[1]; if (!id) return;
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/imgproxy", { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (session?.access_token || "") }, body: JSON.stringify({ id, sz: 800 }) });
      if (!r.ok) return;
      // nhúng thẳng dữ liệu ảnh (data:) — đường dẫn blob: bị công cụ chụp gắn thêm tham số nên hỏng
      const blob = await r.blob(), url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      const old = img.src, oldLazy = img.loading;
      img.loading = "eager"; img.src = url; await img.decode().catch(() => {});
      restore.push(() => { img.src = old; img.loading = oldLazy; });
    } catch { /* ảnh này để trống */ }
  }));
}
const SKIP_REPORT = (n) => n.classList && (n.classList.contains("modal-actions") || n.classList.contains("jb-req") || n.id === "mgPush" || n.id === "jbMsg"
  || n.tagName === "BUTTON" || (n.tagName === "LABEL" && n.classList.contains("btn")) || (n.tagName === "INPUT" && n.type === "file") || n.tagName === "DETAILS" || (n.tagName === "TEXTAREA" && !n.value));

async function capture(nodes, { report = false } = {}) {
  const h2i = await loadLib();
  const restore = [];
  let target = nodes[0];
  try {
    if (nodes.length > 1) {   // gom nhiều khối liền nhau vào 1 khung tạm
      const w = document.createElement("div"); w.className = "snap-wrap";
      nodes[0].parentNode.insertBefore(w, nodes[0]);
      for (const n of nodes) w.appendChild(n);
      restore.push(() => { for (const n of nodes) w.parentNode.insertBefore(n, w); w.remove(); });
      target = w;
    }
    if (report) for (const el of [target, target.parentElement]) {
      if (!el) continue; const s = [el.style.maxHeight, el.style.overflow, el.style.height];
      el.style.maxHeight = "none"; el.style.overflow = "visible"; el.style.height = "auto";
      restore.push(() => { [el.style.maxHeight, el.style.overflow, el.style.height] = s; });
    }
    await proxyImages(target, restore);
    const bg = getComputedStyle(document.body).backgroundColor || "#fff";
    return await h2i.toBlob(target, { pixelRatio: Math.min(2, window.devicePixelRatio || 1.5), backgroundColor: bg, cacheBust: true, imagePlaceholder: PLACEHOLDER,
      filter: (n) => !(n.classList && (n.classList.contains("snap-btn") || n.classList.contains("snap-mini") || n.id === "wmark")) && !(report && SKIP_REPORT(n)) });
  } finally { for (const f of restore.reverse()) { try { f(); } catch { /* bỏ qua */ } } }
}
const fname = (tag) => { const d = new Date(Date.now() + 7 * 3600e3).toISOString(); return `thidua-${(tag || "trang").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^\w]+/g, "-").slice(0, 40)}-${d.slice(0, 10)}-${d.slice(11, 16).replace(":", "")}.png`; };
async function deliver(list) {   // list: [{blob, name}]
  const files = list.filter((x) => x.blob).map((x) => new File([x.blob], x.name, { type: "image/png" }));
  if (!files.length) throw new Error("Không chụp được");
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: "Thi Đua & BXH" }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  for (const f of files) { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  toast(files.length > 1 ? `Đã lưu ${files.length} ảnh` : "Đã lưu ảnh chụp", 2500);
}
async function run(btn, job) {
  const old = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try { await job(); } catch (e) { toast("⚠️ " + (e?.message || "Không chụp được"), 4000); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}

// Nút nổi: hộp chi tiết đang mở → chụp phần báo cáo; không thì chọn mục
async function onFloat(btn) {
  const m = document.getElementById("modal");
  if (m && !m.hidden) {
    const body = document.getElementById("modalBody");
    const title = textOf(body.querySelector("h3")) || "bao-cao";
    return run(btn, async () => deliver([{ blob: await capture([body], { report: true }), name: fname(title) }]));
  }
  const secs = sections(), page = (location.hash.slice(1).split("?")[0] || "trang");
  if (secs.length <= 1) return run(btn, async () => deliver([{ blob: await capture([document.getElementById("view")]), name: fname(page) }]));
  const v = await modal(`<h3>📸 Chụp mục nào?</h3><form class="stack snap-pick">
      <label class="inline"><input type="checkbox" name="all"> <b>📄 Cả trang</b> (1 ảnh dài)</label>
      ${secs.map((s, i) => `<label class="inline"><input type="checkbox" name="s${i}"> ${esc(s.title)}</label>`).join("")}
      <p class="tiny muted">Chọn nhiều mục → mỗi mục 1 ảnh. Mỗi mục trên trang cũng có nút 📸 nhỏ ở góc để chụp nhanh.</p></form>
    <div class="modal-actions"><button class="btn" data-v="cancel">Huỷ</button><button class="btn primary" data-v="submit">📸 Chụp</button></div>`);
  if (!v || typeof v !== "object") return;
  await new Promise((r) => setTimeout(r, 250));   // chờ đóng hộp chọn
  const pick = secs.filter((_, i) => v["s" + i] === "on");
  if (v.all !== "on" && !pick.length) return toast("Chưa chọn mục nào");
  await run(btn, async () => {
    const out = [];
    if (v.all === "on") out.push({ blob: await capture([document.getElementById("view")]), name: fname(page) });
    for (const s of pick) out.push({ blob: await capture(s.nodes), name: fname(s.title) });
    await deliver(out);
  });
}

// Nút 📸 nhỏ trên từng mục
function inject() {
  if (!ok()) return;
  for (const s of sections()) {
    const a = s.anchor;
    if ([...a.children].some((c) => c.classList.contains("snap-mini"))) continue;
    if (getComputedStyle(a).position === "static") a.style.position = "relative";
    const b = document.createElement("button");
    b.type = "button"; b.className = "snap-mini"; b.title = "Chụp mục này"; b.textContent = "📸";
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const cur = sections().find((x) => x.anchor === a) || s; run(b, async () => deliver([{ blob: await capture(cur.nodes), name: fname(cur.title) }])); };
    a.appendChild(b);
  }
}

export function initSnap() {
  let b = document.getElementById("snapBtn");
  if (!ok()) { b?.remove(); obs?.disconnect(); document.querySelectorAll(".snap-mini").forEach((x) => x.remove()); return; }
  if (!b) {
    b = document.createElement("button");
    b.id = "snapBtn"; b.type = "button"; b.className = "snap-btn"; b.title = "Chụp ảnh: hộp đang mở / chọn mục của trang"; b.textContent = "📸";
    b.onclick = () => onFloat(b);
    document.body.appendChild(b);
  }
  const view = document.getElementById("view");
  if (view && !obs) {
    obs = new MutationObserver(() => { clearTimeout(tmr); tmr = setTimeout(inject, 600); });
    obs.observe(view, { childList: true, subtree: true });
  }
  inject();
}
