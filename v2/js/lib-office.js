// Đọc chữ trong file Word (.docx), Excel (.xlsx), PowerPoint (.pptx) ngay trên trình duyệt để AI tóm tắt (không cần thư viện ngoài)
async function unzip(buf, want) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  let eocd = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
  for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (!want(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(start, start + csize);
    try {
      if (method === 0) out[name] = dec.decode(data);
      else if (method === 8 && typeof DecompressionStream !== "undefined") out[name] = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    } catch { /* bỏ qua file lỗi */ }
  }
  return out;
}
const unxml = (s) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export async function officeText(file, max = 15000) {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (!["docx", "xlsx", "pptx"].includes(ext)) return "";
  const buf = await file.arrayBuffer();
  let text = "";
  if (ext === "docx") {
    const f = await unzip(buf, (n) => n === "word/document.xml");
    text = unxml((f["word/document.xml"] || "").replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t"));
  } else if (ext === "pptx") {
    const f = await unzip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    text = Object.keys(f).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))).map((k, i) => `[Slide ${i + 1}] ` + unxml(f[k].replace(/<\/a:p>/g, "\n"))).join("\n");
  } else {
    const f = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    const ss = [...(f["xl/sharedStrings.xml"] || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml(m[1]));
    for (const k of Object.keys(f).filter((x) => x.includes("worksheets")).sort().slice(0, 3)) {
      const rows = [...f[k].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 200).map((r) => [...r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map(([, a, b]) => {
        const v = (b.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? unxml(b); return /t="s"/.test(a) ? ss[Number(v)] ?? "" : unxml(String(v)); }).join(" | "));
      text += `[${k.replace(/^.*\//, "").replace(".xml", "")}]\n` + rows.join("\n") + "\n";
    }
  }
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
