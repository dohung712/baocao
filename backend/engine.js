// Compatibility engine: existing business rules, isolated per request.
export function createLegacy(snapshot) {
  const sheets = snapshot.sheets || (snapshot.sheets = {});
  const uploads = [], removed = [];
  class Range {
    constructor(sheet,r,c,n=1,m=1){Object.assign(this,{sheet,r,c,n,m});}
    getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>this.sheet.rows[this.r+i-1]?.[this.c+j-1]??""));}
    setValues(v){if(v.length!==this.n || v.some(r=>r.length!==this.m))throw Error("Sai kích thước dữ liệu");v.forEach((row,i)=>row.forEach((val,j)=>{while(this.sheet.rows.length<this.r+i)this.sheet.rows.push([]);this.sheet.rows[this.r+i-1][this.c+j-1]=val;}));return this;}
    getValue(){return this.getValues()[0][0];}
    setValue(v){return this.setValues([[v]]);}
    setNumberFormat(){return this;}
    clearContent(){return this.setValues(Array.from({length:this.n},()=>Array(this.m).fill("")));}
  }
  class Sheet {
    constructor(name){this.name=name;this.rows=sheets[name];}
    getLastRow(){let n=this.rows.length;while(n&&this.rows[n-1].every(v=>v===""||v==null))n--;return n;}
    getLastColumn(){return Math.max(1,...this.rows.map(r=>r.length));}
    getMaxColumns(){return Math.max(26,this.getLastColumn());}
    getRange(r,c,n=1,m=1){if(r<1||c<1||n<1||m<1)throw Error("Vùng dữ liệu không hợp lệ");return new Range(this,r,c,n,m);}
    appendRow(row){this.rows.push(row);return this;}
    deleteRow(r){this.rows.splice(r-1,1);}
    deleteRows(r,n){this.rows.splice(r-1,n);}
    insertColumnsAfter(){return this;}
    setFrozenRows(){return this;}
  }
  const workbook={getSheetByName:n=>sheets[n]?new Sheet(n):null,insertSheet:n=>{sheets[n]=[];return new Sheet(n);},getSpreadsheetTimeZone:()=>"Asia/Ho_Chi_Minh"};
  const SpreadsheetApp={openById:()=>workbook};
  const cache={get:()=>null,getAll:()=>({}),put(){},putAll(){},removeAll(){}};
  const CacheService={getScriptCache:()=>cache};
  const LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  const PropertiesService={getScriptProperties:()=>({getProperty:k=>k==="MANAGER_PIN"?"server-authorized":null,setProperty(){}})};
  const ContentService={MimeType:{JSON:"application/json"},createTextOutput:text=>({getContent:()=>text,setMimeType(){return this;}})};
  const Utilities={
    formatDate(value,tz,pattern){
      const d=new Date(value); if(!Number.isFinite(+d))return "";
      const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(d).map(p=>[p.type,p.value]));
      const t={yyyy:parts.year,MM:parts.month,dd:parts.day,HH:parts.hour,mm:parts.minute,ss:parts.second,d:String(Number(parts.day)),M:String(Number(parts.month))};
      return pattern.replace(/yyyy|MM|dd|HH|mm|ss|d|M/g,k=>t[k]);
    },
    base64Decode:s=>s,
    newBlob:(base64,mime,name)=>({base64,mime,name})
  };
  function fileObject(id){return {getId:()=>id,setSharing(){return this;},setTrashed(){removed.push(id);}};}
  const folder={getId:()=>"private-media",createFile:blob=>{const id="cf_"+crypto.randomUUID();uploads.push({id,...blob});return fileObject(id);}};
  const DriveApp={getFolderById:()=>folder,createFolder:()=>folder,getRootFolder:()=>folder,getFileById:fileObject,Access:{ANYONE_WITH_LINK:0},Permission:{VIEW:0}};
  const UrlFetchApp={fetch:()=>{throw Error("Dùng trợ lý báo cáo trong cổng mới để yêu cầu phân tích.");}};
var SPREADSHEET_ID = "1ECzgSqXPzfrpqYs3ffTaMwsN73jVpGbE5z18L-gGGzY"; // ID Google Sheet CSDL của bạn
var DEFAULT_TZ = "Asia/Ho_Chi_Minh";

var SH_NS = "DM_NhanSu";            // A Mã NV | B Tên | C Bộ phận | D Sao gốc | E Tổng sao | F Ngày reset chuỗi | G Môn riêng
var SH_TD = "DM_ThiDua";            // A Siêu thị | B Tên môn | C Target | D Sao thưởng | E Sao phạt | F X2
var SH_KQ = "Data_KetQua_Ngay";     // A Ngày | B Mã NV | C Tên NV | D Tên môn | E Thực đạt | F % | G Sao biến động | H Trạng thái | I Phương án
var SH_CFG = "CauHinh_QL";          // A Key | B Value
var SH_ST = "Data_ThiDua_SieuThi";
var SH_DX = "Data_DeXuat";          // A Ngày | B Mã NV | C Tên NV | D Nội dung | E Sao đề xuất | F Trạng thái
var SH_VS = "Data_VeSinh";          // A Ngày | B Mã NV | C Tên NV | D Ngày ĐK | E Giờ ĐK | F Ảnh 1 | G Ảnh 2 | H Ảnh 3 | I Ngày báo cáo | J Giờ báo cáo
// (Tuỳ chọn) ID thư mục Google Drive để lưu ảnh vệ sinh. Để trống = script tự tạo thư mục "KPI Sao - Anh Ve Sinh" trong Drive của bạn.
// Lấy ID: mở thư mục trên Drive, link dạng drive.google.com/drive/folders/<ID> -> dán phần <ID> vào đây.
var CLEAN_FOLDER_ID = "";
var SH_TT = "Data_TikTok";          // A Mã NV | B Tên NV | C Hạn nộp | D Link | E Ngày nộp | F Giờ nộp | G Trạng thái | H Sao thưởng

var STATUS_PENDING = "Chờ duyệt";
var STATUS_APPROVED = "Đã duyệt";
var STATUS_REJECTED = "Từ chối";
var CFG_LOCKED_KEY = "LOCKED_DATES";
var CFG_TT_START_KEY = "TIKTOK_START_DATE";

// Các action CHỈ Quản lý được dùng -> server kiểm MANAGER_PIN (Project Settings > Script properties > MANAGER_PIN).
// Chưa cài MANAGER_PIN thì giữ cách chạy cũ (không kiểm). SAVE_STORE_RAW_DATA cố ý KHÔNG nằm trong danh sách vì tab BXH Siêu Thị ai cũng dùng.
var MANAGER_ACTIONS = {
  AUTO_SAVE_SETTINGS: 1, UPDATE_STAFF_STARS: 1, APPROVE_EXTRA_PROPOSAL: 1, RESET_STREAK: 1, ASSIGN_SPECIFIC_ITEMS: 1,
  DELETE_SINGLE_LOG_RECORD: 1, DELETE_STAFF_DAILY_REPORTS: 1, DELETE_STAFF: 1,
  DELETE_CLEAN: 1, DELETE_TIKTOK: 1, EXCUSE_TIKTOK: 1, DELETE_BUSY: 1, DELETE_RS: 1, ASSIGN_RS: 1, NOTE_REVIEW: 1, HIDE_STAFF: 1
};
var PIN_ERR_MSG = "Sai mật khẩu Quản lý (MANAGER_PIN)!";

// =====================================================================
// ENTRY POINTS
// =====================================================================
function doGet(e) {
  // Luôn trả JSON, kể cả khi lỗi: trang lỗi HTML của Google không có CORS nên trình duyệt chỉ báo "Failed to fetch"
  try {
    if (e && e.parameter && e.parameter.action === "notes") return handleFetchNotesCached();   // tab Nội dung quan trọng (tải riêng cho nhẹ)
    if (e && e.parameter && e.parameter.action === "verify") return handleVerifyReport(e.parameter);   // kiểm tra nhanh báo cáo 1 người (không đọc cả 10 sheet)
    return handleFetchAllDataCached();
  } catch (err) {
    var stack = (err && err.stack) ? String(err.stack).split("\n").slice(0, 3).join(" | ") : "";
    return createJsonResponse({ status: "error", message: "Apps Script lỗi: " + err + (stack ? " [" + stack + "]" : "") });
  }
}

function doPost(e) {
  // Phân loại nội dung bằng AI mất vài giây và KHÔNG ghi dữ liệu -> không giữ khóa để người khác vẫn gửi báo cáo bình thường
  try {
    var head = String(e.postData.contents).substring(0, 120);
    if (head.indexOf("\"VERIFY_MANAGER\"") >= 0) return handleVerifyManager(JSON.parse(e.postData.contents));   // chỉ đọc, không cần khóa
    if (head.indexOf("\"CLASSIFY_NOTE\"") >= 0) {
      var cn = JSON.parse(e.postData.contents);
      if (!notePinOk(cn)) return createJsonResponse({ status: "error", message: PIN_ERR_MSG });
      return handleClassifyNote(cn);
    }
  } catch (peekErr) { return createJsonResponse({ status: "error", message: "Không xử lý được yêu cầu: " + peekErr }); }
  // Khóa toàn script: 2 nhân viên gửi cùng lúc không được ghi đè / xóa nhầm dòng của nhau
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return createJsonResponse({ status: "error", message: "Hệ thống đang bận, vui lòng thử lại sau vài giây!" });
  }

  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (MANAGER_ACTIONS[action] && !notePinOk(data)) return createJsonResponse({ status: "error", message: PIN_ERR_MSG });

    if (action === "SUBMIT_DAILY_BATCH") return handleSubmitDailyBatch(data);
    if (action === "AUTO_SAVE_SETTINGS") return handleAutoSaveSettings(data);
    if (action === "UPDATE_STAFF_STARS") return handleUpdateStaffStars(data);
    if (action === "APPROVE_EXTRA_PROPOSAL") return handleApproveExtraProposal(data);
    if (action === "RESET_STREAK") return handleResetStreak(data);
    if (action === "ASSIGN_SPECIFIC_ITEMS") return handleAssignSpecificItems(data);
    if (action === "SAVE_STORE_RAW_DATA") return handleSaveStoreRawData(data);
    if (action === "DELETE_SINGLE_LOG_RECORD") return handleDeleteSingleLog(data);
    if (action === "DELETE_STAFF_DAILY_REPORTS") return handleDeleteStaffDailyReports(data);
    if (action === "DELETE_STAFF") return handleDeleteStaff(data);
    if (action === "HIDE_STAFF") return handleHideStaff(data);
    if (action === "REGISTER_CLEAN") return handleRegisterClean(data);
    if (action === "UPLOAD_CLEAN_PHOTOS") return handleUploadClean(data);
    if (action === "DELETE_CLEAN") return handleDeleteClean(data);
    if (action === "SUBMIT_TIKTOK_LINK") return handleSubmitTiktok(data);
    if (action === "DELETE_TIKTOK") return handleDeleteTiktok(data);
    if (action === "EXCUSE_TIKTOK") return handleExcuseTiktok(data);
    if (action === "REGISTER_BUSY") return handleRegisterBusy(data);
    if (action === "DELETE_BUSY") return handleDeleteBusy(data);
    if (action === "REGISTER_RS") return handleRegisterRs(data);
    if (action === "UPLOAD_RS_PHOTOS") return handleUploadRs(data);
    if (action === "DELETE_RS") return handleDeleteRs(data);
    if (action === "ASSIGN_RS") return handleAssignRs(data);
    if (action === "POST_NOTE") return handlePostNote(data);
    if (action === "UPDATE_NOTE") return handleUpdateNote(data);
    if (action === "DELETE_NOTE") return handleDeleteNote(data);
    if (action === "NOTE_OPEN") return handleNoteOpen(data);
    if (action === "NOTE_CONFIRM") return handleNoteConfirm(data);
    if (action === "NOTE_SUBMIT") return handleNoteSubmit(data);
    if (action === "NOTE_REVIEW") return handleNoteReview(data);

    return createJsonResponse({ status: "error", message: "Action không hợp lệ" });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  } finally {
    try { cacheClearAll(); } catch (ce) {}   // dữ liệu vừa đổi -> bỏ cache TRƯỚC khi nhả khóa để máy khác đọc lại bản mới
    lock.releaseLock();
  }
}

// =====================================================================
// CACHE DỮ LIỆU (tăng tốc + mọi máy nhận cùng 1 bản)
//  - Mỗi lần doGet đọc cả 9 sheet -> chậm. Lưu JSON vào CacheService (chia mảnh vì giới hạn 100KB/khóa).
//  - Mọi thao tác ghi (doPost) xóa cache ngay. Sửa tay trong Google Sheet thì cache tự hết hạn sau CACHE_TTL giây.
//  - Khi cache trống, doGet lấy khóa để KHÔNG đọc giữa chừng lúc doPost đang xóa/ghi dòng (nguyên nhân lệch dữ liệu).
// =====================================================================
// Đổi số này mỗi lần sửa Code.gs + Deploy -> app hiển thị "Máy chủ: vX" để biết Apps Script đã được Deploy bản mới chưa
var SERVER_VERSION = "2026-10-13 · v17";
var CACHE_TTL = 90;
var CACHE_CHUNK = 90000;
var CACHE_PREFIX = "ALLDATA_";

function cacheGetAll() {
  var c = CacheService.getScriptCache();
  var meta = c.get(CACHE_PREFIX + "meta");
  if (!meta) return null;
  var n = Number(meta); if (!n) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push(CACHE_PREFIX + i);
  var got = c.getAll(keys), out = "";
  for (var j = 0; j < n; j++) { var part = got[CACHE_PREFIX + j]; if (part === undefined || part === null) return null; out += part; }
  return out;
}
function cachePutAll(str) {
  try {
    var c = CacheService.getScriptCache(), obj = {}, n = 0;
    for (var i = 0; i < str.length; i += CACHE_CHUNK) { obj[CACHE_PREFIX + n] = str.substring(i, i + CACHE_CHUNK); n++; }
    obj[CACHE_PREFIX + "meta"] = String(n);
    c.putAll(obj, CACHE_TTL);
  } catch (e) { console.error("cachePutAll: " + e); }  // lỗi cache không được làm hỏng doGet
}
function cacheClearAll() {
  var c = CacheService.getScriptCache();
  var meta = Number(c.get(CACHE_PREFIX + "meta")) || 0;
  var keys = [CACHE_PREFIX + "meta"];
  for (var i = 0; i < Math.max(meta, 30); i++) keys.push(CACHE_PREFIX + i);
  c.removeAll(keys);
  cacheBigClear("NOTES_");
}

function handleFetchAllDataCached() {
  var hit = cacheGetAll();
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return handleFetchAllData(); }   // quá bận: vẫn đọc trực tiếp, không cache
  try {
    hit = cacheGetAll();                                                      // người khác vừa nạp xong trong lúc chờ khóa
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    var out = handleFetchAllData().getContent();
    cachePutAll(out);
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}

// =====================================================================
// HÀM DÙNG CHUNG
// =====================================================================
var _TZ = null;
function tz() {
  if (!_TZ) {
    try { _TZ = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone(); } catch (e) {}
    _TZ = _TZ || DEFAULT_TZ;
  }
  return _TZ;
}

function pad2(n) { return ("0" + n).slice(-2); }

// Chuẩn hóa MỌI kiểu ngày về "yyyy-MM-dd".
// Google Sheets tự đổi chuỗi "2026-09-30" thành kiểu Date -> String(Date) làm app so sánh ngày bị sai.
function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz(), "yyyy-MM-dd");
  var s = String(v === null || v === undefined ? "" : v).trim();
  if (s === "") return "";
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + pad2(m[2]) + "-" + pad2(m[1]);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz(), "yyyy-MM-dd");
  return s;
}

