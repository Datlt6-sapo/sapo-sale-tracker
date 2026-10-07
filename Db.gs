/**
 * Google Sheets is the datastore. One spreadsheet, one sheet/tab per entity.
 * Spreadsheet id lives in Script Properties (never hardcoded) — see getDb_().
 */

var SHEETS = {
  USERS: 'Users',
  TASKS: 'Tasks',
  CUSTOMERS: 'Customers',
  DAILY_LOGS: 'DailyLogs',
  OUTLETS: 'Outlets',
  VISITS: 'Visits'
};

var SHEET_HEADERS = {
  Users: ['email', 'name', 'role', 'createdAt'],
  Tasks: ['id', 'title', 'assigneeEmail', 'customerId', 'deadline', 'status', 'priority', 'description', 'createdBy', 'createdAt'],
  Customers: ['id', 'name', 'phone', 'status', 'ownerEmail', 'lastContactedAt', 'note', 'createdAt'],
  DailyLogs: ['id', 'userEmail', 'date', 'revenueTarget', 'extraMetrics', 'revenueActual', 'note', 'isLocked', 'lockedAt'],
  Outlets: ['id', 'name', 'type', 'province', 'district', 'address', 'lat', 'lng', 'phone', 'ownerEmail', 'status',
    'currentSoftware', 'currentSoftwareOther', 'contractExpiry', 'contractEstimate', 'upsellItems', 'note', 'createdAt'],
  Visits: ['id', 'outletId', 'userEmail', 'checkinAt', 'lat', 'lng', 'distanceM', 'purpose', 'note', 'photoUrl', 'createdAt']
};

// Cache trong phạm vi 1 lần thực thi (1 lệnh gọi từ client): tránh mở lại Spreadsheet
// và kiểm tra đủ sheet nhiều lần khi 1 request cần đọc/ghi nhiều sheet khác nhau
// (VD getTeamOverview đọc Users + DailyLogs + Tasks trong cùng 1 lượt gọi).
var _dbCache_ = null;

function getDb_() {
  if (_dbCache_) return _dbCache_;

  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (e) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Sapo Sale Tracker DB');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  Object.keys(SHEET_HEADERS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(SHEET_HEADERS[name]);
      sheet.setFrozenRows(1);
    }
  });
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  _dbCache_ = ss;
  return ss;
}

function getSheet_(name) {
  return getDb_().getSheetByName(name);
}

// google.script.run không serialize được object Date thô — trả về nguyên vẹn khiến
// toàn bộ response biến thành null phía client (không báo lỗi rõ ràng). Mọi object
// gửi cho client phải đi qua hàm này để chuyển Date -> chuỗi ISO trước.
function serializeForClient_(obj) {
  var out = {};
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    out[k] = (v instanceof Date) ? v.toISOString() : v;
  });
  return out;
}

function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = values.slice(1);
  return rows
    .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return serializeForClient_(obj);
    });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function appendRow_(sheetName, obj) {
  return withLock_(function () {
    var sheet = getSheet_(sheetName);
    var headers = SHEET_HEADERS[sheetName];
    var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
    sheet.appendRow(row);
    return serializeForClient_(obj);
  });
}

function findRowIndexById_(sheet, headers, idKey, id) {
  var values = sheet.getDataRange().getValues();
  var idCol = headers.indexOf(idKey);
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(id)) return r + 1;
  }
  return -1;
}

function updateRowById_(sheetName, idKey, id, patch) {
  return withLock_(function () {
    var sheet = getSheet_(sheetName);
    var headers = SHEET_HEADERS[sheetName];
    var rowNum = findRowIndexById_(sheet, headers, idKey, id);
    if (rowNum === -1) throw new Error('Không tìm thấy dòng có ' + idKey + ' = ' + id);
    var current = {};
    var currentValues = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    headers.forEach(function (h, i) { current[h] = currentValues[i]; });
    var updated = Object.assign({}, current, patch);
    var newRow = headers.map(function (h) { return updated[h] !== undefined ? updated[h] : ''; });
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    return serializeForClient_(updated);
  });
}

function newId_() {
  return Utilities.getUuid();
}

function todayISO_() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}

function toISODate_(date) {
  return Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}
