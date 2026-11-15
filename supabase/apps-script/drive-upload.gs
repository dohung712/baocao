// Google Apps Script (chạy dưới tài khoản Google của chủ quản) — nhận file từ Edge Function "tasks" và lưu vào thư mục Drive.
// Cài đặt: Script properties → SECRET (mã bí mật, trùng DRIVE_UPLOAD_SECRET trong tool), FOLDER_ID (thư mục lưu).
// Triển khai: Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone.
const SECRET = 'ĐẶT_MÃ_BÍ_MẬT';
const FOLDER_ID = '176C0AxvgopmScYWcD1s_byyCzEgu2ArV';
function doPost(e) {
  try {
    const p = PropertiesService.getScriptProperties();
    const d = JSON.parse(e.postData.contents);
    if (!d.secret || d.secret !== (p.getProperty('SECRET') || SECRET)) return out({ ok: false, error: 'sai mã bí mật' });
    const root = DriveApp.getFolderById((p.getProperty('FOLDER_ID') || FOLDER_ID));
    if (d.action === 'delete') {
      (d.ids || []).forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) {} });
      return out({ ok: true });
    }
    let folder = root;
    if (d.sub) { const it = root.getFoldersByName(d.sub); folder = it.hasNext() ? it.next() : root.createFolder(d.sub); }
    const blob = Utilities.newBlob(Utilities.base64Decode(d.data), d.mime || 'application/octet-stream', d.name || 'file');
    const f = folder.createFile(blob);
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
    return out({ ok: true, id: f.getId(), url: f.getUrl(), name: f.getName(), size: f.getSize() });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}
function doGet() { return out({ ok: true, service: 'thidua-drive-upload' }); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