// Tên cấu hình hiển thị TIẾNG VIỆT ở cột A của sheet CauHinh_QL.
// Code vẫn dùng key tiếng Anh bên trong; hai hàm dưới tự dịch qua lại nên sheet cũ (key tiếng Anh) vẫn chạy bình thường.
var CFG_LABELS = {
  STREAK_OVERTIME: "Chuỗi ngày được tăng ca",
  STREAK_PENALTY_STAR: "Chuỗi ngày bị trừ sao",
  STREAK_ALERT_EMAIL: "Chuỗi ngày báo mail khẩn",
  MANAGER_EMAIL: "Email quản lý",
  AUTO_STREAK_ENABLED: "Tự động tính chuỗi",
  DOUBLE_BONUS_RATE: "Tỷ lệ thưởng nhân đôi X2 (%)",
  ALLOW_STAFF_EDIT_STREAK: "Cho phép nhân viên sửa chuỗi",
  LOCKED_DATES: "Ngày đã khóa chốt sổ",
  TIKTOK_START_DATE: "Ngày bắt đầu tính TikTok",
  VESINH_START_DATE: "Ngày bắt đầu tính vệ sinh",
  HIDDEN_TABS: "Các tab đang ẩn",
  TIKTOK_REWARD: "Sao thưởng link TikTok đúng hạn",
  TIKTOK_PENALTY: "Sao phạt link TikTok trễ mỗi ngày",
  TIKTOK_MIN_LINKS: "Số link TikTok tối thiểu",
  ITEM_RULES: "Quy tắc riêng từng môn",
  PEN_T2_MIN: "Phạt lũy tiến - chuỗi bắt đầu bậc 2",
  PEN_T3_MIN: "Phạt lũy tiến - chuỗi bắt đầu bậc 3",
  PEN_T4_MIN: "Phạt lũy tiến - chuỗi bắt đầu bậc 4",
  PEN_M1: "Phạt lũy tiến - hệ số bậc 1",
  PEN_M2: "Phạt lũy tiến - hệ số bậc 2",
  PEN_M3: "Phạt lũy tiến - hệ số bậc 3",
  PEN_M4: "Phạt lũy tiến - hệ số bậc 4"
};
var CFG_KEY_BY_LABEL = {};
(function () { for (var k in CFG_LABELS) CFG_KEY_BY_LABEL[CFG_LABELS[k]] = k; })();
function cfgKeyFromCell(v) {              // ô cột A (tiếng Việt hoặc key cũ) -> key nội bộ
  var t = String(v === null || v === undefined ? "" : v).trim();
  return CFG_KEY_BY_LABEL[t] || t;
}
function cfgCellFromKey(key) {            // key nội bộ -> chữ ghi ở cột A
  return CFG_LABELS[key] || key;
}
// Đổi các dòng key tiếng Anh cũ sang tiếng Việt, gộp dòng trùng (giữ dòng cuối - đúng với cách app đang đọc)
function migrateCfgLabels(ss) {
  var sh = ss.getSheetByName(SH_CFG);
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var colA = sh.getRange(2, 1, n, 1).getValues();
  var seen = {}, dupRows = [], changed = false;
  for (var i = 0; i < n; i++) {
    var raw = String(colA[i][0] === null ? "" : colA[i][0]).trim();
    if (!raw) continue;
    var key = cfgKeyFromCell(raw);
    var label = cfgCellFromKey(key);
    if (raw !== label) { colA[i][0] = label; changed = true; }
    if (seen[key]) dupRows.push(seen[key]);  // dòng trước bị trùng -> xóa
    seen[key] = i + 2;
  }
  if (changed) sh.getRange(2, 1, n, 1).setValues(colA);
  if (sh.getRange(1, 1).getValue() !== "Tên Cấu Hình") sh.getRange(1, 1, 1, 2).setValues([["Tên Cấu Hình", "Giá Trị"]]);
  dupRows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}

// Các key cấu hình là SỐ (ngưỡng, hệ số, mức sao...). Gõ "1.5" vào Sheets kiểu Việt bị đổi thành ngày 01/05
// -> đọc lại phải khôi phục về số 1.5, nếu không app tự rơi về mặc định.
var CFG_NUMERIC_RE = /^(STREAK_|DOUBLE_BONUS_RATE|PEN_|TIKTOK_REWARD|TIKTOK_PENALTY|TIKTOK_MIN_LINKS)/;
function normCfgValue(key, v) {
  if (!CFG_NUMERIC_RE.test(key)) return v;
  if (v instanceof Date) {
    var d = Number(Utilities.formatDate(v, tz(), "d"));
    var m = Number(Utilities.formatDate(v, tz(), "M"));
    return Number(d + "." + m);          // 01/05 -> 1.5 ; 02/05 -> 2.5
  }
  if (typeof v === "string" && /^-?\d+([.,]\d+)?$/.test(v.trim())) return Number(v.trim().replace(",", "."));
  return v;
}

function todayStr() {
  return Utilities.formatDate(new Date(), tz(), "yyyy-MM-dd");
}

// "100%" ghi vào Sheet bị đổi thành số 1 (=100%) -> đọc lại phải đổi về "100%"
function normRate(v) {
  if (typeof v === "number") return Math.round(v * 100) + "%";
  return String(v === null || v === undefined ? "" : v);
}

// Đọc dữ liệu an toàn: getRange vượt quá số cột thật của sheet sẽ văng lỗi làm doGet chết -> giới hạn theo getMaxColumns và bù ô trống
function readRows(sh, nCols) {
  if (!sh || sh.getLastRow() < 2) return [];
  var cols = Math.min(nCols, sh.getMaxColumns());
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues();
  if (cols < nCols) {
    vals = vals.map(function (r) { while (r.length < nCols) r.push(""); return r; });
  }
  return vals;
}

function getOrCreateSheet(ss, name, headerRow) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headerRow) sh.appendRow(headerRow);
  } else if (headerRow && sh.getMaxColumns() < headerRow.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headerRow.length - sh.getMaxColumns());
  }
  return sh;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------
// Đọc Data_KetQua_Ngay (đã chuẩn hóa ngày / % ) kèm số dòng thật trong sheet
// ---------------------------------------------------------------------
function readKQ(ss) {
  var sh = ss.getSheetByName(SH_KQ);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, 9);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    out.push({
      row: i + 2,
      date: normDate(r[0]),
      staffId: String(r[1]),
      staffName: String(r[2]),
      itemName: String(r[3]),
      actual: Number(r[4]) || 0,
      rate: normRate(r[5]),
      starChange: Number(r[6]) || 0,
      status: String(r[7]),
      compensation: String(r[8] || "DUNG_SAO")
    });
  }
  return out;
}

// Xóa các dòng KQ thỏa điều kiện (xóa theo cụm liên tiếp cho nhanh). Trả về số dòng đã xóa.
function deleteKQRows(ss, predicate, onlyFirst) {
  var sh = ss.getSheetByName(SH_KQ);
  if (!sh) return 0;
  var rows = readKQ(ss);
  var toDelete = [];
  for (var i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) {
      toDelete.push(rows[i].row);
      if (onlyFirst) break;
    }
  }
  toDelete.sort(function (a, b) { return b - a; });
  var i2 = 0;
  while (i2 < toDelete.length) {
    var start = toDelete[i2], count = 1;
    while (i2 + count < toDelete.length && toDelete[i2 + count] === start - count) count++;
    sh.deleteRows(start - count + 1, count);
    i2 += count;
  }
  return toDelete.length;
}

// ---- Đường nhanh cho "Gửi báo cáo cuối ngày" (Data_KetQua_Ngay có thể lên hàng chục nghìn dòng: không đọc đủ 9 cột nhiều lần) ----
function kqDeleteStaffDay(ss, dateStr, staffId) {
  var sh = ss.getSheetByName(SH_KQ);
  if (!sh || sh.getLastRow() < 2) return 0;
  var ab = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues(), rows = [];
  for (var i = 0; i < ab.length; i++) if (String(ab[i][1]) === staffId && normDate(ab[i][0]) === dateStr) rows.push(i + 2);
  rows.sort(function (a, b) { return b - a; });
  var k = 0;
  while (k < rows.length) {
    var start = rows[k], count = 1;
    while (k + count < rows.length && rows[k + count] === start - count) count++;
    sh.deleteRows(start - count + 1, count);
    k += count;
  }
  return rows.length;
}
// Tổng sao biến động của 1 nhân viên (= computeDeltaMap nhưng chỉ đọc cột B, G của Data_KetQua_Ngay)
function computeStaffDeltaMap(ss, staffId) {
  var sid = String(staffId), sum = 0, sh = ss.getSheetByName(SH_KQ), map = {};
  if (sh && sh.getLastRow() >= 2 && sh.getMaxColumns() >= 7) {
    var n = sh.getLastRow() - 1, ids = sh.getRange(2, 2, n, 1).getValues(), sc = sh.getRange(2, 7, n, 1).getValues();
    for (var i = 0; i < n; i++) if (String(ids[i][0]) === sid) sum += Number(sc[i][0]) || 0;
  }
  readDeXuat(ss).forEach(function (d) { if (d.status === STATUS_APPROVED && d.staffId === sid) sum += d.starsProposed; });
  readTikTok(ss).forEach(function (t) { if (t.staffId === sid) sum += t.reward; });
  map[sid] = sum;
  return map;
}
// App gọi sau khi gửi để kiểm tra "Sheet đã ghi đủ chưa": chỉ trả các dòng của đúng nhân viên + ngày
function handleVerifyReport(p) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID), sh = ss.getSheetByName(SH_KQ);
  var staffId = String(p.staffId || ""), date = normDate(p.date), rows = [];
  if (sh && sh.getLastRow() >= 2 && staffId && date) {
    var n = sh.getLastRow() - 1, ab = sh.getRange(2, 1, n, 2).getValues(), first = -1, last = -1;
    for (var i = 0; i < n; i++) if (String(ab[i][1]) === staffId && normDate(ab[i][0]) === date) { if (first < 0) first = i; last = i; }
    if (first >= 0) {
      sh.getRange(first + 2, 1, last - first + 1, Math.min(9, sh.getMaxColumns())).getValues().forEach(function (r) {
        if (String(r[1]) === staffId && normDate(r[0]) === date) rows.push({ date: date, staffId: staffId, itemName: String(r[3]), actual: Number(r[4]) || 0, starChange: Number(r[6]) || 0, status: String(r[7]), compensation: String(r[8] || "DUNG_SAO") });
      });
    }
  }
  return createJsonResponse({ status: "success", rows: rows });
}

function readDeXuat(ss) {
  var sh = ss.getSheetByName(SH_DX);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, 6);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] && !r[1]) continue;
    out.push({
      rowIdx: i + 2,
      date: normDate(r[0]),
      staffId: String(r[1]),
      staffName: String(r[2]),
      content: String(r[3]),
      starsProposed: Number(r[4]) || 0,
      status: String(r[5] || STATUS_PENDING)
    });
  }
  return out;
}

// Tổng sao biến động của từng nhân viên = tổng cột G (KQ) + sao đề xuất đã duyệt
function computeDeltaMap(ss) {
  var map = {};
  readKQ(ss).forEach(function (r) {
    map[r.staffId] = (map[r.staffId] || 0) + r.starChange;
  });
  readDeXuat(ss).forEach(function (d) {
    if (d.status === STATUS_APPROVED) map[d.staffId] = (map[d.staffId] || 0) + d.starsProposed;
  });
  // Thưởng báo cáo TikTok đúng hạn (phạt TikTok nằm trong KQ vì trừ vào báo cáo cuối ngày)
  readTikTok(ss).forEach(function (t) {
    map[t.staffId] = (map[t.staffId] || 0) + t.reward;
  });
  return map;
}

// Tổng sao = Sao gốc (cột D) + toàn bộ biến động. Đây là NGUỒN SỰ THẬT DUY NHẤT của tổng sao.
function updateStaffTotalStarOnSheet(ss, staffId) {
  var sheetNS = ss.getSheetByName(SH_NS);
  if (!sheetNS || sheetNS.getLastRow() <= 1) return null;
  var nsValues = readRows(sheetNS, 5);
  var deltaMap = computeStaffDeltaMap(ss, staffId);   // chỉ tính cho 1 người, đọc đúng cột cần thiết
  for (var i = 0; i < nsValues.length; i++) {
    if (String(nsValues[i][0]) === String(staffId)) {
      var base = Number(nsValues[i][3]) || 0;
      var finalTotal = base + (deltaMap[String(staffId)] || 0);
      sheetNS.getRange(i + 2, 5).setValue(finalTotal);
      return finalTotal;
    }
  }
  return null;
}

function parseLockedDates(v) {
  if (v instanceof Date) return [normDate(v)];
  var s = String(v === null || v === undefined ? "" : v);
  var out = [];
  s.split(",").forEach(function (x) {
    var d = normDate(x.trim());
    if (d) out.push(d);
  });
  return out;
}

// Ngày đã khóa chốt sổ -> trả JSON lỗi (null nếu chưa khóa). Dùng cho các thao tác xóa/sửa báo cáo.
function rejectIfLocked(ss, dateStr) {
  if (dateStr && getLockedDates(ss).indexOf(dateStr) !== -1) {
    return createJsonResponse({ status: "error", message: "Ngày " + dateStr + " đã khóa chốt sổ, không thể xóa/sửa. Hãy mở khóa ngày này trong Cài đặt trước!" });
  }
  return null;
}

function getLockedDates(ss) {
  var sh = ss.getSheetByName(SH_CFG);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = readRows(sh, 2);
  for (var i = 0; i < rows.length; i++) {
    if (cfgKeyFromCell(rows[i][0]) === CFG_LOCKED_KEY) return parseLockedDates(rows[i][1]);
  }
  return [];
}

// =====================================================================
// 1. NẠP TOÀN BỘ DỮ LIỆU CHO ỨNG DỤNG
// =====================================================================
function handleFetchAllData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ---- DM_NhanSu ----
  var sheetNS = ss.getSheetByName(SH_NS);
  var nhanSu = [];
  if (sheetNS && sheetNS.getLastRow() > 1) {
    var rowsNS = readRows(sheetNS, 8);
    rowsNS.forEach(function (r) {
      if (r[0]) {
        var assigned = [];
        if (r[6] && typeof r[6] === "string" && r[6].trim() !== "") {
          assigned = r[6].split(",").map(function (s) { return s.trim(); });
        }
        var totalRaw = r[4];
        // Chỉ dùng sao gốc khi ô Tổng sao TRỐNG (trước đây tổng = 0 bị nhảy về sao gốc)
        var totalStar = (totalRaw === "" || totalRaw === null || totalRaw === undefined)
          ? (Number(r[3]) || 0)
          : (Number(totalRaw) || 0);
        nhanSu.push({
          id: String(r[0]),
          name: String(r[1]),
          group: String(r[2]),
          baseStar: Number(r[3]) || 0,
          totalStar: totalStar,
          resetDate: normDate(r[5]),
          assignedItems: assigned,
          hidden: nsIsHidden(r[7])
        });
      }
    });
  }

  // ---- DM_ThiDua (có cột X2) ----
  var sheetTD = ss.getSheetByName(SH_TD);
  var thiDua = [];
  if (sheetTD && sheetTD.getLastRow() > 1) {
    var rowsTD = readRows(sheetTD, 6);
    rowsTD.forEach(function (r) {
      if (r[1]) {
        var x2 = r[5];
        thiDua.push({
          store: String(r[0] || "Chung"),
          name: String(r[1]),
          target: Number(r[2]) || 1,
          bonusStar: Number(r[3]) || 200,
          penaltyStar: Number(r[4]) || 100,
          isX2: x2 === true || String(x2).toUpperCase() === "X2" || String(x2).toUpperCase() === "TRUE"
        });
      }
    });
  }

  // ---- Data_KetQua_Ngay + nhật ký nộp trễ (suy ra từ các dòng phạt trễ) ----
  var ketQuaRaw = readKQ(ss);
  var ketQua = [];
  var lateLogs = [];
  ketQuaRaw.forEach(function (k) {
    ketQua.push({
      date: k.date,
      staffId: k.staffId,
      staffName: k.staffName,
      itemName: k.itemName,
      actual: k.actual,
      rate: k.rate,
      starChange: k.starChange,
      status: k.status,
      compensation: k.compensation
    });
    if (k.compensation === "PHAT_TRE") {
      var m = k.itemName.match(/Lần\s*(\d+)/);
      var penalty = Math.abs(k.starChange);
      lateLogs.push({
        staffId: k.staffId,
        date: k.date,
        lateCount: m ? Number(m[1]) : (Math.round(penalty / 100) || 1),
        penalty: penalty
      });
    }
  });

  // ---- CauHinh_QL (+ ngày khóa chốt sổ) ----
  var config = {
    STREAK_OVERTIME: 3,
    STREAK_PENALTY_STAR: 5,
    STREAK_ALERT_EMAIL: 7,
    MANAGER_EMAIL: "",
    AUTO_STREAK_ENABLED: "ON",
    DOUBLE_BONUS_RATE: 150,
    ALLOW_STAFF_EDIT_STREAK: "OFF",
    TIKTOK_REWARD: 300,
    TIKTOK_PENALTY: 300,
    TIKTOK_MIN_LINKS: 1
  };
  var lockedDates = [];
  lbSafe(function () { migrateCfgLabels(ss); }, null);   // tự đổi tên cấu hình sang tiếng Việt (chạy 1 lần, các lần sau không làm gì)
  var sheetCfg = ss.getSheetByName(SH_CFG);
  if (sheetCfg && sheetCfg.getLastRow() > 1) {
    var rowsCfg = readRows(sheetCfg, 2);
    rowsCfg.forEach(function (r) {
      if (!r[0]) return;
      var key = cfgKeyFromCell(r[0]);
      if (key === CFG_LOCKED_KEY) lockedDates = parseLockedDates(r[1]);
      else if (key === CFG_TT_START_KEY) config[key] = normDate(r[1]);
      else config[key] = normCfgValue(key, r[1]);
    });
  }
  // Lần đầu chạy tính năng TikTok: tự đặt ngày bắt đầu = hôm nay để KHÔNG phạt ngược các kỳ đã qua
  if (!config[CFG_TT_START_KEY]) {
    config[CFG_TT_START_KEY] = todayStr();
    lbSafe(function () { cfgUpsertText(ss, CFG_TT_START_KEY, config[CFG_TT_START_KEY]); }, null);  // lỗi ghi (vd không có quyền sửa) không được làm doGet chết
  }

  // ---- Data_ThiDua_SieuThi ----
  var sheetSt = ss.getSheetByName(SH_ST);
  var storeContestData = [];
  if (sheetSt && sheetSt.getLastRow() > 1) {
    var rowsSt = readRows(sheetSt, 8);
    rowsSt.forEach(function (r) {
      if (r[0]) {
        storeContestData.push({
          name: String(r[0]),
          type: String(r[1]),
          actual: Number(r[2]) || 0,
          target: Number(r[3]) || 0,
          rateMonth: Number(r[4]) || 0,
          forecast: Number(r[5]) || 0,
          rank: r[6],
          branch: String(r[7] || "TỔNG")
        });
      }
    });
  }

  // ---- Đề xuất bán thêm ----
  var deXuat = lbSafe(function () { return readDeXuat(ss); }, []);

  return createJsonResponse({
    nhanSu: nhanSu,
    thiDua: thiDua,
    ketQua: ketQua,
    config: config,
    storeContestData: storeContestData,
    deXuat: deXuat,
    tiktok: lbSafe(function () { return readTikTok(ss); }, []),
    veSinh: lbSafe(function () { return readVeSinh(ss); }, []),
    lichBan: lbSafe(function () { return lbRead(ss); }, []),
    roadshow: lbSafe(function () { return readRoadshow(ss); }, []),
    lateLogs: lateLogs,
    lockedDates: lockedDates,
    serverTime: new Date().getTime(),
    serverVersion: SERVER_VERSION
  });
}

