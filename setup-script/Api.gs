/**
 * API nhận check-in trực tiếp (thay cho Google Form bị chính sách công ty chặn
 * không cho người ngoài gửi). Trang web POST (dạng form-urlencoded, qua iframe
 * ẩn — giống cách cũ gửi vào Google Form) tới URL web app này; doPost() ghi
 * thẳng 1 dòng vào Sheet dữ liệu. Không có giao diện HTML nào được phục vụ ở
 * đây nên không bị chậm/iframe sandbox như bản app đầy đủ trước kia.
 */
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var sheet = SpreadsheetApp.openById(CHECKIN_SHEET_ID).getSheets()
      .filter(function (s) { return s.getName() !== 'Dashboard'; })[0];
    sheet.appendRow([
      new Date(),
      p.shop || '',
      p.type || '',
      p.software || '',
      p.timeLeft || '',
      p.area || '',
      p.note || '',
      p.lat || '',
      p.lng || '',
      p.route || '',
      p.district || '',
      p.meetResult || '',
      p.interest || '',
      p.contactName || '',
      // Tiền tố "'" ép Sheets lưu dạng chữ (text) chứ không tự suy ra thành
      // số rồi làm mất số 0 ở đầu (vd "0905123456" -> 905123456) — setNumberFormat('@')
      // trên cột không đủ, appendRow() vẫn tự suy kiểu từ chuỗi số thuần.
      p.contactPhone ? "'" + p.contactPhone : '',
      p.staff || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.setup === '1') {
    ensureColumns();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Đã kiểm tra/sửa các cột J-P.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (p.cleanTestRows === '1') {
    var n = cleanTestRows_();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, removed: n }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Check-in API đang hoạt động.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Xoá các dòng test ("Test Curl Shop", "CORS Test") sinh ra lúc kiểm tra API. */
function cleanTestRows_() {
  var sheet = SpreadsheetApp.openById(CHECKIN_SHEET_ID).getSheets()
    .filter(function (s) { return s.getName() !== 'Dashboard'; })[0];
  var values = sheet.getDataRange().getValues();
  var removed = 0;
  for (var r = values.length - 1; r >= 1; r--) {
    var shop = String(values[r][1] || '');
    if (shop.indexOf('Test Curl Shop') === 0 || shop.indexOf('TestCurlShop') === 0 || shop === 'CORS Test') {
      sheet.deleteRow(r + 1);
      removed++;
    }
  }
  return removed;
}

/** Thêm các cột J-P vào sheet dữ liệu nếu chưa có header đúng — chạy 1 lần. */
function ensureColumns() {
  var sheet = SpreadsheetApp.openById(CHECKIN_SHEET_ID).getSheets()
    .filter(function (s) { return s.getName() !== 'Dashboard'; })[0];
  var headers = {
    J: 'Tuyến đường',
    K: 'Quận/Huyện',
    L: 'Kết quả gặp',
    M: 'Mức độ quan tâm',
    N: 'Tên người liên hệ',
    O: 'SĐT liên hệ',
    P: 'Tên nhân viên'
  };
  Object.keys(headers).forEach(function (col) {
    var cell = sheet.getRange(col + '1');
    if (cell.getValue() !== headers[col]) cell.setValue(headers[col]);
  });
  // Cột SĐT (O) phải là Plain Text — mặc định Sheets tự suy ra số từ chuỗi
  // toàn chữ số và làm mất số 0 ở đầu (vd "0905123456" -> 905123456).
  sheet.getRange('O:O').setNumberFormat('@');
  Logger.log('OK: cột J-P đã kiểm tra.');
}
