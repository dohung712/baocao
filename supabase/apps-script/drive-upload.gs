// Google Apps Script (chạy dưới tài khoản Google của chủ quản) — nhận yêu cầu từ Edge Function "tasks" / "notify" và làm việc với Google Drive.
// BẢN 2 (D12 Bảng việc): lưu ảnh theo đường dẫn nhiều cấp, lấy file lịch ca mới nhất, ghi trang tính.
// BẢN 3 (B16 Số liệu BI): liệt kê file trong thư mục (list), lấy nội dung 1 file nằm trong thư mục đó (get).
// BẢN 4 (D13 Việc lặp lại): đọc trang tính công việc (sheet_read).
//
// Cài đặt / cập nhật:
//   1. Mở dự án Apps Script đang dùng (địa chỉ = DRIVE_UPLOAD_URL), dán đè toàn bộ file này, bấm Lưu.
//   2. Script properties (Project Settings → Script properties): SECRET (trùng DRIVE_UPLOAD_SECRET trong tool), FOLDER_ID (thư mục gốc).
//   3. Deploy → Manage deployments → bút chì (Edit) → Version: New version → Deploy (GIỮ NGUYÊN địa chỉ web app).
//      Lần đầu chạy bản 2, Google hỏi cấp quyền mới (Drive + Google Sheets): chọn tài khoản → Advanced → Go to … → Allow.
//   Web app: Execute as: Me · Who has access: Anyone.
const SECRET = 'ĐẶT_MÃ_BÍ_MẬT';
const FOLDER_ID = '176C0AxvgopmScYWcD1s_byyCzEgu2ArV';
const VERSION = 4;