// =====================================================================
// 2. GHI ĐÈ BÁO CÁO CUỐI CÙNG TRONG NGÀY
// =====================================================================
function handleSubmitDailyBatch(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dateStr = normDate(data.date);
  var staffId = String(data.staffId);

  // Chặn ở server: ngày đã khóa chốt sổ thì không nhận/sửa báo cáo (kể cả thiết bị còn cache cũ)
  if (getLockedDates(ss).indexOf(dateStr) !== -1) {
    return createJsonResponse({ status: "error", message: "Ngày " + dateStr + " đã bị khóa chốt sổ, không thể nộp/sửa báo cáo!" });
  }

  var sheetKQ = getOrCreateSheet(ss, SH_KQ,
    ["Ngày", "Mã NV", "Tên NV", "Tên Môn", "Thực Đạt", "% Đạt", "Sao Biến Động", "Trạng Thái", "Phương Án"]);

  // Xóa toàn bộ dòng cũ của nhân viên trong ngày đó (so khớp ngày đã chuẩn hóa) rồi ghi báo cáo cuối cùng (chỉ đọc cột A,B -> nhanh khi sheet có hàng chục nghìn dòng)
  kqDeleteStaffDay(ss, dateStr, staffId);

  // Bỏ các dòng phạt TikTok client gửi lên, thay bằng dòng server tự tính
  var reportsToSave = (data.reports || []).filter(function (r) { return r.compensation !== "TIKTOK_PHAT"; })
    .concat(buildTiktokPenaltyRows(ss, dateStr, staffId));

  var rowsToAdd = [];
  reportsToSave.forEach(function (r) {
    rowsToAdd.push([
      dateStr,
      staffId,
      data.staffName,
      r.itemName,
      r.actual,
      r.rate,
      r.starChange,
      r.status,
      r.compensation || "DUNG_SAO"
    ]);
  });

  if (rowsToAdd.length > 0) {
    var startRow = sheetKQ.getLastRow() + 1;
    // Cột A (ngày) và F (%) phải là TEXT, nếu không Sheets tự đổi thành Date / số
    sheetKQ.getRange(startRow, 1, rowsToAdd.length, 1).setNumberFormat("@");
    sheetKQ.getRange(startRow, 6, rowsToAdd.length, 1).setNumberFormat("@");
    sheetKQ.getRange(startRow, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
  }

  // Đề xuất bán thêm đi kèm báo cáo
  upsertProposal(ss, dateStr, staffId, data.staffName, data.extraItem, data.extraStars);

  var total = updateStaffTotalStarOnSheet(ss, staffId);
  return createJsonResponse({ status: "success", message: "Đã lưu báo cáo thành công!", totalStar: total });
}

// Thêm / sửa / xóa đề xuất bán thêm của (nhân viên, ngày). Đề xuất đã duyệt/từ chối thì giữ nguyên.
function upsertProposal(ss, dateStr, staffId, staffName, content, stars) {
  content = String(content === null || content === undefined ? "" : content).trim();
  var starsNum = Number(stars) || 0;

  var sh = ss.getSheetByName(SH_DX);
  if (!sh) {
    if (!content) return;
    sh = getOrCreateSheet(ss, SH_DX, ["Ngày", "Mã NV", "Tên NV", "Nội Dung", "Sao Đề Xuất", "Trạng Thái"]);
  }

  var existing = null;
  readDeXuat(ss).forEach(function (d) {
    if (d.date === dateStr && d.staffId === staffId) existing = d;
  });

  if (existing) {
    if (existing.status !== STATUS_PENDING) return;
    if (!content) {
      sh.deleteRow(existing.rowIdx);
    } else {
      sh.getRange(existing.rowIdx, 3, 1, 3).setValues([[staffName, content, starsNum]]);
    }
  } else if (content) {
    var r = sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, 1).setNumberFormat("@");
    sh.getRange(r, 1, 1, 6).setValues([[dateStr, staffId, staffName, content, starsNum, STATUS_PENDING]]);
  }
}

// =====================================================================
// 3. LƯU CẤU HÌNH + DANH MỤC MÔN + NGÀY KHÓA
// =====================================================================
function handleAutoSaveSettings(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var sheetCfg = getOrCreateSheet(ss, SH_CFG, ["Key", "Value"]);
  var keyRow = {};
  if (sheetCfg.getLastRow() > 1) {
    var keys = readRows(sheetCfg, 1);
    for (var i = 0; i < keys.length; i++) keyRow[cfgKeyFromCell(keys[i][0])] = i + 2;
  }

  function upsert(key, value, asText) {
    var row = keyRow[key];
    if (!row) {
      row = sheetCfg.getLastRow() + 1;
      sheetCfg.getRange(row, 1).setValue(cfgCellFromKey(key));
      keyRow[key] = row;
    }
    var cell = sheetCfg.getRange(row, 2);
    var isFrac = CFG_NUMERIC_RE.test(key) && /^-?\d+[.,]\d+$/.test(String(value));
    if (asText || isFrac) {
      cell.setNumberFormat("@");          // chặn Sheets tự đổi "1.5" thành ngày
      cell.setValue(String(value));
    } else {
      cell.setValue(value);
    }
  }

  var cfgMap = data.config || {};
  for (var key in cfgMap) {
    if (key === CFG_LOCKED_KEY) continue;
    upsert(key, cfgMap[key], key === CFG_TT_START_KEY);
  }

  // Ngày khóa chốt sổ (trước đây front-end gửi lên nhưng server bỏ qua -> mất sau khi đồng bộ)
  if (Object.prototype.toString.call(data.lockedDates) === "[object Array]") {
    var ld = data.lockedDates.map(normDate).filter(function (x) { return x; });
    ld.sort();
    upsert(CFG_LOCKED_KEY, ld.join(","), true);
  }

  // Ghi đè danh mục môn (6 cột, có X2). Danh sách rỗng => giữ nguyên, tránh xóa sạch danh mục nhầm.
  var itemsList = data.itemsList || [];
  if (itemsList.length > 0) {
    var sheetTD = getOrCreateSheet(ss, SH_TD,
      ["Siêu Thị", "Tên Môn Thi Đua", "Target Ngày", "Sao Thưởng", "Sao Phạt", "Nhân Đôi (X2)"]);
    sheetTD.getRange(1, 6).setValue("Nhân Đôi (X2)");

    var lastRowTD = sheetTD.getLastRow();
    if (lastRowTD > 1) {
      sheetTD.getRange(2, 1, lastRowTD - 1, Math.max(6, sheetTD.getLastColumn())).clearContent();
    }
    var tdRows = itemsList.map(function (item) {
      return [item.store, item.name, item.target, item.bonusStar, item.penaltyStar, item.isX2 ? "X2" : ""];
    });
    sheetTD.getRange(2, 1, tdRows.length, 6).setValues(tdRows);
  }

  return createJsonResponse({ status: "success", message: "Đã lưu danh mục môn và cấu hình thành công!" });
}

// =====================================================================
// 4. QUỸ SAO NHÂN VIÊN (sửa tay / thêm nhân viên)
// =====================================================================
// Tổng sao trên Sheet luôn = Sao gốc + biến động. Khi QL sửa tay tổng sao, phải chỉnh lại Sao gốc
// để lần nộp báo cáo kế tiếp (tính lại từ Sao gốc) không xóa mất phần sửa tay.
function handleUpdateStaffStars(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetNS = getOrCreateSheet(ss, SH_NS,
    ["Mã NV", "Tên NV", "Bộ Phận", "Sao Gốc", "Tổng Sao", "Ngày Reset Chuỗi", "Môn Riêng"]);

  var list = data.staffStars || [];
  var deltaMap = computeDeltaMap(ss);

  var rowOf = {};
  var nsValues = [];
  var lastRow = sheetNS.getLastRow();
  if (lastRow > 1) {
    nsValues = sheetNS.getRange(2, 1, lastRow - 1, 5).getValues();
    for (var i = 0; i < nsValues.length; i++) rowOf[String(nsValues[i][0])] = i;
  }

  var newRows = [];
  list.forEach(function (item) {
    var id = String(item.id);
    var total = Number(item.totalStar) || 0;
    var base = total - (deltaMap[id] || 0);
    if (rowOf.hasOwnProperty(id)) {
      var v = nsValues[rowOf[id]];
      if (item.name) v[1] = item.name;
      if (item.group) v[2] = item.group;
      v[3] = base;
      v[4] = total;
    } else {
      newRows.push([id, item.name || "", item.group || "", base, total, "", ""]); // nhân viên mới
    }
  });

  if (nsValues.length > 0) {
    sheetNS.getRange(2, 2, nsValues.length, 4).setValues(nsValues.map(function (v) { return [v[1], v[2], v[3], v[4]]; }));
  }
  if (newRows.length > 0) {
    sheetNS.getRange(sheetNS.getLastRow() + 1, 1, newRows.length, 7).setValues(newRows);
  }

  return createJsonResponse({ status: "success", message: "Đã lưu quỹ sao nhân viên lên Google Sheets!" });
}

// ---- ẨN NHÂN VIÊN (cột H "Ẩn" của DM_NhanSu: 1 = ẩn). Ẩn = app coi như nhân viên không tồn tại; dữ liệu cũ vẫn giữ để "Hiện lại". Chỉ Quản lý (MANAGER_ACTIONS). ----
function nsIsHidden(v) { var s = String(v === null || v === undefined ? "" : v).trim().toUpperCase(); return s === "1" || s === "TRUE" || s === "ẨN"; }
function nsHiddenMap(ss) {
  var map = {}, sh = ss.getSheetByName(SH_NS);
  if (sh && sh.getLastRow() > 1) readRows(sh, 8).forEach(function (r) { if (r[0] && nsIsHidden(r[7])) map[String(r[0])] = true; });
  return map;
}
function handleHideStaff(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID), sh = ss.getSheetByName(SH_NS);
  if (!sh || sh.getLastRow() < 2) return createJsonResponse({ status: "error", message: "Không tìm thấy nhân viên" });
  if (sh.getMaxColumns() < 8) sh.insertColumnsAfter(sh.getMaxColumns(), 8 - sh.getMaxColumns());
  if (!sh.getRange(1, 8).getValue()) sh.getRange(1, 8).setValue("Ẩn");
  var hide = data.hidden === true || data.hidden === "true" || data.hidden === 1;
  var ids = readRows(sh, 1);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(data.staffId)) {
      var cell = sh.getRange(i + 2, 8);
      cell.setNumberFormat("@");
      cell.setValue(hide ? "1" : "");
      return createJsonResponse({ status: "success", message: hide ? "Đã ẩn nhân viên." : "Đã hiện lại nhân viên." });
    }
  }
  return createJsonResponse({ status: "error", message: "Không tìm thấy nhân viên " + data.staffId });
}

function handleDeleteStaff(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetNS = ss.getSheetByName(SH_NS);
  if (!sheetNS || sheetNS.getLastRow() < 2) return createJsonResponse({ status: "error", message: "Không tìm thấy nhân viên" });
  var ids = readRows(sheetNS, 1);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(data.staffId)) {
      sheetNS.deleteRow(i + 2);   // chỉ xóa khỏi danh mục, lịch sử báo cáo vẫn giữ
      return createJsonResponse({ status: "success", message: "Đã xóa nhân viên khỏi Sheet!" });
    }
  }
  return createJsonResponse({ status: "error", message: "Không tìm thấy nhân viên " + data.staffId });
}

// =====================================================================
// 5. XÓA BÁO CÁO (QL) - trước đây server không có nên xóa xong đồng bộ lại là hiện lại
// =====================================================================
function handleDeleteSingleLog(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dateStr = normDate(data.date);
  var lockedErr = rejectIfLocked(ss, dateStr); if (lockedErr) return lockedErr;
  var staffId = String(data.staffId);
  var itemName = String(data.itemName);
  var n = deleteKQRows(ss, function (r) {
    return r.date === dateStr && r.staffId === staffId && r.itemName === itemName;
  }, true);
  if (n === 0) return createJsonResponse({ status: "error", message: "Không tìm thấy bản ghi trên Sheet (có thể đã bị xóa trước đó)" });
  var total = updateStaffTotalStarOnSheet(ss, staffId);
  return createJsonResponse({ status: "success", message: "Đã xóa bản ghi và tính lại sao!", totalStar: total });
}

function handleDeleteStaffDailyReports(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var dateStr = normDate(data.date);
  var lockedErr = rejectIfLocked(ss, dateStr); if (lockedErr) return lockedErr;
  var staffId = String(data.staffId);
  var n = deleteKQRows(ss, function (r) { return r.date === dateStr && r.staffId === staffId; }, false);
  if (n === 0) return createJsonResponse({ status: "error", message: "Không có báo cáo ngày " + dateStr + " trên Sheet" });
  var total = updateStaffTotalStarOnSheet(ss, staffId);
  return createJsonResponse({ status: "success", message: "Đã xóa " + n + " dòng báo cáo và tính lại sao!", totalStar: total });
}

// =====================================================================
// 6. DUYỆT ĐỀ XUẤT BÁN THÊM (trước đây hàm này chưa được định nghĩa -> báo lỗi)
// =====================================================================
function handleApproveExtraProposal(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SH_DX);
  var rowIdx = Number(data.rowIdx);
  if (!sh || !rowIdx || rowIdx < 2 || rowIdx > sh.getLastRow()) {
    return createJsonResponse({ status: "error", message: "Không tìm thấy đề xuất, vui lòng đồng bộ lại!" });
  }
  var row = sh.getRange(rowIdx, 1, 1, 6).getValues()[0];
  var status = String(row[5] || STATUS_PENDING);
  if (status !== STATUS_PENDING) {
    return createJsonResponse({ status: "error", message: "Đề xuất này đã được xử lý (" + status + ")" });
  }

  var approve = data.decision === "APPROVE";
  sh.getRange(rowIdx, 6).setValue(approve ? STATUS_APPROVED : STATUS_REJECTED);
  if (approve) updateStaffTotalStarOnSheet(ss, String(row[1]));

  return createJsonResponse({
    status: "success",
    message: approve ? "✅ Đã duyệt +" + (Number(row[4]) || 0) + "⭐ cho " + row[2] : "Đã từ chối đề xuất"
  });
}

// =====================================================================
// 7. CÁC HÀM PHỤ
// =====================================================================
function handleAssignSpecificItems(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetNS = ss.getSheetByName(SH_NS);
  if (!sheetNS || sheetNS.getLastRow() < 2) return createJsonResponse({ status: "error", message: "Không tìm thấy sheet" });

  var assignedStr = (data.assignedItems || []).join(", ");
  var ids = readRows(sheetNS, 1);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(data.staffId)) {
      sheetNS.getRange(i + 2, 7).setValue(assignedStr); // Cột G: Môn riêng
      break;
    }
  }
  return createJsonResponse({ status: "success", message: "Đã lưu môn riêng!" });
}

function handleResetStreak(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetNS = ss.getSheetByName(SH_NS);
  if (!sheetNS || sheetNS.getLastRow() < 2) return createJsonResponse({ status: "error", message: "Không tìm thấy sheet" });

  var today = todayStr(); // theo múi giờ Sheet (không dùng UTC nên 0h-7h sáng không bị lùi 1 ngày)
  var ids = readRows(sheetNS, 1);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(data.staffId)) {
      var cell = sheetNS.getRange(i + 2, 6); // Cột F: Ngày Reset
      cell.setNumberFormat("@");
      cell.setValue(today);
      return createJsonResponse({ status: "success", message: "Đã reset chuỗi thành công!" });
    }
  }
  return createJsonResponse({ status: "error", message: "Không tìm thấy nhân viên " + data.staffId });
}

