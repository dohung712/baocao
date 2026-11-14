// Đọc bảng "Quản lý phân ca" dán từ HRM (giữ nguyên thuật toán đã dùng ổn định ở bản cũ)
// Trả về { ok, msg, days:[{label,date}], staff:[{hrmId,name,cells[ngày*6 ca]}], method, unique, check }
function bzNums(txt, max) {
  const out = [], re = /\d+(?:[.,]\d+)?/g; let m;
  while ((m = re.exec(txt)) && out.length < max) out.push(parseFloat(m[0].replace(',', '.')));
  return out;
}
function bzRowNums(text, labelRe, need) {
  const m = labelRe.exec(text);
  if (!m) return null;
  const arr = bzNums(text.slice(m.index + m[0].length), need);
  return arr.length === need ? arr : null;
}

// Dựng lại vị trí ca khi bản copy làm mất ô trống: duyệt từng cột (Ca) theo thời gian, dùng dòng
// "Nhân sự trong ca" (số người mỗi cột) + "Giờ công đã xếp ca" (giờ mỗi người) làm ràng buộc.
// Quy hoạch động có nhớ trạng thái (cột, vị trí con trỏ của từng NV) nên rất nhanh.
function bzSolve(emps, cnt, hrs, n) {
  const h = cnt.map((c, i) => c > 0 ? hrs[i] / c : -1);
  const E = emps.length, ptr = emps.map(() => 0), memo = new Map();
  const LIMIT = 600000;
  let aborted = false;
  const match = (e, c) => { const v = emps[e].values; return ptr[e] < v.length && cnt[c] > 0 && Math.abs(h[c] - v[ptr[e]]) < 1e-6; };
  function feasible(c) {
    for (let e = 0; e < E; e++) {
      const vals = emps[e].values; let j = c;
      for (let k = ptr[e]; k < vals.length; k++) {
        while (j < n && !(cnt[j] > 0 && Math.abs(h[j] - vals[k]) < 1e-6)) j++;
        if (j >= n) return false;
        j++;
      }
    }
    return true;
  }
  // liệt kê các tổ hợp NV làm ở cột c; fn(chosen) trả true để dừng
  function eachChoice(c, fn) {
    const elig = []; for (let e = 0; e < E; e++) if (match(e, c)) elig.push(e);
    const need = cnt[c]; if (elig.length < need) return false;
    const chosen = [];
    function comb(i) {
      if (chosen.length === need) return fn(chosen);
      if (elig.length - i < need - chosen.length) return false;
      chosen.push(elig[i]); if (comb(i + 1)) return true; chosen.pop();
      return comb(i + 1);
    }
    return comb(0);
  }
  function count(c) {
    if (aborted) return 0;
    const key = c + '|' + ptr.join(',');
    if (memo.has(key)) return memo.get(key);
    if (memo.size > LIMIT) { aborted = true; return 0; }
    let total = 0;
    if (c === n) total = ptr.every((p, i) => p === emps[i].values.length) ? 1 : 0;
    else if (feasible(c)) {
      eachChoice(c, ch => { ch.forEach(e => ptr[e]++); total += count(c + 1); ch.forEach(e => ptr[e]--); return total >= 2 || aborted; });
    }
    total = Math.min(total, 2);
    memo.set(key, total);
    return total;
  }
  const total = count(0);
  if (aborted || total === 0) return { sols: [], aborted };
  const pick = emps.map(() => []);
  for (let c = 0; c < n; c++) {
    let done = false;
    eachChoice(c, ch => {
      ch.forEach(e => ptr[e]++);
      const ok = count(c + 1) > 0;
      if (ok) { ch.forEach(e => pick[e].push(c)); done = true; return true; }
      ch.forEach(e => ptr[e]--);
      return false;
    });
    if (!done && cnt[c] > 0) return { sols: [], aborted: true };
  }
  return { sols: total === 1 ? [pick] : [pick, pick], aborted: false };
}