function doPost(e) {
  try {
    const p = PropertiesService.getScriptProperties();
    const d = JSON.parse(e.postData.contents);
    if (!d.secret || d.secret !== (p.getProperty('SECRET') || SECRET)) return out({ ok: false, error: 'sai mã bí mật' });
    const root = DriveApp.getFolderById(p.getProperty('FOLDER_ID') || FOLDER_ID);

    if (d.action === 'delete') {
      (d.ids || []).forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) {} });
      return out({ ok: true, version: VERSION });
    }

    // Lịch ca: file Excel / CSV mới nhất trong thư mục (đường dẫn path). since = thời điểm file đã đọc lần trước → không gửi lại nội dung.
    if (d.action === 'latest') {
      const folder = walk(root, d.path || []).folder;
      const it = folder.getFiles(); let best = null;
      while (it.hasNext()) {
        const f = it.next(), n = f.getName().toLowerCase();
        if (!/\.(xlsx|xls|csv)$/.test(n)) continue;
        if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
      }
      if (!best) return out({ ok: true, version: VERSION, file: null, folder: { id: folder.getId(), url: folder.getUrl() } });
      const meta = { id: best.getId(), name: best.getName(), mime: best.getMimeType(), updated: best.getLastUpdated().toISOString() };
      const fresh = !d.since || meta.updated > d.since || meta.id !== d.since_id;
      return out({ ok: true, version: VERSION, file: meta, folder: { id: folder.getId(), url: folder.getUrl() },
        data: fresh ? Utilities.base64Encode(best.getBlob().getBytes()) : '' });
    }

    // Liệt kê file trong thư mục (mới sửa trước): [{id, name, mime, updated, size, url}]
    if (d.action === 'list') {
      const lf = walk(root, d.path || []).folder;
      const li = lf.getFiles(), files = [];
      while (li.hasNext()) {
        const x = li.next();
        files.push({ id: x.getId(), name: x.getName(), mime: x.getMimeType(), updated: x.getLastUpdated().toISOString(), size: x.getSize(), url: x.getUrl() });
      }
      files.sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
      return out({ ok: true, version: VERSION, folder: { id: lf.getId(), url: lf.getUrl() }, files: files.slice(0, d.limit || 300) });
    }

    // Lấy nội dung 1 file — chỉ khi file nằm trong thư mục path (không đọc được file ở chỗ khác)
    if (d.action === 'get') {
      const gf = walk(root, d.path || []).folder, file = DriveApp.getFileById(d.id), ps = file.getParents();
      let inside = false;
      while (ps.hasNext()) if (ps.next().getId() === gf.getId()) inside = true;
      if (!inside) return out({ ok: false, error: 'file không nằm trong thư mục được phép' });
      return out({ ok: true, version: VERSION, file: { id: file.getId(), name: file.getName(), mime: file.getMimeType(), updated: file.getLastUpdated().toISOString(), size: file.getSize(), url: file.getUrl() },
        data: Utilities.base64Encode(file.getBlob().getBytes()) });
    }

    // Đọc trang tính (bản 4 — D13 việc lặp lại): sheet = mã trang tính, tab = tên tab (trống = tab đầu) → giá trị hiển thị
    if (d.action === 'sheet_read') {
      const rs = SpreadsheetApp.openById(d.sheet), rt = d.tab ? rs.getSheetByName(d.tab) : rs.getSheets()[0];
      if (!rt) return out({ ok: false, error: 'không thấy tab ' + d.tab });
      return out({ ok: true, version: VERSION, title: rs.getName(), tab: rt.getName(), values: rt.getDataRange().getDisplayValues().slice(0, 500) });
    }

    // Ghi trang tính: tabs = [{name, rows: [[...], ...]}] — xoá nội dung cũ của tab rồi ghi lại
    if (d.action === 'sheet') {
      const ss = SpreadsheetApp.openById(d.sheet);
      (d.tabs || []).forEach(function (t) {
        const sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
        sh.clearContents();
        const rows = t.rows || [];
        if (rows.length) {
          const w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 1);
          sh.getRange(1, 1, rows.length, w).setValues(rows.map(function (r) { const x = r.slice(); while (x.length < w) x.push(''); return x; }));
          sh.setFrozenRows(1);
        }
      });
      return out({ ok: true, version: VERSION });
    }

    // Tải file lên: path = ["Tool Báo Cáo", "01 - Ảnh minh chứng công việc", "<Mã - Tên NV>", "<Hạng mục>"] (bản 1: sub = 1 thư mục con)
    const w = walk(root, Array.isArray(d.path) ? d.path : (d.sub ? [d.sub] : []));
    const blob = Utilities.newBlob(Utilities.base64Decode(d.data), d.mime || 'application/octet-stream', d.name || 'file');
    const f = w.folder.createFile(blob);
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
    return out({ ok: true, version: VERSION, id: f.getId(), url: f.getUrl(), name: f.getName(), size: f.getSize(), folders: w.folders });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}

// Đi theo đường dẫn tên thư mục, thiếu thì tạo; trả về thư mục cuối + danh sách {name, id, url}
function walk(root, path) {
  let folder = root; const folders = [];
  path.forEach(function (name) {
    name = String(name || '').trim(); if (!name) return;
    const it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
    folders.push({ name: name, id: folder.getId(), url: folder.getUrl() });
  });
  return { folder: folder, folders: folders };
}
// Chạy 1 lần trong trình soạn thảo (chọn hàm này → ▶ Chạy → Cho phép) để cấp quyền Google Sheets cho bản 4 (đọc trang tính việc lặp lại)
//   (màn hình xin quyền có ô chọn từng quyền: tick "Chọn tất cả" / Google Sheets)
function capQuyenTrangTinh() {
  const ss = SpreadsheetApp.create('Kiểm tra quyền (xoá được)');   // dùng thật quyền Google Sheets → Google hỏi đúng quyền còn thiếu
  DriveApp.getFileById(ss.getId()).setTrashed(true);
  Logger.log('Đã cấp quyền Google Sheets + Drive');
}
function doGet() { return out({ ok: true, service: 'thidua-drive-upload', version: VERSION }); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