function handleSaveStoreRawData(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetSt = getOrCreateSheet(ss, SH_ST,
    ["Tên Môn", "Loại", "Thực Đạt", "Target", "% Tháng", "% Dự Báo", "Hạng", "Chi Nhánh"]);

  var lastRow = sheetSt.getLastRow();
  if (lastRow > 1) {
    sheetSt.getRange(2, 1, lastRow - 1, sheetSt.getLastColumn()).clearContent();
  }

  var list = data.storeData || [];
  if (list.length > 0) {
    var rows = list.map(function (item) {
      return [item.name, item.type, item.actual, item.target, item.rateMonth, item.forecast, item.rank, item.branch];
    });
    sheetSt.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  return createJsonResponse({ status: "success", message: "Đã lưu dữ liệu siêu thị lên Google Sheets!" });
}


// =====================================================================
// BÁO CÁO LINK TIKTOK (THỨ 3 & THỨ 6 HÀNG TUẦN)
//  - Đúng hạn (nộp trong ngày hạn hoặc trước đó): +TIKTOK_REWARD sao (mặc định 300), ghi ở Data_TikTok
//  - Trễ: không thưởng. Mỗi ngày trễ -TIKTOK_PENALTY sao, trừ vào BÁO CÁO CUỐI NGÀY (app gửi kèm
//    SUBMIT_DAILY_BATCH, compensation = TIKTOK_PHAT) cho tới khi có link đúng và đủ.
// =====================================================================
function cfgUpsertText(ss, key, value) {
  var sh = getOrCreateSheet(ss, SH_CFG, ["Key", "Value"]);
  var row = 0;
  if (sh.getLastRow() > 1) {
    var keys = readRows(sh, 1);
    for (var i = 0; i < keys.length; i++) if (cfgKeyFromCell(keys[i][0]) === key) { row = i + 2; break; }
  }
  if (!row) { row = sh.getLastRow() + 1; sh.getRange(row, 1).setValue(cfgCellFromKey(key)); }
  var cell = sh.getRange(row, 2);
  cell.setNumberFormat("@");
  cell.setValue(value);
}

function getCfgValue(ss, key, def) {
  var sh = ss.getSheetByName(SH_CFG);
  if (sh && sh.getLastRow() > 1) {
    var rows = readRows(sh, 2);
    for (var i = 0; i < rows.length; i++) {
      if (cfgKeyFromCell(rows[i][0]) === key) {
        var v = rows[i][1];
        if (key === CFG_TT_START_KEY) return normDate(v);
        v = normCfgValue(key, v);
        return (v === "" || v === null || v === undefined) ? def : v;
      }
    }
  }
  return def;
}

function readTikTok(ss) {
  var sh = ss.getSheetByName(SH_TT);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, 8);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] && !r[2]) continue;
    out.push({
      row: i + 2,
      staffId: String(r[0]),
      staffName: String(r[1]),
      due: normDate(r[2]),
      links: String(r[3] || "").split(/\r?\n/).filter(function (x) { return x; }),
      submitDate: normDate(r[4]),
      submitTime: String(r[5] || ""),
      status: String(r[6] || ""),
      reward: Number(r[7]) || 0
    });
  }
  return out;
}

// Link TikTok hợp lệ & đầy đủ: video/ảnh đầy đủ, hoặc link rút gọn vt/vm/t (KHÔNG nhận link trang cá nhân)
function ttNormalizeLink(raw) {
  var l = String(raw || "").trim();
  if (!l) return "";
  if (!/^https?:\/\//i.test(l)) l = "https://" + l;
  var full = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/(?:video|photo)\/\d{10,25}\/?(?:\?.*)?$/i;
  var shortA = /^https?:\/\/(?:vt|vm)\.tiktok\.com\/[A-Za-z0-9_-]{5,}\/?(?:\?.*)?$/i;
  var shortB = /^https?:\/\/(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9_-]{5,}\/?(?:\?.*)?$/i;
  if (!(full.test(l) || shortA.test(l) || shortB.test(l))) return "";
  return l;
}

function ttLinkKey(l) {
  return String(l).toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").split("?")[0].replace(/\/+$/, "");
}

// Nhãn kỳ hạn giống app: "Thứ 3 07/10"
function ttLabelSv(due) {
  var d = ttParseDate(due);
  return ({ 2: "Thứ 3", 5: "Thứ 6" }[d.getDay()] || "") + " " + pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1);
}

// Server TỰ TÍNH các dòng phạt TikTok trễ hạn của nhân viên trong ngày dateStr (không tin số sao client gửi lên).
// Logic y hệt ttPenaltyRows() trong app: mỗi kỳ (Thứ 3/Thứ 6 từ ngày bắt đầu đến hôm trước) chưa nộp, hoặc nộp từ dateStr trở đi, bị trừ TIKTOK_PENALTY sao; kỳ "MIỄN" không tính.
function buildTiktokPenaltyRows(ss, dateStr, staffId) {
  var rows = [];
  var start = getCfgValue(ss, CFG_TT_START_KEY, "");
  if (!start || !dateStr) return rows;
  var pen = Number(getCfgValue(ss, "TIKTOK_PENALTY", 300));
  if (isNaN(pen)) pen = 300;
  var prev = ttFmt(new Date(ttParseDate(dateStr).getTime() - 86400000));
  var subs = {};
  readTikTok(ss).forEach(function (t) { if (t.staffId === staffId) subs[t.due] = t; });
  ttDueDates(start, prev).forEach(function (T) {
    var sub = subs[T];
    if (sub && sub.status === "MIỄN") return;
    if (!sub || sub.submitDate >= dateStr) {
      rows.push({ itemName: "[Kỷ Luật] TikTok trễ hạn " + ttLabelSv(T), actual: 0, rate: "Trễ TikTok", starChange: -pen, status: "Phạt TikTok", compensation: "TIKTOK_PHAT" });
    }
  });
  return rows;
}

function ttParseDate(str) {
  var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}
function ttFmt(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

// Các ngày hạn (Thứ 3 = 2, Thứ 6 = 5) trong khoảng [from, to]
function ttDueDates(from, to) {
  var out = [];
  var d = ttParseDate(from), end = ttParseDate(to);
  var guard = 0;
  while (d <= end && guard++ < 800) {
    var w = d.getDay();
    if (w === 2 || w === 5) out.push(ttFmt(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function handleSubmitTiktok(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var staffId = String(data.staffId || "");
  var staffName = String(data.staffName || "");
  if (!staffId) return createJsonResponse({ status: "error", message: "Thiếu nhân viên!" });

  var minLinks = Math.max(1, Number(getCfgValue(ss, "TIKTOK_MIN_LINKS", 1)) || 1);
  var rewardCfg = Number(getCfgValue(ss, "TIKTOK_REWARD", 300));
  var reward = isNaN(rewardCfg) ? 300 : rewardCfg;
  var start = getCfgValue(ss, CFG_TT_START_KEY, "") || todayStr();

  // 1. Kiểm tra link
  var rawLinks = (data.links || []);
  var good = [], seen = {}, bad = [];
  rawLinks.forEach(function (x) {
    var n = ttNormalizeLink(x);
    if (!n) { if (String(x).trim()) bad.push(String(x).trim()); return; }
    var k = ttLinkKey(n);
    if (!seen[k]) { seen[k] = true; good.push(n); }
  });
  if (bad.length) return createJsonResponse({ status: "error", message: "Link không đúng định dạng TikTok (cần link video/ảnh đầy đủ hoặc link rút gọn vt/vm.tiktok.com): " + bad[0] });
  if (good.length < minLinks) return createJsonResponse({ status: "error", message: "Chưa đủ link: cần tối thiểu " + minLinks + " link TikTok hợp lệ (đang có " + good.length + ")." });

  // 2. Chặn dùng lại link đã nộp ở kỳ trước của chính nhân viên
  var all = readTikTok(ss);
  var used = {};
  all.forEach(function (t) { if (t.staffId === staffId) t.links.forEach(function (l) { used[ttLinkKey(l)] = true; }); });
  for (var i = 0; i < good.length; i++) {
    if (used[ttLinkKey(good[i])]) return createJsonResponse({ status: "error", message: "Link này bạn đã nộp ở kỳ trước, vui lòng nộp link mới: " + good[i] });
  }

  // 3. Xác định kỳ hạn đang nộp: kỳ QUÁ HẠN cũ nhất chưa nộp -> nếu không có thì kỳ sắp tới
  var today = todayStr();
  var mine = {};
  all.forEach(function (t) { if (t.staffId === staffId) mine[t.due] = t; });

  var target = "";
  var past = ttDueDates(start, today);
  for (var j = 0; j < past.length; j++) {
    if (past[j] < today && !mine[past[j]]) { target = past[j]; break; }
  }
  if (!target) {
    var from = start > today ? start : today;
    var upcoming = ttDueDates(from, ttFmt(new Date(ttParseDate(from).getTime() + 10 * 86400000)));
    target = upcoming.length ? upcoming[0] : "";
  }
  if (!target) return createJsonResponse({ status: "error", message: "Chưa có kỳ nộp nào." });
  if (mine[target]) return createJsonResponse({ status: "error", message: "Bạn đã nộp xong kỳ " + target + ". Chưa tới kỳ nộp tiếp theo!" });

  var onTime = today <= target;
  var status = onTime ? "ĐÚNG HẠN" : "TRỄ";
  var stars = onTime ? reward : 0;
  var nowTime = Utilities.formatDate(new Date(), tz(), "HH:mm");

  var sh = getOrCreateSheet(ss, SH_TT, ["Mã NV", "Tên NV", "Hạn Nộp", "Link", "Ngày Nộp", "Giờ Nộp", "Trạng Thái", "Sao Thưởng"]);
  var row = sh.getLastRow() + 1;
  sh.getRange(row, 3, 1, 1).setNumberFormat("@");
  sh.getRange(row, 5, 1, 2).setNumberFormat("@");
  sh.getRange(row, 1, 1, 8).setValues([[staffId, staffName, target, good.join("\n"), today, nowTime, status, stars]]);

  var total = updateStaffTotalStarOnSheet(ss, staffId);
  return createJsonResponse({
    status: "success",
    message: onTime ? ("Đã ghi nhận ĐÚNG HẠN kỳ " + target + ": +" + stars + " sao") : ("Đã ghi nhận nộp TRỄ kỳ " + target + " (không có thưởng)"),
    totalStar: total,
    record: { staffId: staffId, staffName: staffName, due: target, links: good, submitDate: today, submitTime: nowTime, status: status, reward: stars }
  });
}

// Quản lý: xóa 1 lần nộp (nộp nhầm link, ...)
function handleDeleteTiktok(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var staffId = String(data.staffId), due = normDate(data.due);
  var sh = ss.getSheetByName(SH_TT);
  var removed = 0;
  if (sh) {
    var rows = readTikTok(ss).filter(function (t) { return t.staffId === staffId && t.due === due; });
    rows.sort(function (a, b) { return b.row - a.row; });
    rows.forEach(function (t) { sh.deleteRow(t.row); removed++; });
  }
  var total = updateStaffTotalStarOnSheet(ss, staffId);
  return createJsonResponse({ status: "success", message: "Đã xóa " + removed + " bản ghi TikTok", totalStar: total });
}

// Quản lý: miễn 1 kỳ (nghỉ phép, ốm...) -> không thưởng, không phạt
function handleExcuseTiktok(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var staffId = String(data.staffId), due = normDate(data.due);
  var exists = readTikTok(ss).some(function (t) { return t.staffId === staffId && t.due === due; });
  if (exists) return createJsonResponse({ status: "error", message: "Kỳ này đã có bản ghi!" });
  var sh = getOrCreateSheet(ss, SH_TT, ["Mã NV", "Tên NV", "Hạn Nộp", "Link", "Ngày Nộp", "Giờ Nộp", "Trạng Thái", "Sao Thưởng"]);
  var row = sh.getLastRow() + 1;
  sh.getRange(row, 3, 1, 1).setNumberFormat("@");
  sh.getRange(row, 5, 1, 2).setNumberFormat("@");
  sh.getRange(row, 1, 1, 8).setValues([[staffId, String(data.staffName || ""), due, "", todayStr(), Utilities.formatDate(new Date(), tz(), "HH:mm"), "MIỄN", 0]]);
  return createJsonResponse({
    status: "success",
    message: "Đã miễn kỳ " + due,
    record: { staffId: staffId, staffName: String(data.staffName || ""), due: due, links: [], submitDate: todayStr(), submitTime: "", status: "MIỄN", reward: 0 }
  });
}


// =====================================================================
// LỊCH VỆ SINH: nhân viên đăng ký ngày (mỗi ngày 1 người), báo cáo bằng 3 ảnh lưu vào Google Drive.
//  - Đã đăng ký thì nhân viên không tự xóa được; chỉ Quản lý xóa (DELETE_CLEAN).
// =====================================================================
// CHẠY HÀM NÀY 1 LẦN trong trình soạn thảo Apps Script để cấp quyền Google Drive, rồi mới Deploy bản mới.
function authorizeDrive() {
  DriveApp.getRootFolder();
  Logger.log("Đã cấp quyền Google Drive thành công!");
}

function readVeSinh(ss) {
  var sh = ss.getSheetByName(SH_VS);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, 10);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    var photos = [];
    for (var k = 5; k <= 7; k++) if (r[k]) photos.push(String(r[k]));
    out.push({
      row: i + 2,
      date: normDate(r[0]),
      staffId: String(r[1]),
      staffName: String(r[2]),
      regDate: normDate(r[3]),
      regTime: String(r[4] || ""),
      photos: photos,
      reportDate: normDate(r[8]),
      reportTime: String(r[9] || "")
    });
  }
  return out;
}

function getCleanFolder() {
  if (CLEAN_FOLDER_ID) return DriveApp.getFolderById(CLEAN_FOLDER_ID);
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("CLEAN_FOLDER_AUTO_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder("KPI Sao - Anh Ve Sinh");
  props.setProperty("CLEAN_FOLDER_AUTO_ID", f.getId());
  return f;
}

function handleRegisterClean(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date);
  var staffId = String(data.staffId || "");
  var staffName = String(data.staffName || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return createJsonResponse({ status: "error", message: "Ngày không hợp lệ!" });
  if (!staffId || !staffName) return createJsonResponse({ status: "error", message: "Vui lòng chọn nhân viên!" });
  if (date < todayStr()) return createJsonResponse({ status: "error", message: "Không thể đăng ký ngày đã qua!" });

  var existing = null;
  var hidC = nsHiddenMap(ss);
  readVeSinh(ss).forEach(function (v) { if (v.date === date && !hidC[v.staffId]) existing = v; });
  if (existing) {
    return createJsonResponse({ status: "error", message: "Ngày " + date + " đã có " + existing.staffName + " đăng ký (mỗi ngày chỉ 1 người)!", existing: existing });
  }

  var sh = getOrCreateSheet(ss, SH_VS, ["Ngày", "Mã NV", "Tên NV", "Ngày ĐK", "Giờ ĐK", "Ảnh 1", "Ảnh 2", "Ảnh 3", "Ngày Báo Cáo", "Giờ Báo Cáo"]);
  var row = sh.getLastRow() + 1;
  var now = Utilities.formatDate(new Date(), tz(), "HH:mm");
  sh.getRange(row, 1, 1, 1).setNumberFormat("@");
  sh.getRange(row, 4, 1, 2).setNumberFormat("@");
  sh.getRange(row, 9, 1, 2).setNumberFormat("@");
  sh.getRange(row, 1, 1, 10).setValues([[date, staffId, staffName, todayStr(), now, "", "", "", "", ""]]);
  return createJsonResponse({
    status: "success",
    message: "Đã đăng ký vệ sinh ngày " + date + " cho " + staffName,
    record: { date: date, staffId: staffId, staffName: staffName, regDate: todayStr(), regTime: now, photos: [], reportDate: "", reportTime: "" }
  });
}

function handleUploadClean(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date);
  var staffId = String(data.staffId || "");
  var today = todayStr();

  var rec = null;
  readVeSinh(ss).forEach(function (v) { if (v.date === date) rec = v; });
  if (!rec) return createJsonResponse({ status: "error", message: "Ngày này chưa có ai đăng ký vệ sinh!" });
  if (rec.staffId !== staffId) return createJsonResponse({ status: "error", message: "Chỉ " + rec.staffName + " (người đăng ký) mới được báo cáo ngày này!" });
  if (date > today) return createJsonResponse({ status: "error", message: "Chưa tới ngày vệ sinh, chưa thể nộp ảnh báo cáo!" });
  if (rec.photos.length) return createJsonResponse({ status: "error", message: "Ngày này đã nộp ảnh báo cáo rồi. Cần sửa thì nhờ Quản lý xóa ảnh cũ." });

  var photos = data.photos || [];
  if (photos.length !== 3) return createJsonResponse({ status: "error", message: "Cần đúng 3 ảnh vệ sinh (đang có " + photos.length + ")!" });
  var okMime = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  for (var i = 0; i < 3; i++) {
    var p = photos[i] || {};
    if (!okMime[p.mime]) return createJsonResponse({ status: "error", message: "Ảnh " + (i + 1) + " không đúng định dạng (chỉ nhận JPG/PNG/WEBP)!" });
    if (!p.base64 || String(p.base64).length < 500) return createJsonResponse({ status: "error", message: "Ảnh " + (i + 1) + " bị rỗng!" });
    if (String(p.base64).length > 7000000) return createJsonResponse({ status: "error", message: "Ảnh " + (i + 1) + " quá lớn!" });
  }

  var folder, created = [], ids = [];
  try {
    folder = getCleanFolder();
    for (var j = 0; j < 3; j++) {
      var ext = okMime[photos[j].mime];
      var blob = Utilities.newBlob(Utilities.base64Decode(photos[j].base64), photos[j].mime, "VeSinh_" + date + "_" + staffId + "_" + (j + 1) + "." + ext);
      var file = folder.createFile(blob);
      created.push(file);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (shErr) {}
      ids.push(file.getId());
    }
  } catch (err) {
    created.forEach(function (f) { try { f.setTrashed(true); } catch (e) {} });
    return createJsonResponse({ status: "error", message: "Không lưu được ảnh vào Google Drive (đã chạy authorizeDrive và Deploy bản mới chưa?): " + err });
  }

  var sh = ss.getSheetByName(SH_VS);
  var now = Utilities.formatDate(new Date(), tz(), "HH:mm");
  sh.getRange(rec.row, 6, 1, 5).setValues([[ids[0], ids[1], ids[2], today, now]]);
  return createJsonResponse({
    status: "success",
    message: "Đã nộp báo cáo vệ sinh ngày " + date + " (3 ảnh)",
    record: { date: date, staffId: rec.staffId, staffName: rec.staffName, regDate: rec.regDate, regTime: rec.regTime, photos: ids, reportDate: today, reportTime: now }
  });
}

// Quản lý: xóa cả đăng ký, hoặc chỉ xóa ảnh (onlyPhotos = true) để nhân viên nộp lại
function handleDeleteClean(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date);
  var sh = ss.getSheetByName(SH_VS);
  var rec = null;
  readVeSinh(ss).forEach(function (v) { if (v.date === date) rec = v; });
  if (!sh || !rec) return createJsonResponse({ status: "error", message: "Không tìm thấy đăng ký ngày " + date });
  rec.photos.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  if (data.onlyPhotos) {
    sh.getRange(rec.row, 6, 1, 5).setValues([["", "", "", "", ""]]);
    return createJsonResponse({ status: "success", message: "Đã xóa ảnh báo cáo ngày " + date });
  }
  sh.deleteRow(rec.row);
  return createJsonResponse({ status: "success", message: "Đã xóa đăng ký vệ sinh ngày " + date });
}

// =====================================================================
// ROADSHOW (RS): đăng ký THEO GIỜ. 1 ngày / 1 khung giờ có thể nhiều người; mỗi (ngày + nhân viên + giờ) là 1 lượt chạy, báo cáo riêng.
//   Khung giờ: sáng 6:00-10:30, chiều 15:00-18:00, cách nhau 30 phút (RS_TIMES).
//   Sheet Data_Roadshow: A Ngày | B Mã NV | C Tên NV | D Ngày ĐK | E Giờ ĐK | F Ảnh trước chạy | G Ảnh Strava | H Ảnh Loa+USB (khu vực sạc)
//                        | I Ảnh thêm (id cách nhau ;) | J Km | K Phút | L Ngày báo cáo | M Giờ báo cáo | N Giờ chạy (HH:mm) | O Nguồn (NV tự đăng ký / QL xếp)
//   Báo cáo: tối thiểu 3 ảnh (F,G,H) + Km >= 5 và Phút >= 30 (server kiểm tra lại). Ảnh lưu Google Drive.
//   Quản lý có thể xếp lịch hàng loạt (ASSIGN_RS): chọn ngày + giờ + nhiều nhân viên -> ghi thẳng vào sheet, nhân viên thấy ngay khi đồng bộ.
// =====================================================================
var SH_RS = "Data_Roadshow";
var RS_HEADERS = ["Ngày", "Mã NV", "Tên NV", "Ngày ĐK", "Giờ ĐK", "Ảnh trước chạy", "Ảnh Strava", "Ảnh Loa+USB (khu vực sạc)", "Ảnh thêm", "Km", "Phút", "Ngày Báo Cáo", "Giờ Báo Cáo", "Giờ Chạy", "Nguồn"];
var RS_NCOL = 15;
var RS_MIN_KM = 5;
var RS_MIN_MIN = 30;
var RS_MAX_PHOTOS = 6;
var RS_TIMES = (function () {
  var out = [];
  function add(h1, m1, h2, m2) { for (var t = h1 * 60 + m1; t <= h2 * 60 + m2; t += 30) out.push(pad2(Math.floor(t / 60)) + ":" + pad2(t % 60)); }
  add(6, 0, 10, 30);
  add(15, 0, 18, 0);
  return out;
})();

function rsNormTime(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz(), "HH:mm");
  if (typeof v === "number" && v >= 0 && v < 1) { var mins = Math.round(v * 1440); return pad2(Math.floor(mins / 60)) + ":" + pad2(mins % 60); }
  var s = String(v === null || v === undefined ? "" : v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? pad2(Number(m[1])) + ":" + m[2] : "";
}
function rsNowHM() { return Utilities.formatDate(new Date(), tz(), "HH:mm"); }

function getRsFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("RS_FOLDER_AUTO_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder("KPI Sao - Anh Roadshow");
  props.setProperty("RS_FOLDER_AUTO_ID", f.getId());
  return f;
}

// Tạo/nâng cấp sheet: bản cũ (13 cột) tự được thêm 2 cột Giờ chạy + Nguồn
function rsSheet(ss) {
  var sh = getOrCreateSheet(ss, SH_RS, RS_HEADERS);
  if (!sh.getRange(1, 14).getValue()) sh.getRange(1, 14, 1, 2).setValues([[RS_HEADERS[13], RS_HEADERS[14]]]);
  return sh;
}

function readRoadshow(ss) {
  var sh = ss.getSheetByName(SH_RS);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, RS_NCOL);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    var photos = [];
    for (var k = 5; k <= 7; k++) if (r[k]) photos.push(String(r[k]));
    if (photos.length === 3 && r[8]) String(r[8]).split(";").forEach(function (x) { x = String(x).trim(); if (x) photos.push(x); });
    out.push({
      row: i + 2,
      date: normDate(r[0]),
      staffId: String(r[1]),
      staffName: String(r[2]),
      regDate: normDate(r[3]),
      regTime: String(r[4] || ""),
      photos: photos,
      km: Number(r[9]) || 0,
      minutes: Number(r[10]) || 0,
      reportDate: normDate(r[11]),
      reportTime: String(r[12] || ""),
      time: rsNormTime(r[13]),
      source: String(r[14] || "NV")
    });
  }
  return out;
}