// ---- Đọc từ HTML của clipboard (giữ nguyên ô trống) ----
function bzCellsFromRow(row, n, nd) {
  const all = [row].concat(Array.from(row.querySelectorAll('*')));
  for (const D of all) {
    const k = D.children.length;
    if (k >= n && k <= n + 3) return Array.from(D.children).slice(k - n).map(x => x.textContent);
  }
  for (const D of all) { // ô được gom theo ngày: nd nhóm x 6 ca
    if (D.children.length === nd && Array.from(D.children).every(ch => ch.children.length === 6)) {
      const out = []; Array.from(D.children).forEach(ch => Array.from(ch.children).forEach(x => out.push(x.textContent)));
      return out;
    }
  }
  return null;
}
function bzParseHtmlStaff(html, n, nd) {
  if (!html || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const idRe = /^\s*(\d{4,8})\s*-\s*([^\d\s][^\t\n]*?)\s*$/;
  const leaves = Array.from(doc.body.querySelectorAll('*')).filter(el => el.children.length === 0 && idRe.test(el.textContent));
  if (!leaves.length) return null;
  const out = [];
  for (const lf of leaves) {
    const m = idRe.exec(lf.textContent);
    let row = lf, cells = null;
    while (row) {
      if (leaves.some(o => o !== lf && row.contains(o))) break;
      cells = bzCellsFromRow(row, n, nd);
      if (cells) break;
      row = row.parentElement;
    }
    if (!cells) return null;
    out.push({ hrmId: m[1], name: m[2].trim(), cells: cells.map(x => { const mm = /\d+(?:[.,]\d+)?/.exec(x); return mm ? parseFloat(mm[0].replace(',', '.')) : 0; }) });
  }
  return out;
}

function bzParseSchedule(text, html) {
  const res = { ok: false, msg: '', days: [], staff: [], method: '', unique: true, check: null };
  const t = String(text || '').replace(/\r/g, '');
  // ---- ngày trong tuần ----
  const sm = /Từ ngày[\s\S]{0,25}?(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  const sy = sm ? +sm[3] : new Date().getFullYear(), smo = sm ? +sm[2] : 0;
  const dre = /(T[2-7]|CN)\s*\((\d{1,2})\/(\d{1,2})\)/g; let m; const seen = {};
  while ((m = dre.exec(t)) && res.days.length < 7) {
    const key = m[2] + '/' + m[3]; if (seen[key]) continue; seen[key] = 1;
    const y = (smo && +m[3] < smo) ? sy + 1 : sy;
    res.days.push({ label: m[1], date: `${y}-${String(m[3]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` });
  }
  if (!res.days.length) { res.msg = 'Không thấy dòng ngày (VD: "T2 (05/10)"). Hãy copy cả phần tiêu đề bảng (từ chữ "Nhân viên").'; return res; }
  const nd = res.days.length, n = nd * 6;
  const cnt = bzRowNums(t, /(?:^|\n)[ \t]*Nhân sự trong ca/, n);
  const hrs = bzRowNums(t, /(?:^|\n)[ \t]*Giờ công đã xếp ca/, n);

  const finish = () => {
    if (hrs) { // đối chiếu tổng giờ từng cột với dòng "Giờ công đã xếp ca"
      let ok = 0; for (let c = 0; c < n; c++) if (Math.abs(res.staff.reduce((s2, st) => s2 + (st.cells[c] || 0), 0) - hrs[c]) < 0.01) ok++;
      res.check = { ok, total: n };
    }
    res.ok = true; return res;
  };

  // ---- chế độ 1: HTML của clipboard (giữ ô trống) ----
  const hs = bzParseHtmlStaff(html, n, nd);
  if (hs && hs.length) { res.method = 'html'; res.staff = hs; return finish(); }

  // ---- khối nhân viên theo văn bản ----
  const lines = t.split('\n'), emps = [];
  const empRe = /^(?:[^\t]*\t)*?\s*(\d{4,8})\s*-\s*([^\t]+?)\s*(?:\t(.*))?$/;
  const stopRe = /^\s*(KHỐI|CHÍNH SÁCH|NGHIỆP VỤ|KẾ TOÁN|NGÀNH HÀNG|Copyright)/;
  let cur = null;
  lines.forEach(line => {
    if (stopRe.test(line)) { cur = null; return; }
    if (/^\s*BP\s/.test(line)) { cur = null; return; }
    const em = empRe.exec(line);
    if (em && /^\d/.test(em[1])) { cur = { hrmId: em[1], name: em[2].trim(), rest: em[3] || '', body: [] }; emps.push(cur); return; }
    if (cur) cur.body.push(line);
  });
  if (!emps.length) { res.msg = 'Không thấy dòng nhân viên (VD: "18450 - Hùng").'; return res; }

  // ---- chế độ 2: văn bản có tab, giữ ô trống ----
  if (emps.every(e => e.rest.split('\t').length >= n)) {
    res.method = 'tab';
    emps.forEach(e => {
      const f = e.rest.split('\t'), cells = (f.length >= n + 1 ? f.slice(1, 1 + n) : f.slice(0, n)).map(x => parseFloat(String(x).replace(',', '.')) || 0);
      res.staff.push({ hrmId: e.hrmId, name: e.name, cells });
    });
    return finish();
  }

  // ---- chế độ 3: văn bản mất ô trống -> ước đoán bằng ràng buộc ----
  const parsed = emps.map(e => { const nums = bzNums(e.rest + ' \t ' + e.body.join(' \t '), 400); return { e, total: nums[0], values: nums.slice(1) }; });
  if (!cnt || !hrs) { res.msg = 'Bản copy không giữ ô trống và thiếu 2 dòng "Giờ công đã xếp ca" / "Nhân sự trong ca". Hãy copy cả phần tiêu đề bảng.'; return res; }
  const totalVals = parsed.reduce((s2, p) => s2 + p.values.length, 0), totalCnt = cnt.reduce((a, b) => a + b, 0);
  if (totalVals !== totalCnt) { res.msg = `Số ca của nhân viên đã dán (${totalVals}) không khớp dòng "Nhân sự trong ca" (${totalCnt}). Có thể thiếu nhân viên — hãy copy đủ toàn bộ bảng.`; return res; }
  const { sols, aborted } = bzSolve(parsed, cnt, hrs, n);
  if (!sols.length) { res.msg = aborted ? 'Bảng quá phức tạp để dựng lại vị trí ca tự động.' : 'Không dựng được vị trí ca từ dữ liệu đã dán (số liệu không khớp).'; return res; }
  res.method = 'guess'; res.unique = sols.length === 1;
  parsed.forEach((p, i) => {
    const cells = new Array(n).fill(0);
    p.values.forEach((v, k) => { cells[sols[0][i][k]] = v; });
    res.staff.push({ hrmId: p.e.hrmId, name: p.e.name, cells });
  });
  return finish();
}


export { bzParseSchedule as parseSchedule };
