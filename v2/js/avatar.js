// D21 🙂 Avatar nhân viên: tự gắn ảnh (hoặc chữ cái đầu tên trên nền màu riêng) trước tên ở mọi chỗ có mã NV
// (data-sid / data-sd: Hôm nay, Xếp hạng, Giao việc…). Bấm avatar của chính mình ở Hôm nay để đổi ảnh (cắt vuông, nén ~160px).
import { sb, S, rpc, errMsg, staffById, isManager } from "./store.js";
import { toast, modal, esc } from "./ui.js";

let map = new Map(), obs = null, raf = 0, loaded = false;
const COLORS = ["#17604a", "#2457a6", "#a23a72", "#b26a00", "#6b4fbf", "#0f6f7a", "#c0352b", "#4a5751", "#8a5a2b"];
const initials = (n) => { const p = String(n || "?").trim().split(/\s+/); return ((p.length > 1 ? p[p.length - 2][0] : "") + p[p.length - 1][0]).toUpperCase(); };
const colorOf = (id) => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

export async function loadAvatars() {
  const { data } = await sb.from("staff_avatars").select("staff_id,img");
  map = new Map((data || []).map((r) => [r.staff_id, r.img]));
  loaded = true;
}
export function avatarHtml(id, size = 32, cls = "") {
  const img = map.get(id), s = staffById(id);
  return img ? `<img class="av ${cls}" src="${img}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`
    : `<span class="av av-txt ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${colorOf(id)}">${esc(initials(s?.name || id))}</span>`;
}

// Gắn avatar trước tên ở các dòng có mã NV
function decorate() {
  const view = document.getElementById("view"); if (!view || !loaded) return;
  for (const el of view.querySelectorAll("[data-sid], [data-sd]")) {
    const id = el.dataset.sid || el.dataset.sd; if (!id || !staffById(id)) continue;
    if (el.querySelector(":scope .av-slot")) continue;
    const name = el.querySelector("b"); if (!name) continue;
    const big = el.classList.contains("td-who");
    const slot = document.createElement("span");
    slot.className = "av-slot" + (big ? " big" : "");
    slot.innerHTML = avatarHtml(id, big ? 52 : 30) + (big && id === S.me?.staff_id ? `<i class="av-cam" title="Đổi ảnh đại diện">📷</i>` : "");
    if (big && (id === S.me?.staff_id || isManager())) { slot.style.cursor = "pointer"; slot.title = "Đổi ảnh đại diện"; slot.addEventListener("click", (e) => { e.stopPropagation(); pickAvatar(id); }); }
    if (big) el.insertBefore(slot, el.firstChild); else name.parentElement.insertBefore(slot, name);
  }
}
function refresh() { document.querySelectorAll(".av-slot").forEach((x) => x.remove()); decorate(); }

// Chọn ảnh → cắt vuông giữa ảnh → 160×160 JPEG
async function squash(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height), c = document.createElement("canvas"); c.width = c.height = 160;
  c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
  bmp.close?.();
  let q = 0.85, url = c.toDataURL("image/jpeg", q);
  while (url.length > 70000 && q > 0.4) { q -= 0.1; url = c.toDataURL("image/jpeg", q); }
  return url;
}
export async function pickAvatar(id) {
  const s = staffById(id), has = map.has(id);
  const v = await modal(`<h3>🙂 Ảnh đại diện · ${esc(s?.name || id)}</h3>
    <div style="display:flex;gap:14px;align-items:center;margin:6px 0 10px"><span id="avPrev">${avatarHtml(id, 84)}</span>
      <div class="small muted">Ảnh vuông, hiện cạnh tên ở Hôm nay, Xếp hạng, Giao việc. Chọn ảnh rõ mặt, tool tự cắt giữa ảnh và nén nhỏ.</div></div>
    <div class="row"><label class="btn primary">🖼️ Chọn ảnh<input type="file" accept="image/*" id="avFile" hidden></label><label class="btn">📷 Chụp<input type="file" accept="image/*" capture="user" id="avCam" hidden></label>
      ${has ? `<button class="btn ghost danger" type="button" id="avDel">Gỡ ảnh</button>` : ""}<span class="small" id="avMsg"></span></div>
    <div class="modal-actions"><button class="btn" data-v="cancel">Xong</button></div>`, {
    onOpen(body) {
      const msg = (t) => { body.querySelector("#avMsg").textContent = t; };
      const up = async (f) => {
        if (!f) return;
        try { msg("Đang lưu…"); const url = await squash(f); await rpc("avatar_set", { p_staff: id, p_img: url }); map.set(id, url); body.querySelector("#avPrev").innerHTML = avatarHtml(id, 84); msg("✅ Đã lưu"); refresh(); }
        catch (x) { msg("⚠️ " + errMsg(x)); }
      };
      body.querySelector("#avFile").onchange = (e) => up(e.target.files?.[0]);
      body.querySelector("#avCam").onchange = (e) => up(e.target.files?.[0]);
      body.querySelector("#avDel")?.addEventListener("click", async () => { try { await rpc("avatar_set", { p_staff: id, p_img: "" }); map.delete(id); body.querySelector("#avPrev").innerHTML = avatarHtml(id, 84); msg("Đã gỡ ảnh"); refresh(); } catch (x) { msg("⚠️ " + errMsg(x)); } });
    },
  });
  return v;
}

export async function initAvatars() {
  try { await loadAvatars(); } catch { loaded = true; }
  const view = document.getElementById("view");
  if (view && !obs) {
    obs = new MutationObserver((ms) => { if (ms.every((m) => [...m.addedNodes].every((n) => n.classList?.contains("av-slot") || n.nodeType === 3))) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(decorate); });
    obs.observe(view, { childList: true, subtree: true });
  }
  decorate();
}