function rsFind(list, date, staffId, time) {
  var rec = null;
  list.forEach(function (v) { if (v.date === date && v.staffId === staffId && v.time === time) rec = v; });
  return rec;
}

function handleRegisterRs(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date);
  var staffId = String(data.staffId || "");
  var staffName = String(data.staffName || "");
  var time = rsNormTime(data.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return createJsonResponse({ status: "error", message: "Ngày không hợp lệ!" });
  if (!staffId || !staffName) return createJsonResponse({ status: "error", message: "Vui lòng chọn nhân viên!" });
  if (RS_TIMES.indexOf(time) === -1) return createJsonResponse({ status: "error", message: "Giờ không hợp lệ! Khung đăng ký: sáng 6h–10h30, chiều 15h–18h, cách nhau 30 phút." });
  if (date < todayStr()) return createJsonResponse({ status: "error", message: "Không thể đăng ký ngày đã qua!" });
  if (date === todayStr() && time < rsNowHM()) return createJsonResponse({ status: "error", message: "Khung giờ " + time + " hôm nay đã qua, hãy chọn giờ sau!" });

  var existing = rsFind(readRoadshow(ss), date, staffId, time);
  if (existing) return createJsonResponse({ status: "error", message: staffName + " đã đăng ký Roadshow " + time + " ngày " + date + " rồi!", existing: existing });

  var sh = rsSheet(ss);
  var row = sh.getLastRow() + 1;
  var now = rsNowHM();
  sh.getRange(row, 1, 1, RS_NCOL).setNumberFormat("@");
  sh.getRange(row, 1, 1, RS_NCOL).setValues([[date, staffId, staffName, todayStr(), now, "", "", "", "", "", "", "", "", time, "NV"]]);
  return createJsonResponse({
    status: "success",
    message: "Đã đăng ký Roadshow " + time + " ngày " + date + " cho " + staffName,
    record: { date: date, staffId: staffId, staffName: staffName, regDate: todayStr(), regTime: now, photos: [], km: 0, minutes: 0, reportDate: "", reportTime: "", time: time, source: "NV" }
  });
}

// Quản lý xếp lịch RS: 1 ngày + 1 giờ + nhiều nhân viên. Bỏ qua người đã có đúng lượt đó.
function handleAssignRs(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date);
  var time = rsNormTime(data.time);
  var staffs = data.staffs || [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return createJsonResponse({ status: "error", message: "Ngày không hợp lệ!" });
  if (RS_TIMES.indexOf(time) === -1) return createJsonResponse({ status: "error", message: "Giờ không hợp lệ! Khung: sáng 6h–10h30, chiều 15h–18h, cách nhau 30 phút." });
  if (!staffs.length) return createJsonResponse({ status: "error", message: "Chưa chọn nhân viên nào!" });

  var existing = readRoadshow(ss);
  var sh = rsSheet(ss);
  var now = rsNowHM(), rows = [], added = [], skipped = [], seen = {};
  staffs.forEach(function (s) {
    var id = String((s && s.id) || ""), name = String((s && s.name) || "");
    if (!id || !name || seen[id]) return;
    seen[id] = true;
    if (rsFind(existing, date, id, time)) { skipped.push(name); return; }
    rows.push([date, id, name, todayStr(), now, "", "", "", "", "", "", "", "", time, "QL"]);
    added.push({ date: date, staffId: id, staffName: name, regDate: todayStr(), regTime: now, photos: [], km: 0, minutes: 0, reportDate: "", reportTime: "", time: time, source: "QL" });
  });
  if (rows.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, RS_NCOL).setNumberFormat("@");
    sh.getRange(start, 1, rows.length, RS_NCOL).setValues(rows);
  }
  var msg = "Đã xếp lịch RS " + time + " ngày " + date + " cho " + added.length + " nhân viên" + (skipped.length ? " (đã có sẵn: " + skipped.join(", ") + ")" : "");
  return createJsonResponse({ status: "success", message: msg, records: added, skipped: skipped });
}

function handleUploadRs(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date);
  var staffId = String(data.staffId || "");
  var time = rsNormTime(data.time);
  var today = todayStr();

  var rec = rsFind(readRoadshow(ss), date, staffId, time);
  if (!rec) return createJsonResponse({ status: "error", message: "Bạn chưa đăng ký Roadshow khung giờ này!" });
  if (date > today) return createJsonResponse({ status: "error", message: "Chưa tới ngày chạy Roadshow, chưa thể nộp báo cáo!" });
  if (date === today && rec.time && rec.time > rsNowHM()) return createJsonResponse({ status: "error", message: "Chưa tới giờ chạy (" + rec.time + "), chưa thể nộp báo cáo!" });
  if (rec.photos.length >= 3) return createJsonResponse({ status: "error", message: "Lượt chạy này đã nộp báo cáo rồi. Cần sửa thì nhờ Quản lý xóa ảnh cũ." });

  var km = Number(data.km), minutes = Number(data.minutes);
  if (!(km >= RS_MIN_KM)) return createJsonResponse({ status: "error", message: "Quãng đường tối thiểu " + RS_MIN_KM + " km (bạn nhập: " + (isNaN(km) ? "?" : km) + ")!" });
  if (!(minutes >= RS_MIN_MIN)) return createJsonResponse({ status: "error", message: "Thời gian chạy tối thiểu " + RS_MIN_MIN + " phút (bạn nhập: " + (isNaN(minutes) ? "?" : minutes) + ")!" });

  var photos = data.photos || [];
  if (photos.length < 3) return createJsonResponse({ status: "error", message: "Cần ít nhất 3 ảnh (đang có " + photos.length + ")!" });
  if (photos.length > RS_MAX_PHOTOS) return createJsonResponse({ status: "error", message: "Tối đa " + RS_MAX_PHOTOS + " ảnh!" });
  var okMime = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  for (var i = 0; i < photos.length; i++) {
    var p = photos[i] || {};
    if (!okMime[p.mime]) return createJsonResponse({ status: "error", message: "Ảnh " + (i + 1) + " không đúng định dạng (chỉ nhận JPG/PNG/WEBP)!" });
    if (!p.base64 || String(p.base64).length < 500) return createJsonResponse({ status: "error", message: "Ảnh " + (i + 1) + " bị rỗng!" });
    if (String(p.base64).length > 7000000) return createJsonResponse({ status: "error", message: "Ảnh " + (i + 1) + " quá lớn!" });
  }

  var folder, created = [], ids = [];
  try {
    folder = getRsFolder();
    for (var j = 0; j < photos.length; j++) {
      var ext = okMime[photos[j].mime];
      var blob = Utilities.newBlob(Utilities.base64Decode(photos[j].base64), photos[j].mime, "RS_" + date + "_" + rec.time.replace(":", "") + "_" + staffId + "_" + (j + 1) + "." + ext);
      var file = folder.createFile(blob);
      created.push(file);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (shErr) {}
      ids.push(file.getId());
    }
  } catch (err) {
    created.forEach(function (f) { try { f.setTrashed(true); } catch (e) {} });
    return createJsonResponse({ status: "error", message: "Không lưu được ảnh vào Google Drive (đã chạy authorizeDrive và Deploy bản mới chưa?): " + err });
  }

  var sh = ss.getSheetByName(SH_RS);
  var now = rsNowHM();
  var extra = ids.slice(3).join(";");
  sh.getRange(rec.row, 6, 1, 8).setNumberFormat("@");
  sh.getRange(rec.row, 6, 1, 8).setValues([[ids[0], ids[1], ids[2], extra, km, minutes, today, now]]);
  return createJsonResponse({
    status: "success",
    message: "Đã nộp báo cáo Roadshow " + (rec.time || "") + " ngày " + date + " (" + ids.length + " ảnh, " + km + " km, " + minutes + " phút)",
    record: { date: date, staffId: rec.staffId, staffName: rec.staffName, regDate: rec.regDate, regTime: rec.regTime, photos: ids, km: km, minutes: minutes, reportDate: today, reportTime: now, time: rec.time, source: rec.source }
  });
}

// Quản lý: xóa cả lượt đăng ký, hoặc chỉ xóa ảnh (onlyPhotos = true) để nhân viên nộp lại
function handleDeleteRs(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date), staffId = String(data.staffId || ""), time = rsNormTime(data.time);
  var sh = ss.getSheetByName(SH_RS);
  var rec = rsFind(readRoadshow(ss), date, staffId, time);
  if (!sh || !rec) return createJsonResponse({ status: "error", message: "Không tìm thấy lượt Roadshow ngày " + date + (time ? " " + time : "") });
  rec.photos.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} });
  if (data.onlyPhotos) {
    sh.getRange(rec.row, 6, 1, 8).setValues([["", "", "", "", "", "", "", ""]]);
    return createJsonResponse({ status: "success", message: "Đã xóa ảnh báo cáo Roadshow ngày " + date });
  }
  sh.deleteRow(rec.row);
  return createJsonResponse({ status: "success", message: "Đã xóa lượt Roadshow ngày " + date + (time ? " " + time : "") });
}

// =====================================================================
// NỘI DUNG QUAN TRỌNG (Notes): Quản lý dán text / link / úp ảnh & file -> lưu Sheet + Drive, tự phân loại 6 mục.
//   Sheet Data_NoiDung: A ID | B Ngày đăng | C Giờ | D Tiêu đề | E Nội dung | F Danh mục | G Từ ngày | H Đến ngày | I Link (mỗi dòng 1 link)
//                       | J File (JSON [{id,name,mime}]) | K Từ khóa | L Tóm tắt | M Nguồn phân loại (AI/RULE/QL) | N Ghim | O Người đăng
//   Phân loại: (1) AI nếu có AI_API_KEY trong Script properties (xem được cả ẢNH poster), (2) bộ lọc từ khóa tiếng Việt nếu chưa có AI / AI lỗi.
//   Script properties (Project Settings -> Script properties):  AI_API_KEY (bắt buộc nếu dùng AI) | AI_PROVIDER = anthropic (mặc định) hoặc gemini
//                                                                | AI_MODEL (tuỳ chọn) | MANAGER_PIN (tuỳ chọn: server chỉ nhận đăng/sửa/xóa khi đúng mật khẩu QL)
//   Chạy hàm testAi() 1 lần trong trình soạn thảo để cấp quyền gọi AI (UrlFetchApp), rồi Deploy bản mới.
// =====================================================================
var SH_NOTE = "Data_NoiDung";
var NOTE_HEADERS = ["ID", "Ngày đăng", "Giờ đăng", "Tiêu đề", "Nội dung", "Danh mục", "Từ ngày", "Đến ngày", "Link", "File (JSON)", "Từ khóa", "Tóm tắt", "Nguồn phân loại", "Ghim", "Người đăng", "Bảng tóm tắt (JSON)", "Giao việc (JSON)"];
var NOTE_NCOL = 17;
var NOTE_CATS = { ctkm_tg: "CTKM có thời hạn", ctkm_ld: "CTKM lâu dài", phuc_vu: "Phục vụ", quy_trinh: "Quy trình", chinh_sach: "Chính sách", khac: "Khác" };
var NOTE_MAX_FILES = 8;
var NOTE_MAX_B64 = 8000000;          // ~6MB / file
var NOTE_MAX_TEXT = 45000;           // giới hạn 50.000 ký tự / ô của Google Sheet
var NOTE_MIME_EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt", "text/csv": "csv"
};

function getNotesFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("NOTES_FOLDER_AUTO_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder("KPI Sao - Noi Dung Quan Trong");
  props.setProperty("NOTES_FOLDER_AUTO_ID", f.getId());
  return f;
}

function handleVerifyManager(data) {
  var pin = PropertiesService.getScriptProperties().getProperty("MANAGER_PIN");
  if (!pin) return createJsonResponse({ status: "nopin" });        // server chưa cài mật khẩu -> app tự dùng mật khẩu mặc định cũ
  if (String(data.mpin || "") === pin) return createJsonResponse({ status: "success" });
  return createJsonResponse({ status: "error", message: PIN_ERR_MSG });
}

function notePinOk(data) {
  var pin = PropertiesService.getScriptProperties().getProperty("MANAGER_PIN");
  return !pin || String(data.mpin || "") === pin;
}

// ---------- chuẩn hóa tiếng Việt không dấu ----------
function noteNorm(s) {
  return String(s === null || s === undefined ? "" : s).replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function noteHas(n, kw) {
  return new RegExp("(^|[^a-z0-9])" + kw.replace(/ /g, "\\s+") + "([^a-z0-9]|$)").test(n);
}

// ---------- tách ngày áp dụng từ text ----------
function noteIso(y, mo, d) { return y + "-" + pad2(mo) + "-" + pad2(d); }
function noteRuleDates(text) {
  var t = String(text || ""), year = Number(todayStr().slice(0, 4)), from = "", to = "";
  var rm = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/.exec(t);          // "15-31/10"
  if (rm) {
    var yy = rm[4] ? (Number(rm[4]) < 100 ? 2000 + Number(rm[4]) : Number(rm[4])) : year;
    if (Number(rm[1]) >= 1 && Number(rm[2]) <= 31 && Number(rm[3]) >= 1 && Number(rm[3]) <= 12 && Number(rm[1]) <= Number(rm[2])) {
      return { from: noteIso(yy, Number(rm[3]), Number(rm[1])), to: noteIso(yy, Number(rm[3]), Number(rm[2])) };
    }
  }
  var re = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/g, m, ds = [];
  while ((m = re.exec(t)) !== null) {
    var d = Number(m[1]), mo = Number(m[2]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    var y = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    ds.push({ d: d, mo: mo, y: y, hasY: !!m[3], idx: m.index });
  }
  if (ds.length >= 2) {
    var a = ds[0], b = ds[ds.length - 1];
    if (!b.hasY && (b.mo < a.mo || (b.mo === a.mo && b.d < a.d))) b.y = a.y + 1;
    from = noteIso(a.y, a.mo, a.d); to = noteIso(b.y, b.mo, b.d);
    if (from > to) { var tmp = from; from = to; to = tmp; }
  } else if (ds.length === 1) {
    var before = noteNorm(t.substring(Math.max(0, ds[0].idx - 28), ds[0].idx));
    var iso = noteIso(ds[0].y, ds[0].mo, ds[0].d);
    if (/(^|\s)(tu|bat dau|ap dung tu|khoi dong)\s*(ngay)?\s*$/.test(before) && !/(den|het)\s*(ngay)?\s*$/.test(before)) from = iso; else to = iso;
  }
  return { from: from, to: to };
}

// ---------- phân loại bằng từ khóa (không cần AI) ----------
var NOTE_KW = {
  promo: ["khuyen mai", "ctkm", "giam gia", "giam them", "giam sau", "uu dai", "qua tang", "tang kem", "tang them", "voucher", "flash sale", "combo", "deal", "thu cu doi moi", "tra gop 0", "ma giam", "chuong trinh", "trade in", "gia soc", "sale", "mua kem"],
  forever: ["lau dai", "thuong xuyen", "khong gioi han", "den khi co thong bao", "ap dung lien tuc", "khong thoi han"],
  serve: ["phuc vu", "khach hang", "giao tiep", "chao khach", "thai do", "trai nghiem", "cham soc", "don tiep", "tac phong", "dong phuc", "ve sinh", "trung bay", "sau ban hang", "tu van", "ky nang", "tieu chuan"],
  process: ["quy trinh", "cac buoc", "buoc 1", "buoc 2", "huong dan", "thao tac", "sop", "checklist", "nhap kho", "kiem ke", "ban giao", "xu ly", "lam theo"],
  policy: ["chinh sach", "bao hanh", "doi tra", "hoan tien", "dieu khoan", "quy dinh", "noi quy", "thuong phat", "ky luat", "hoa hong", "khen thuong", "dieu kien ap dung", "luong thuong"]
};
var NOTE_BRANDS = ["iphone", "ipad", "macbook", "apple watch", "airpods", "samsung", "oppo", "xiaomi", "realme", "vivo", "honor", "laptop", "tablet", "dien thoai", "may tinh", "tai nghe", "sac", "op lung", "bao hanh", "tra gop", "tivi", "tu lanh", "may giat", "dieu hoa"];

function noteFirstLine(text) {
  var lines = String(text || "").split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) { var l = lines[i].replace(/^[\s#*\-•>]+/, "").trim(); if (l.length >= 3 && !/^https?:\/\//i.test(l)) return l.substring(0, 80); }
  return "";
}

function noteRuleClassify(text, fileNames) {
  var raw = String(text || "") + " " + (fileNames || []).join(" ");
  var n = noteNorm(raw);
  var score = { promo: 0, forever: 0, serve: 0, process: 0, policy: 0 }, hits = [];
  Object.keys(NOTE_KW).forEach(function (k) { NOTE_KW[k].forEach(function (kw) { if (noteHas(n, kw)) { score[k]++; hits.push(kw); } }); });
  var dates = noteRuleDates(text);
  var other = Math.max(score.serve, score.process, score.policy), cat = "khac";
  if (score.promo > 0 && score.promo >= other) cat = (score.forever > 0 || !dates.to) ? "ctkm_ld" : "ctkm_tg";
  else if (other > 0) {
    if (score.process === other) cat = "quy_trinh";
    else if (score.policy === other) cat = "chinh_sach";
    else cat = "phuc_vu";
  }
  var tags = [];
  NOTE_BRANDS.forEach(function (b) { if (noteHas(n, b)) tags.push(b); });
  hits.forEach(function (h) { if (tags.indexOf(h) === -1 && tags.length < 12) tags.push(h); });
  return { category: cat, validFrom: cat === "ctkm_tg" ? dates.from : "", validTo: cat === "ctkm_tg" ? dates.to : "", tags: tags.slice(0, 10) };
}

// ---------- gọi AI (Anthropic hoặc Gemini) ----------
function aiConfig() {
  var p = PropertiesService.getScriptProperties();
  var provider = String(p.getProperty("AI_PROVIDER") || "anthropic").toLowerCase();
  return { key: p.getProperty("AI_API_KEY"), provider: provider, model: p.getProperty("AI_MODEL") || (provider === "gemini" ? "gemini-2.5-flash" : "claude-haiku-5-5") };
}

function aiCall(system, text, images) {
  var cfg = aiConfig();
  if (!cfg.key) throw new Error("NO_KEY");
  var res, body, code;
  if (cfg.provider === "gemini") {
    var parts = [{ text: text }];
    (images || []).forEach(function (im) { parts.push({ inline_data: { mime_type: im.mime, data: im.base64 } }); });
    res = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(cfg.model) + ":generateContent", {
      method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { "x-goog-api-key": cfg.key },
      payload: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: parts }], generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 1600 } })
    });
    code = res.getResponseCode(); body = res.getContentText();
    if (code !== 200) throw new Error("AI HTTP " + code + ": " + body.substring(0, 160));
    var jg = JSON.parse(body), out = "";
    ((jg.candidates && jg.candidates[0] && jg.candidates[0].content && jg.candidates[0].content.parts) || []).forEach(function (p) { if (p.text) out += p.text; });
    return out;
  }
  var content = [];
  (images || []).forEach(function (im) { content.push({ type: (im.mime === "application/pdf" ? "document" : "image"), source: { type: "base64", media_type: im.mime, data: im.base64 } }); });
  content.push({ type: "text", text: text });
  res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true, headers: { "x-api-key": cfg.key, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify({ model: cfg.model, max_tokens: 1600, system: system, messages: [{ role: "user", content: content }] })
  });
  code = res.getResponseCode(); body = res.getContentText();
  if (code !== 200) throw new Error("AI HTTP " + code + ": " + body.substring(0, 160));
  var ja = JSON.parse(body), t = "";
  (ja.content || []).forEach(function (b) { if (b.type === "text") t += b.text; });
  return t;
}

function noteSystemPrompt() {
  return "Bạn là trợ lý phân loại tài liệu nội bộ cho chuỗi bán lẻ điện thoại - điện máy (Thế Giới Di Động, TopZone). Hôm nay là " + todayStr() + ". " +
    "Quản lý gửi nội dung triển khai (text, link, ảnh poster, tên file). Hãy xếp vào ĐÚNG 1 danh mục:\n" +
    "- ctkm_tg: chương trình khuyến mãi/ưu đãi CÓ thời hạn (có ngày bắt đầu hoặc kết thúc)\n" +
    "- ctkm_ld: khuyến mãi/ưu đãi áp dụng lâu dài, không có ngày kết thúc\n" +
    "- phuc_vu: tiêu chuẩn phục vụ khách hàng, giao tiếp, trưng bày, vệ sinh, tác phong\n" +
    "- quy_trinh: quy trình, hướng dẫn các bước thao tác\n" +
    "- chinh_sach: chính sách (bảo hành, đổi trả, thưởng phạt, quy định, nội quy)\n" +
    "- khac: nội dung còn lại\n" +
    "Chỉ trả về MỘT đối tượng JSON, không giải thích: {\"category\":\"...\",\"title\":\"...\",\"summary\":\"...\",\"valid_from\":\"YYYY-MM-DD hoặc rỗng\",\"valid_to\":\"YYYY-MM-DD hoặc rỗng\",\"tags\":[\"...\"],\"brief\":{\"points\":[\"...\"],\"time\":[\"...\"],\"products\":[\"...\"],\"offer\":[\"...\"],\"notes\":[\"...\"],\"todo\":[\"...\"]}}. " +
    "title tiếng Việt tối đa 80 ký tự, nêu rõ chương trình/chủ đề. summary tối đa 220 ký tự, nêu ý chính (mức giảm, điều kiện, đối tượng). " +
    "valid_from/valid_to chỉ điền khi nội dung có ngày áp dụng (nếu thiếu năm, chọn năm hợp lý gần ngày hôm nay). tags 3-8 từ khóa tiếng Việt: tên sản phẩm/ngành hàng/chủ đề và cách gọi khác nhân viên hay dùng để tìm. " +
    "brief là BẢNG TÓM TẮT để nhân viên đọc nhanh, mỗi trường là mảng chuỗi ngắn gọn (mỗi ý tối đa 150 ký tự, tối đa 6 ý). Chỉ lấy thông tin CÓ trong nội dung, tuyệt đối không bịa; không có thì để mảng rỗng. " +
    "points = các ý chính cần nhớ; time = mốc thời gian (ngày áp dụng, khung giờ, hạn chót, ghi đủ ngày/tháng/năm); products = sản phẩm/ngành hàng/nhãn hàng/mã hàng áp dụng (nêu rõ loại trừ nếu có); " +
    "offer = mức ưu đãi, giá, quà tặng, điều kiện áp dụng, thưởng/hoa hồng; notes = lưu ý, ngoại lệ, trường hợp không áp dụng, lỗi hay gặp; todo = việc nhân viên/cửa hàng phải làm (thao tác, báo cáo, hạn).";
}

function noteParseJson(s) {
  var a = String(s || "").indexOf("{"), b = String(s || "").lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("AI không trả JSON");
  return JSON.parse(String(s).substring(a, b + 1));
}
function noteIsDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }

// ---------- BẢNG TÓM TẮT CÔNG VĂN (brief): points Ý chính | time Thời gian | products Sản phẩm | offer Ưu đãi/Điều kiện | notes Lưu ý | todo Việc cần làm ----------
var NOTE_BRIEF_KEYS = ["points", "time", "products", "offer", "notes", "todo"];
function noteCleanBrief(b) {
  if (!b || typeof b !== "object") return null;
  var out = {}, any = false;
  NOTE_BRIEF_KEYS.forEach(function (k) {
    var v = b[k];
    if (typeof v === "string") v = v.split(/\r?\n/);
    if (Object.prototype.toString.call(v) !== "[object Array]") v = [];
    out[k] = v.map(function (x) { return String(x === null || x === undefined ? "" : x).replace(/^[\s\-•*]+/, "").trim().substring(0, 220); }).filter(Boolean).slice(0, 8);
    if (out[k].length) any = true;
  });
  return any ? out : null;
}
function noteParseStoredBrief(v) {
  try { return v ? noteCleanBrief(JSON.parse(String(v))) : null; } catch (e) { return null; }
}
function noteFmtDMY(iso) { return noteIsDate(iso) ? iso.substring(8, 10) + "/" + iso.substring(5, 7) + "/" + iso.substring(0, 4) : ""; }

// Bảng tóm tắt dự phòng khi chưa có AI: bóc theo từ khóa (đủ dùng, AI sẽ chi tiết hơn)
function noteRuleBrief(text, rule, fileNames) {
  var lines = String(text || "").split(/\r?\n+/).map(function (l) { return l.replace(/^[\s#*\-•>]+/, "").trim(); })
    .filter(function (l) { return l.length >= 6 && !/^https?:\/\/\S+$/i.test(l); });
  var used = {}, b = { points: [], time: [], products: [], offer: [], notes: [], todo: [] };
  function pick(key, re, max) {
    lines.forEach(function (l, i) {
      if (used[i] || b[key].length >= max) return;
      if (re.test(noteNorm(l))) { used[i] = true; b[key].push(l.substring(0, 180)); }
    });
  }
  pick("notes", /(luu y|chu y|khong ap dung|ngoai tru|han che|khong cong don|chi ap dung|so luong co han|dieu kien)/, 4);
  pick("offer", /(giam|tang|uu dai|qua |tra gop|voucher|\d+\s*%|trieu|hoa hong|thuong)/, 3);
  pick("todo", /(yeu cau|phai |trien khai|thuc hien|nhan vien|cua hang|bao cao|truoc ngay)/, 3);
  lines.forEach(function (l, i) { if (!used[i] && b.points.length < 4) b.points.push(l.substring(0, 180)); });
  var d = noteRuleDates(text), from = (rule && rule.validFrom) || d.from, to = (rule && rule.validTo) || d.to;
  if (from || to) b.time.push("Áp dụng: " + (noteFmtDMY(from) || "...") + " → " + (noteFmtDMY(to) || "..."));
  ((rule && rule.tags) || []).forEach(function (t) { if (NOTE_BRANDS.indexOf(t) >= 0 && b.products.length < 6) b.products.push(t); });
  return noteCleanBrief(b);
}


// Phân loại 1 nội dung. Không bao giờ ném lỗi: AI lỗi -> tự dùng bộ lọc từ khóa.
function noteClassify(input) {
  var text = String(input.text || "").substring(0, 12000);
  var links = input.links || [], fileNames = input.fileNames || [];
  var rule = noteRuleClassify(text, fileNames);
  var title = noteFirstLine(text) || (fileNames[0] ? String(fileNames[0]).replace(/\.[^.]+$/, "") : "") || "Nội dung chưa có tiêu đề";
  var summary = text.replace(/\s+/g, " ").trim().substring(0, 200);
  var out = { category: rule.category, title: title, summary: summary, validFrom: rule.validFrom, validTo: rule.validTo, tags: rule.tags, brief: noteRuleBrief(text, rule, fileNames), by: "RULE", note: "" };
  var images = (input.images || []).filter(function (im) { return im && /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(im.mime) && im.base64 && String(im.base64).length < (im.mime === "application/pdf" ? 5500000 : 2500000); }).slice(0, 4);
  if (!text.trim() && !images.length && !fileNames.length && !links.length) return out;
  var cfg = aiConfig();
  if (!cfg.key) { out.note = "Chưa cài AI_API_KEY nên dùng bộ lọc từ khóa (vẫn sửa được danh mục)."; return out; }
  try {
    var userText = "NỘI DUNG QUẢN LÝ GỬI:\n" + (text.trim() || "(không có text)") +
      (links.length ? "\n\nLINK:\n" + links.slice(0, 10).join("\n") : "") +
      (fileNames.length ? "\n\nTÊN FILE ĐÍNH KÈM: " + fileNames.join(", ") : "") +
      (images.length ? "\n\n(Có " + images.length + " tệp ảnh/PDF đính kèm, hãy đọc kỹ chữ trong đó để phân loại và lập bảng tóm tắt)" : "");
    var j = noteParseJson(aiCall(noteSystemPrompt(), userText, images));
    if (NOTE_CATS[j.category]) out.category = j.category;
    if (j.title && String(j.title).trim()) out.title = String(j.title).trim().substring(0, 100);
    if (j.summary && String(j.summary).trim()) out.summary = String(j.summary).trim().substring(0, 300);
    if (Object.prototype.toString.call(j.tags) === "[object Array]") out.tags = j.tags.map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 10);
    out.validFrom = noteIsDate(j.valid_from) ? j.valid_from : "";
    out.validTo = noteIsDate(j.valid_to) ? j.valid_to : "";
    if (out.category === "ctkm_tg" && !out.validFrom && !out.validTo) { out.validFrom = rule.validFrom; out.validTo = rule.validTo; }
    if (out.category !== "ctkm_tg") { out.validFrom = ""; out.validTo = ""; }
    var bj = noteCleanBrief(j.brief); if (bj) out.brief = bj;
    out.by = "AI";
  } catch (err) {
    out.note = (String(err).indexOf("Exception") >= 0 && String(err).indexOf("UrlFetchApp") >= 0)
      ? "Chưa cấp quyền gọi AI: chạy hàm testAi() trong Apps Script 1 lần rồi Deploy bản mới. Tạm dùng từ khóa."
      : "AI chưa phản hồi (" + String(err).substring(0, 120) + "). Tạm dùng từ khóa.";
  }
  return out;
}

function testAi() {
  var r = noteClassify({ text: "CTKM iPhone 17: giảm thêm 2 triệu khi thanh toán qua thẻ, từ 15/10 đến 31/10/2026. Tặng kèm sạc 20W.", links: [], fileNames: [], images: [] });
  Logger.log(JSON.stringify(r));
  return r;
}

function handleClassifyNote(data) {
  try {
    var r = noteClassify(data);
    r.categoryLabel = NOTE_CATS[r.category];
    return createJsonResponse({ status: "success", result: r });
  } catch (err) {
    return createJsonResponse({ status: "error", message: "Không phân loại được: " + err });
  }
}

// ---------- đọc / ghi ----------
// Sheet cũ (15 cột) tự được thêm cột P "Bảng tóm tắt (JSON)"
function noteEnsureCols(sh) {
  if (sh.getMaxColumns() < NOTE_NCOL) sh.insertColumnsAfter(sh.getMaxColumns(), NOTE_NCOL - sh.getMaxColumns());
  var hd = sh.getRange(1, 1, 1, NOTE_NCOL).getValues()[0];
  for (var i = 0; i < NOTE_NCOL; i++) if (!hd[i]) sh.getRange(1, i + 1).setValue(NOTE_HEADERS[i]);
  return sh;
}
function noteSheet(ss) { return noteEnsureCols(getOrCreateSheet(ss, SH_NOTE, NOTE_HEADERS)); }

function noteRowToObj(r, rowNum) {
  var files = [], links = [], tags = [];
  try { files = r[9] ? JSON.parse(r[9]) : []; } catch (e) { files = []; }
  links = String(r[8] || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
  tags = String(r[10] || "").split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  return {
    row: rowNum, id: String(r[0]), date: normDate(r[1]), time: String(r[2] || ""),
    title: String(r[3] || ""), text: String(r[4] || ""), category: NOTE_CATS[r[5]] ? String(r[5]) : "khac",
    validFrom: normDate(r[6]), validTo: normDate(r[7]), links: links, files: files, tags: tags,
    summary: String(r[11] || ""), by: String(r[12] || ""), pin: String(r[13]) === "1", author: String(r[14] || ""), brief: noteParseStoredBrief(r[15]), task: noteParseTask(r[16])
  };
}

function readNotes(ss) {
  var sh = ss.getSheetByName(SH_NOTE);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, NOTE_NCOL);
  for (var i = 0; i < vals.length; i++) { if (vals[i][0]) out.push(noteRowToObj(vals[i], i + 2)); }
  return out;
}

function handleFetchNotes() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var list = readNotes(ss).map(function (n) { delete n.row; return n; });
  var reads = lbSafe(function () { return nrRead(ss).map(function (x) { delete x.row; return x; }); }, []);
  var results = lbSafe(function () { return nkRead(ss).map(function (x) { delete x.row; return x; }); }, []);
  return createJsonResponse({ status: "success", notes: list, reads: reads, results: results, serverTime: new Date().getTime() });
}

function handleFetchNotesCached() {
  var hit = cacheBigGet("NOTES_");
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var out = handleFetchNotes().getContent();
  cacheBigPut("NOTES_", out, 60);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function noteExtractLinks(text, extra) {
  var seen = {}, out = [];
  var all = (extra || []).concat(String(text || "").match(/https?:\/\/[^\s<>"')\]]+/g) || []);
  all.forEach(function (u) { u = String(u).trim().replace(/[.,;]+$/, ""); if (/^https?:\/\//i.test(u) && !seen[u] && out.length < 20) { seen[u] = true; out.push(u); } });
  return out;
}

function handlePostNote(data) {
  if (!notePinOk(data)) return createJsonResponse({ status: "error", message: "Sai mật khẩu Quản lý (MANAGER_PIN)!" });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var text = String(data.text || "").substring(0, NOTE_MAX_TEXT);
  var files = data.files || [];
  var links = noteExtractLinks(text, data.links || []);
  if (!text.trim() && !links.length && !files.length) return createJsonResponse({ status: "error", message: "Chưa có nội dung, link hoặc file nào để đăng!" });
  if (files.length > NOTE_MAX_FILES) return createJsonResponse({ status: "error", message: "Tối đa " + NOTE_MAX_FILES + " file mỗi lần đăng!" });
  for (var i = 0; i < files.length; i++) {
    var f = files[i] || {};
    if (!NOTE_MIME_EXT[f.mime]) return createJsonResponse({ status: "error", message: "File \"" + (f.name || (i + 1)) + "\" không đúng định dạng (nhận ảnh, PDF, Word, Excel, PowerPoint, TXT, CSV)!" });
    if (!f.base64 || String(f.base64).length < 20) return createJsonResponse({ status: "error", message: "File \"" + (f.name || (i + 1)) + "\" bị rỗng!" });
    if (String(f.base64).length > NOTE_MAX_B64) return createJsonResponse({ status: "error", message: "File \"" + (f.name || (i + 1)) + "\" quá lớn (tối đa ~6MB)!" });
  }

  var id = "N" + new Date().getTime().toString(36) + Math.floor(Math.random() * 36).toString(36);
  var created = [], saved = [];
  try {
    if (files.length) {
      var folder = getNotesFolder();
      files.forEach(function (f, idx) {
        var safe = String(f.name || ("file" + (idx + 1))).replace(/[\\\/:*?"<>|]+/g, "_").substring(0, 80);
        if (safe.toLowerCase().indexOf("." + NOTE_MIME_EXT[f.mime]) < 0) safe += "." + NOTE_MIME_EXT[f.mime];
        var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(f.base64), f.mime, id + "_" + (idx + 1) + "_" + safe));
        created.push(file);
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
        saved.push({ id: file.getId(), name: safe, mime: f.mime });
      });
    }
  } catch (err) {
    created.forEach(function (x) { try { x.setTrashed(true); } catch (e) {} });
    return createJsonResponse({ status: "error", message: "Không lưu được file vào Google Drive (đã chạy authorizeDrive và Deploy bản mới chưa?): " + err });
  }

  var cat = String(data.category || ""), by = String(data.by || "QL");
  var title = String(data.title || "").trim(), summary = String(data.summary || "").trim();
  var tags = (data.tags || []).map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 12);
  var vFrom = noteIsDate(data.validFrom) ? data.validFrom : "", vTo = noteIsDate(data.validTo) ? data.validTo : "";
  if (!NOTE_CATS[cat]) {                                                      // chưa phân loại -> bộ lọc từ khóa (nhanh, không gọi mạng khi đang giữ khóa)
    var rc = noteRuleClassify(text, saved.map(function (x) { return x.name; }));
    cat = rc.category; by = "RULE";
    if (!vFrom && !vTo) { vFrom = rc.validFrom; vTo = rc.validTo; }
    if (!tags.length) tags = rc.tags;
  }
  if (cat !== "ctkm_tg") { vFrom = ""; vTo = ""; }
  var brief = noteCleanBrief(data.brief) || noteRuleBrief(text, { validFrom: vFrom, validTo: vTo, tags: tags }, saved.map(function (x) { return x.name; }));   // luôn có bảng tóm tắt, AI lỗi thì dùng bản từ khóa
  if (!title) title = noteFirstLine(text) || (saved[0] ? saved[0].name.replace(/\.[^.]+$/, "") : "Nội dung chưa có tiêu đề");
  if (!summary) summary = text.replace(/\s+/g, " ").trim().substring(0, 200);

  var task = noteCleanTask(data.task);
  var sh = noteSheet(ss), row = sh.getLastRow() + 1, now = Utilities.formatDate(new Date(), tz(), "HH:mm");
  sh.getRange(row, 1, 1, NOTE_NCOL).setNumberFormat("@");
  sh.getRange(row, 1, 1, NOTE_NCOL).setValues([[id, todayStr(), now, title.substring(0, 150), text, cat, vFrom, vTo, links.join("\n"), JSON.stringify(saved), tags.join(", "), summary.substring(0, 300), by, data.pin ? "1" : "0", String(data.author || "Quản lý"), brief ? JSON.stringify(brief) : "", task ? JSON.stringify(task) : ""]]);
  return createJsonResponse({
    status: "success",
    message: "Đã đăng vào mục \"" + NOTE_CATS[cat] + "\"" + (saved.length ? " (" + saved.length + " file lưu Drive)" : ""),
    note: { id: id, date: todayStr(), time: now, title: title.substring(0, 150), text: text, category: cat, validFrom: vFrom, validTo: vTo, links: links, files: saved, tags: tags, summary: summary.substring(0, 300), by: by, pin: !!data.pin, author: String(data.author || "Quản lý"), brief: brief, task: task }
  });
}

function noteFindRow(ss, id) {
  var sh = ss.getSheetByName(SH_NOTE);
  if (!sh || sh.getLastRow() < 2) return null;
  noteEnsureCols(sh);
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return { sh: sh, row: i + 2 };
  return null;
}

function handleUpdateNote(data) {
  if (!notePinOk(data)) return createJsonResponse({ status: "error", message: "Sai mật khẩu Quản lý (MANAGER_PIN)!" });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID), id = String(data.id || "");
  var f = noteFindRow(ss, id);
  if (!f) return createJsonResponse({ status: "error", message: "Không tìm thấy nội dung này (có thể đã bị xóa)!" });
  var cur = f.sh.getRange(f.row, 1, 1, NOTE_NCOL).getValues()[0];
  if (data.title !== undefined) cur[3] = String(data.title).substring(0, 150);
  if (data.text !== undefined) cur[4] = String(data.text).substring(0, NOTE_MAX_TEXT);
  if (data.category !== undefined && NOTE_CATS[data.category]) { if (cur[5] !== data.category) cur[12] = "QL"; cur[5] = data.category; }
  if (data.validFrom !== undefined) cur[6] = noteIsDate(data.validFrom) ? data.validFrom : "";
  if (data.validTo !== undefined) cur[7] = noteIsDate(data.validTo) ? data.validTo : "";
  if (cur[5] !== "ctkm_tg") { cur[6] = ""; cur[7] = ""; }
  if (data.tags !== undefined) cur[10] = (data.tags || []).join(", ");
  if (data.summary !== undefined) cur[11] = String(data.summary).substring(0, 300);
  if (data.pin !== undefined) cur[13] = data.pin ? "1" : "0";
  if (data.brief !== undefined) { var bq = data.brief ? noteCleanBrief(data.brief) : null; cur[15] = bq ? JSON.stringify(bq) : ""; }
  if (data.task !== undefined) { var tq = data.task ? noteCleanTask(data.task) : null; cur[16] = tq ? JSON.stringify(tq) : ""; }
  f.sh.getRange(f.row, 1, 1, NOTE_NCOL).setNumberFormat("@");
  f.sh.getRange(f.row, 1, 1, NOTE_NCOL).setValues([cur]);
  return createJsonResponse({ status: "success", message: "Đã cập nhật", note: noteRowToObj(cur, f.row) });
}

function handleDeleteNote(data) {
  if (!notePinOk(data)) return createJsonResponse({ status: "error", message: "Sai mật khẩu Quản lý (MANAGER_PIN)!" });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID), id = String(data.id || "");
  var f = noteFindRow(ss, id);
  if (!f) return createJsonResponse({ status: "error", message: "Không tìm thấy nội dung này!" });
  var n = noteRowToObj(f.sh.getRange(f.row, 1, 1, NOTE_NCOL).getValues()[0], f.row);
  n.files.forEach(function (x) { try { DriveApp.getFileById(x.id).setTrashed(true); } catch (e) {} });
  f.sh.deleteRow(f.row);
  lbSafe(function () { nrDeleteFor(ss, id); nkDeleteFor(ss, id); }, null);   // xóa luôn dữ liệu đã đọc của nội dung này
  return createJsonResponse({ status: "success", message: "Đã xóa nội dung" });
}


// =====================================================================
// XÁC NHẬN ĐÃ ĐỌC NỘI DUNG: nhân viên mở nội dung -> ghi "Mở lúc"; bấm "Tôi đã đọc và nắm rõ" -> ghi "Xác nhận lúc" + thời gian đọc.
//   Sheet Data_NoiDung_DaDoc: A ID nội dung | B Mã NV | C Tên NV | D Mở lúc | E Xác nhận lúc | F Từ mở đến xác nhận (giây, do SERVER đo)
//                             | G Thời gian đọc thực tế (giây, app đo lúc đang mở màn hình nội dung) | H Mở lúc (ms)
//   Mỗi (nội dung, nhân viên) chỉ 1 dòng. Đã xác nhận rồi thì không ghi đè (giữ mốc thời gian đầu tiên).
// =====================================================================
var SH_NR = "Data_NoiDung_DaDoc";
var NR_HEADERS = ["ID nội dung", "Mã NV", "Tên NV", "Mở lúc", "Xác nhận lúc", "Từ mở đến xác nhận (giây)", "Đọc thực tế (giây)", "Mở lúc (ms)"];
var NR_NCOL = 8;

function nrNow() { return Utilities.formatDate(new Date(), tz(), "yyyy-MM-dd HH:mm:ss"); }
function nrStr(v) { return v instanceof Date ? Utilities.formatDate(v, tz(), "yyyy-MM-dd HH:mm:ss") : String(v === null || v === undefined ? "" : v); }

function nrRead(ss) {
  var sh = ss.getSheetByName(SH_NR), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, NR_NCOL);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    out.push({ row: i + 2, noteId: String(r[0]), staffId: String(r[1]), staffName: String(r[2]), openedAt: nrStr(r[3]), confirmedAt: nrStr(r[4]), sec: Number(r[5]) || 0, activeSec: Number(r[6]) || 0, openedMs: Number(r[7]) || 0 });
  }
  return out;
}
function nrFind(list, noteId, staffId) {
  for (var i = 0; i < list.length; i++) if (list[i].noteId === noteId && list[i].staffId === staffId) return list[i];
  return null;
}
function nrPublic(r) { return { noteId: r.noteId, staffId: r.staffId, staffName: r.staffName, openedAt: r.openedAt, confirmedAt: r.confirmedAt, sec: r.sec, activeSec: r.activeSec }; }

// Kiểm tra nhân viên có trong DM_NhanSu và nội dung còn tồn tại; trả tên chuẩn hoặc ném lỗi
function nrCheck(ss, data) {
  var noteId = String(data.noteId || ""), staffId = String(data.staffId || "");
  if (!noteId || !staffId) throw new Error("Thiếu nội dung hoặc nhân viên!");
  var sheetNS = ss.getSheetByName(SH_NS), name = "";
  if (sheetNS && sheetNS.getLastRow() > 1) {
    readRows(sheetNS, 8).forEach(function (r) { if (String(r[0]) === staffId && !nsIsHidden(r[7])) name = String(r[1]); });
  }
  if (!name) throw new Error("Không tìm thấy nhân viên " + staffId + "!");
  if (!noteFindRow(ss, noteId)) throw new Error("Nội dung này không còn tồn tại (có thể Quản lý đã xóa)!");
  return { noteId: noteId, staffId: staffId, staffName: name };
}
function nrAppend(ss, c) {
  var sh = getOrCreateSheet(ss, SH_NR, NR_HEADERS), row = sh.getLastRow() + 1, ms = new Date().getTime();
  sh.getRange(row, 1, 1, NR_NCOL).setNumberFormat("@");
  sh.getRange(row, 1, 1, NR_NCOL).setValues([[c.noteId, c.staffId, c.staffName, nrNow(), "", "", "", String(ms)]]);
  return { row: row, noteId: c.noteId, staffId: c.staffId, staffName: c.staffName, openedAt: nrNow(), confirmedAt: "", sec: 0, activeSec: 0, openedMs: ms };
}

function handleNoteOpen(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID), c = nrCheck(ss, data);
    var rec = nrFind(nrRead(ss), c.noteId, c.staffId) || nrAppend(ss, c);
    return createJsonResponse({ status: "success", record: nrPublic(rec) });
  } catch (err) { return createJsonResponse({ status: "error", message: String(err.message || err) }); }
}

function handleNoteConfirm(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID), c = nrCheck(ss, data);
    var rec = nrFind(nrRead(ss), c.noteId, c.staffId) || nrAppend(ss, c);
    if (rec.confirmedAt) return createJsonResponse({ status: "success", message: "Bạn đã xác nhận nội dung này rồi.", record: nrPublic(rec) });
    var nowMs = new Date().getTime(), diff = Math.max(0, Math.round((nowMs - (rec.openedMs || nowMs)) / 1000));
    var active = Math.max(0, Math.min(Math.round(Number(data.activeSec) || 0), diff));   // không thể đọc lâu hơn thời gian từ lúc mở
    var sh = ss.getSheetByName(SH_NR), at = nrNow();
    sh.getRange(rec.row, 5, 1, 3).setNumberFormat("@");
    sh.getRange(rec.row, 5, 1, 3).setValues([[at, diff, active]]);
    rec.confirmedAt = at; rec.sec = diff; rec.activeSec = active;
    return createJsonResponse({ status: "success", message: "Đã ghi nhận bạn nắm rõ nội dung.", record: nrPublic(rec) });
  } catch (err) { return createJsonResponse({ status: "error", message: String(err.message || err) }); }
}

function nrDeleteFor(ss, noteId) {
  var sh = ss.getSheetByName(SH_NR);
  if (!sh) return;
  nrRead(ss).filter(function (r) { return r.noteId === noteId; }).sort(function (a, b) { return b.row - a.row; }).forEach(function (r) { sh.deleteRow(r.row); });
}


// =====================================================================
// GIAO VIỆC TỪ NỘI DUNG: Quản lý tick nhân viên cần làm (+ hạn) -> nhân viên làm xong gửi KẾT QUẢ (text / link / ảnh / file) -> Quản lý duyệt hoặc yêu cầu làm lại.
//   Cột Q của Data_NoiDung: {"ids":["NV01","NV02"],"due":"2026-10-20"}
//   Sheet Data_NoiDung_KetQua: A ID nội dung | B Mã NV | C Tên NV | D Nộp lúc | E Nội dung | F Link | G File (JSON) | H Trạng thái | I Nhận xét QL | J Số lần nộp | K Duyệt lúc
//   Mỗi (nội dung, nhân viên) 1 dòng; nộp lại thì thay kết quả cũ (file cũ vào thùng rác), đã duyệt thì khóa.
// =====================================================================
var SH_NK = "Data_NoiDung_KetQua";
var NK_HEADERS = ["ID nội dung", "Mã NV", "Tên NV", "Nộp lúc", "Nội dung", "Link", "File (JSON)", "Trạng thái", "Nhận xét QL", "Số lần nộp", "Duyệt lúc"];
var NK_NCOL = 11, NK_MAX_FILES = 6, NK_PENDING = "Chờ duyệt", NK_OK = "Đã duyệt", NK_REDO = "Làm lại";

function noteCleanTask(t) {
  if (!t || typeof t !== "object") return null;
  var seen = {}, ids = [];
  (Object.prototype.toString.call(t.ids) === "[object Array]" ? t.ids : []).forEach(function (x) { x = String(x || "").trim(); if (x && !seen[x] && ids.length < 200) { seen[x] = true; ids.push(x); } });
  return ids.length ? { ids: ids, due: noteIsDate(t.due) ? t.due : "" } : null;
}
function noteParseTask(v) { try { return v ? noteCleanTask(JSON.parse(String(v))) : null; } catch (e) { return null; } }

function nkRead(ss) {
  var sh = ss.getSheetByName(SH_NK), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = readRows(sh, NK_NCOL);
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i], files = [];
    if (!r[0]) continue;
    try { files = r[6] ? JSON.parse(r[6]) : []; } catch (e) { files = []; }
    out.push({ row: i + 2, noteId: String(r[0]), staffId: String(r[1]), staffName: String(r[2]), at: nrStr(r[3]), text: String(r[4] || ""),
      links: String(r[5] || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean), files: files,
      status: String(r[7] || NK_PENDING), comment: String(r[8] || ""), count: Number(r[9]) || 1, reviewedAt: nrStr(r[10]) });
  }
  return out;
}
function nkFind(list, noteId, staffId) {
  for (var i = 0; i < list.length; i++) if (list[i].noteId === noteId && list[i].staffId === staffId) return list[i];
  return null;
}
function nkPub(r) { var o = {}; for (var k in r) if (k !== "row") o[k] = r[k]; return o; }
function nkStaffName(ss, sid) {
  var nm = "", sh = ss.getSheetByName(SH_NS);
  if (sh && sh.getLastRow() > 1) readRows(sh, 8).forEach(function (r) { if (String(r[0]) === sid && !nsIsHidden(r[7])) nm = String(r[1]); });
  return nm;
}
function nkCheckFiles(files) {
  if (files.length > NK_MAX_FILES) throw new Error("Tối đa " + NK_MAX_FILES + " file mỗi lần nộp!");
  files.forEach(function (f, i) {
    f = f || {};
    if (!NOTE_MIME_EXT[f.mime]) throw new Error("File \"" + (f.name || (i + 1)) + "\" không đúng định dạng (nhận ảnh, PDF, Word, Excel, PowerPoint, TXT, CSV)!");
    if (!f.base64 || String(f.base64).length < 20) throw new Error("File \"" + (f.name || (i + 1)) + "\" bị rỗng!");
    if (String(f.base64).length > NOTE_MAX_B64) throw new Error("File \"" + (f.name || (i + 1)) + "\" quá lớn (tối đa ~6MB)!");
  });
}
function nkUploadFiles(files, tag) {
  var created = [], saved = [];
  try {
    var folder = getNotesFolder();
    files.forEach(function (f, idx) {
      var safe = String(f.name || ("file" + (idx + 1))).replace(/[\\\/:*?"<>|]+/g, "_").substring(0, 80);
      if (safe.toLowerCase().indexOf("." + NOTE_MIME_EXT[f.mime]) < 0) safe += "." + NOTE_MIME_EXT[f.mime];
      var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(f.base64), f.mime, tag + "_" + (idx + 1) + "_" + safe));
      created.push(file);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
      saved.push({ id: file.getId(), name: safe, mime: f.mime });
    });
  } catch (err) {
    created.forEach(function (x) { try { x.setTrashed(true); } catch (e) {} });
    throw new Error("Không lưu được file vào Google Drive (đã chạy authorizeDrive và Deploy bản mới chưa?): " + err);
  }
  return saved;
}
function nkTrash(files) { (files || []).forEach(function (x) { try { DriveApp.getFileById(x.id).setTrashed(true); } catch (e) {} }); }

function handleNoteSubmit(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID), id = String(data.noteId || ""), sid = String(data.staffId || "");
    var f = noteFindRow(ss, id);
    if (!f) throw new Error("Nội dung không còn tồn tại (có thể Quản lý đã xóa)!");
    var note = noteRowToObj(f.sh.getRange(f.row, 1, 1, NOTE_NCOL).getValues()[0], f.row);
    if (!note.task || note.task.ids.indexOf(sid) < 0) throw new Error("Bạn không nằm trong danh sách được giao việc này!");
    var name = nkStaffName(ss, sid);
    if (!name) throw new Error("Không tìm thấy nhân viên " + sid + "!");
    var text = String(data.text || "").substring(0, 5000), files = data.files || [];
    var links = noteExtractLinks(text, data.links || []);
    if (!text.trim() && !links.length && !files.length) throw new Error("Hãy nhập kết quả, dán link hoặc đính kèm ảnh/file trước khi gửi!");
    nkCheckFiles(files);
    var ex = nkFind(nkRead(ss), id, sid);
    if (ex && ex.status === NK_OK) throw new Error("Kết quả của bạn đã được Quản lý duyệt, không thể nộp lại.");
    var saved = files.length ? nkUploadFiles(files, "KQ_" + id + "_" + sid) : [];
    var sh = getOrCreateSheet(ss, SH_NK, NK_HEADERS), at = nrNow(), count = (ex ? ex.count : 0) + 1;
    var vals = [id, sid, name, at, text, links.join("\n"), JSON.stringify(saved), NK_PENDING, "", count, ""];
    var row = ex ? ex.row : sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, NK_NCOL).setNumberFormat("@");
    sh.getRange(row, 1, 1, NK_NCOL).setValues([vals]);
    if (ex) nkTrash(ex.files);
    return createJsonResponse({ status: "success", message: ex ? "Đã nộp lại kết quả!" : "Đã gửi kết quả công việc!", record: { noteId: id, staffId: sid, staffName: name, at: at, text: text, links: links, files: saved, status: NK_PENDING, comment: "", count: count, reviewedAt: "" } });
  } catch (err) { return createJsonResponse({ status: "error", message: String(err.message || err) }); }
}

function handleNoteReview(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID), id = String(data.noteId || ""), sid = String(data.staffId || "");
    var rec = nkFind(nkRead(ss), id, sid);
    if (!rec) throw new Error("Không tìm thấy kết quả của nhân viên này!");
    var st = data.decision === "APPROVE" ? NK_OK : NK_REDO, comment = String(data.comment || "").substring(0, 500), at = nrNow();
    var sh = ss.getSheetByName(SH_NK);
    sh.getRange(rec.row, 8, 1, 4).setNumberFormat("@");
    sh.getRange(rec.row, 8, 1, 4).setValues([[st, comment, rec.count, at]]);
    rec.status = st; rec.comment = comment; rec.reviewedAt = at;
    return createJsonResponse({ status: "success", message: st === NK_OK ? "Đã duyệt kết quả." : "Đã yêu cầu nhân viên làm lại.", record: nkPub(rec) });
  } catch (err) { return createJsonResponse({ status: "error", message: String(err.message || err) }); }
}

function nkDeleteFor(ss, noteId) {
  var sh = ss.getSheetByName(SH_NK);
  if (!sh) return;
  nkRead(ss).filter(function (r) { return r.noteId === noteId; }).sort(function (a, b) { return b.row - a.row; }).forEach(function (r) { nkTrash(r.files); sh.deleteRow(r.row); });
}

// ---------- cache nhiều mảnh dùng chung (CacheService giới hạn 100KB / khóa) ----------
function cacheBigGet(prefix) {
  var c = CacheService.getScriptCache(), n = Number(c.get(prefix + "meta"));
  if (!n) return null;
  var keys = []; for (var i = 0; i < n; i++) keys.push(prefix + i);
  var got = c.getAll(keys), out = "";
  for (var j = 0; j < n; j++) { var p = got[prefix + j]; if (p === undefined || p === null) return null; out += p; }
  return out;
}
function cacheBigPut(prefix, str, ttl) {
  try {
    var c = CacheService.getScriptCache(), obj = {}, n = 0;
    for (var i = 0; i < str.length; i += CACHE_CHUNK) { obj[prefix + n] = str.substring(i, i + CACHE_CHUNK); n++; }
    obj[prefix + "meta"] = String(n);
    c.putAll(obj, ttl);
  } catch (e) { console.error("cacheBigPut: " + e); }
}
function cacheBigClear(prefix) {
  var c = CacheService.getScriptCache(), meta = Number(c.get(prefix + "meta")) || 0, keys = [prefix + "meta"];
  for (var i = 0; i < Math.max(meta, 30); i++) keys.push(prefix + i);
  c.removeAll(keys);
}

// =====================================================================
// 8. LỊCH BẬN VIỆC / OFF  (hàm tiền tố "lb" để không trùng tên với module AppsScript_LichBan.gs cũ)
//    Sheet Data_LichBan: A Ngày | B Mã NV | C Tên NV | D Loại (BAN/OFF) | E Giờ tạo | F Ca bận (vd "1,3,4")
//    Thứ 2–Thứ 6: tối đa 3 người/ngày, người thứ 4 trả "full" để web báo "đăng ký muộn".
//    Thứ 7, CN: không giới hạn. Luật giới hạn do SERVER quyết định theo ngày (không tin tham số max của máy khách).
// =====================================================================
var SH_LB = "Data_LichBan";
var LB_HEADERS = ["date", "staffId", "staffName", "type", "createdAt", "shifts"];
var LB_MAX_WEEKDAY = 3;

// Chạy 1 đoạn đọc dữ liệu phụ; lỗi thì trả giá trị dự phòng, KHÔNG làm doGet văng lỗi (tránh "Failed to fetch")
function lbSafe(fn, fallback) {
  try { return fn(); } catch (err) { console.error("lbSafe: " + err); return fallback; }
}

function lbIsWeekday(dateStr) {
  var p = String(dateStr).split("-");
  var w = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12).getDay();
  return w >= 1 && w <= 5;
}

function lbSheet(ss) {
  var sh = ss.getSheetByName(SH_LB);
  if (!sh) {
    sh = ss.insertSheet(SH_LB);
    sh.appendRow(LB_HEADERS);
    sh.getRange("A:B").setNumberFormat("@"); // giữ ngày & mã NV dạng text
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < 6) {
    sh.getRange(1, 6).setValue("shifts");    // sheet tạo từ bản cũ chưa có cột Ca
  }
  return sh;
}

// Đọc danh sách đăng ký (không tạo sheet khi chỉ đọc)
function lbRead(ss) {
  var sh = ss.getSheetByName(SH_LB);
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var rows = readRows(sh, 6);
  for (var i = 0; i < rows.length; i++) {
    var d = normDate(rows[i][0]);
    if (!d) continue;
    var isOff = String(rows[i][3]) === "OFF";
    var shifts = isOff ? [] : String(rows[i][5] === null || rows[i][5] === undefined ? "" : rows[i][5])
      .split(",").map(Number).filter(function (n) { return n >= 1 && n <= 6; });
    out.push({ date: d, staffId: String(rows[i][1]), staffName: String(rows[i][2]), type: isOff ? "OFF" : "BAN", shifts: shifts });
  }
  return out;
}

function handleRegisterBusy(data) {
  if (!data.date || !data.staffId) return createJsonResponse({ status: "error", message: "Thiếu ngày hoặc nhân viên" });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var date = normDate(data.date), staffId = String(data.staffId);
  var hidB = nsHiddenMap(ss);
  var day = lbRead(ss).filter(function (r) { return r.date === date && !hidB[r.staffId]; });

  if (day.some(function (r) { return r.staffId === staffId; }))
    return createJsonResponse({ status: "error", message: "Bạn đã đăng ký ngày này rồi!" });

  if (lbIsWeekday(date) && day.length >= LB_MAX_WEEKDAY)
    return createJsonResponse({ status: "full", records: day });

  var type = data.type === "OFF" ? "OFF" : "BAN";
  var shifts = type === "OFF" ? [] : (data.shifts || []).map(Number)
    .filter(function (n) { return n >= 1 && n <= 6; }).sort(function (a, b) { return a - b; });

  var sh = lbSheet(ss);
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, 6).setNumberFormat("@")
    .setValues([[date, staffId, String(data.staffName || ""), type, new Date().toISOString(), shifts.join(",")]]);
  return createJsonResponse({
    status: "success",
    record: { date: date, staffId: staffId, staffName: String(data.staffName || ""), type: type, shifts: shifts }
  });
}

function handleDeleteBusy(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SH_LB);
  var date = normDate(data.date), staffId = String(data.staffId), n = 0;
  if (sh && sh.getLastRow() > 1) {
    var rows = readRows(sh, 2);
    for (var i = rows.length - 1; i >= 0; i--) {
      if (normDate(rows[i][0]) === date && String(rows[i][1]) === staffId) { sh.deleteRow(i + 2); n++; }
    }
  }
  return createJsonResponse({ status: "success", message: n ? "Đã xóa đăng ký" : "Không tìm thấy đăng ký" });
}

// =====================================================================
// 9. KIỂM TRA NHANH TRONG TRÌNH SOẠN THẢO: chọn hàm selfTest -> Run -> xem Execution log
//    Nếu doGet đang lỗi, dòng lỗi sẽ hiện ngay ở đây (không cần Deploy mới để thử).
// =====================================================================
function selfTest() {
  var out = JSON.parse(handleFetchAllData().getContent());
  Logger.log("OK  nhanSu=" + out.nhanSu.length + " thiDua=" + out.thiDua.length + " ketQua=" + out.ketQua.length +
    " tiktok=" + out.tiktok.length + " veSinh=" + out.veSinh.length + " lichBan=" + out.lichBan.length + " roadshow=" + (out.roadshow || []).length +
    " lockedDates=" + out.lockedDates.length);
}

  SERVER_VERSION="2026-11-13 · PRO 20";
  return {
    dispatch(data){return JSON.parse(doPost({postData:{contents:JSON.stringify({...data,mpin:"server-authorized"})}}).getContent());},
    all(){return JSON.parse(handleFetchAllData().getContent());},
    notes(){return JSON.parse(handleFetchNotes().getContent());},
    snapshot, uploads, removed
  };
}
