/**
 * Chạy 1 lần duy nhất (chọn hàm setupCheckinForm, bấm Run) để tạo sẵn:
 * - 1 Google Form "Check-in điểm bán"
 * - 1 Google Sheet lưu kết quả tự động
 * Kết quả (link form, link sheet, mã từng câu hỏi) in ra ở Execution log.
 * Sau khi chạy xong, không cần đụng tới project này nữa.
 */
function setupCheckinForm() {
  var form = FormApp.create('Check-in điểm bán');
  form.setDescription('Nhập thông tin ngay sau khi check-in tại điểm bán.');

  var qShop = form.addTextItem().setTitle('Tên cửa hàng').setRequired(true);
  var qType = form.addTextItem().setTitle('Ngành nghề');
  var qSoftware = form.addTextItem().setTitle('Phần mềm đang dùng');
  var qTimeLeft = form.addTextItem().setTitle('Thời gian còn lại');
  var qArea = form.addTextItem().setTitle('Khu vực');
  var qNote = form.addParagraphTextItem().setTitle('Ghi chú');
  var qLat = form.addTextItem().setTitle('Vĩ độ');
  var qLng = form.addTextItem().setTitle('Kinh độ');

  var sheet = SpreadsheetApp.create('Check-in điểm bán - Dữ liệu');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  var publishedUrl = form.getPublishedUrl();
  var formIdMatch = publishedUrl.match(/\/forms\/d\/e\/([^/]+)\//);
  var publishedFormId = formIdMatch ? formIdMatch[1] : null;

  var result = {
    formUrl: publishedUrl,
    publishedFormId: publishedFormId,
    responseActionUrl: 'https://docs.google.com/forms/d/e/' + publishedFormId + '/formResponse',
    sheetUrl: sheet.getUrl(),
    entryIds: {
      shop: qShop.getId(),
      type: qType.getId(),
      software: qSoftware.getId(),
      timeLeft: qTimeLeft.getId(),
      area: qArea.getId(),
      note: qNote.getId(),
      lat: qLat.getId(),
      lng: qLng.getId()
    }
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

var CHECKIN_SHEET_ID = '1UMXjZZi_cv58wmD9oR5u370fsWH1I743NdfKoOqijm8';
var PROVINCES = ['Đắk Lắk', 'Gia Lai', 'Phú Yên', 'Quy Nhơn'];
var OUTLET_TYPES = ['Đại lý', 'Tạp hóa', 'Siêu thị mini', 'Nhà thuốc', 'Quán ăn/Cà phê (HORECA)', 'Khác'];

/**
 * Chạy 1 lần (chọn hàm buildDashboard, bấm Run) để tạo tab "Dashboard" bằng
 * công thức thuần (QUERY/FILTER) ngay trong Sheet dữ liệu — không script nào
 * chạy ngầm sau đó, không deploy, không đăng nhập riêng. Lọc theo Khu vực,
 * Ngành nghề, khoảng ngày bằng cách đổi giá trị ở các ô lọc trên Dashboard.
 * Chạy lại hàm này bất cứ lúc nào để làm mới lại tab Dashboard (ghi đè).
 */
function buildDashboard() {
  var ss = SpreadsheetApp.openById(CHECKIN_SHEET_ID);

  var old = ss.getSheetByName('Dashboard');
  if (old) ss.deleteSheet(old);

  var respSheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() !== 'Dashboard') { respSheet = sheets[i]; break; }
  }
  if (!respSheet) throw new Error('Không tìm thấy sheet dữ liệu check-in (Form responses).');
  var R = "'" + respSheet.getName() + "'";
  var LAST = 5000; // đủ rộng cho nhiều năm dữ liệu

  var dash = ss.insertSheet('Dashboard', 0);
  dash.setColumnWidths(1, 1, 220);
  dash.setColumnWidths(2, 2, 150);
  dash.setColumnWidths(3, 1, 150);

  dash.getRange('A1').setValue('📊 Dashboard Check-in điểm bán').setFontSize(16).setFontWeight('bold');
  dash.getRange('A2').setValue('Đổi ô vàng bên dưới để lọc — bảng tự cập nhật.').setFontColor('#6B7280');

  dash.getRange('A4').setValue('Bộ lọc').setFontWeight('bold');
  dash.getRange('A5').setValue('Khu vực');
  dash.getRange('A6').setValue('Ngành nghề');
  dash.getRange('A7').setValue('Từ ngày');
  dash.getRange('A8').setValue('Đến ngày');
  dash.getRange('B5').setValue('Tất cả');
  dash.getRange('B6').setValue('Tất cả');
  dash.getRange('B5:B8').setBackground('#FFF9DB');
  dash.getRange('B5').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Tất cả'].concat(PROVINCES), true).build()
  );
  dash.getRange('B6').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Tất cả'].concat(OUTLET_TYPES), true).build()
  );
  dash.getRange('B7:B8').setNumberFormat('yyyy-mm-dd');

  // Điều kiện lọc dùng chung (khớp Khu vực/Ngành nghề/khoảng ngày, bỏ qua nếu để trống/"Tất cả")
  var condArea = "(" + R + "!$F2:$F" + LAST + "=$B$5)+($B$5=\"Tất cả\")>0";
  var condType = "(" + R + "!$C2:$C" + LAST + "=$B$6)+($B$6=\"Tất cả\")>0";
  var condFrom = "(" + R + "!$A2:$A" + LAST + ">=$B$7)+($B$7=\"\")>0";
  var condTo = "(" + R + "!$A2:$A" + LAST + "<=$B$8)+($B$8=\"\")>0";
  var allConds = condArea + "," + condType + "," + condFrom + "," + condTo;

  dash.getRange('A10').setValue('Tổng quan').setFontWeight('bold');
  dash.getRange('A11').setValue('Tổng lượt check-in');
  dash.getRange('A12').setValue('Số cửa hàng riêng biệt (trong phạm vi lọc)');
  dash.getRange('B11').setFormula('=IFERROR(COUNTA(FILTER(' + R + '!$B2:$B' + LAST + ',' + allConds + ')),0)');
  dash.getRange('B12').setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(' + R + '!$B2:$B' + LAST + ',' + allConds + '))),0)');
  dash.getRange('B11:B12').setFontWeight('bold').setFontSize(14);

  // Độ phủ theo khu vực (bỏ qua bộ lọc Khu vực vì chính là trục đang xem)
  dash.getRange('A14').setValue('Độ phủ theo khu vực').setFontWeight('bold');
  dash.getRange('A15:C15').setValues([['Khu vực', 'Lượt check-in', 'Số cửa hàng']]).setFontWeight('bold');
  var condTypeDateOnly = condType + "," + condFrom + "," + condTo;
  for (var p = 0; p < PROVINCES.length; p++) {
    var row = 16 + p;
    dash.getRange('A' + row).setValue(PROVINCES[p]);
    var condThisArea = "(" + R + "!$F2:$F" + LAST + "=$A" + row + ")";
    dash.getRange('B' + row).setFormula('=IFERROR(COUNTA(FILTER(' + R + '!$B2:$B' + LAST + ',' + condThisArea + ',' + condTypeDateOnly + ')),0)');
    dash.getRange('C' + row).setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(' + R + '!$B2:$B' + LAST + ',' + condThisArea + ',' + condTypeDateOnly + '))),0)');
  }

  // Theo ngành nghề (bỏ qua bộ lọc Ngành nghề vì chính là trục đang xem)
  var typeStartRow = 16 + PROVINCES.length + 2;
  dash.getRange('A' + (typeStartRow - 1)).setValue('Theo ngành nghề').setFontWeight('bold');
  dash.getRange('A' + typeStartRow + ':C' + typeStartRow).setValues([['Ngành nghề', 'Lượt check-in', 'Số cửa hàng']]).setFontWeight('bold');
  var condAreaDateOnly = condArea + "," + condFrom + "," + condTo;
  for (var t = 0; t < OUTLET_TYPES.length; t++) {
    var trow = typeStartRow + 1 + t;
    dash.getRange('A' + trow).setValue(OUTLET_TYPES[t]);
    var condThisType = "(" + R + "!$C2:$C" + LAST + "=$A" + trow + ")";
    dash.getRange('B' + trow).setFormula('=IFERROR(COUNTA(FILTER(' + R + '!$B2:$B' + LAST + ',' + condThisType + ',' + condAreaDateOnly + ')),0)');
    dash.getRange('C' + trow).setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(' + R + '!$B2:$B' + LAST + ',' + condThisType + ',' + condAreaDateOnly + '))),0)');
  }

  // Danh sách chi tiết các lượt check-in khớp bộ lọc, mới nhất trước
  var listStartRow = typeStartRow + OUTLET_TYPES.length + 3;
  dash.getRange('A' + (listStartRow - 1)).setValue('Danh sách chi tiết (khớp bộ lọc)').setFontWeight('bold');
  dash.getRange('A' + listStartRow + ':G' + listStartRow)
    .setValues([['Thời gian', 'Tên cửa hàng', 'Ngành nghề', 'Khu vực', 'Phần mềm đang dùng', 'Thời gian còn lại', 'Ghi chú']])
    .setFontWeight('bold');
  dash.getRange('A' + (listStartRow + 1)).setFormula(
    '=IFERROR(SORT(FILTER({' + R + '!$A2:$A' + LAST + ',' + R + '!$B2:$B' + LAST + ',' + R + '!$C2:$C' + LAST + ',' +
    R + '!$F2:$F' + LAST + ',' + R + '!$D2:$D' + LAST + ',' + R + '!$E2:$E' + LAST + ',' + R + '!$G2:$G' + LAST +
    '},' + allConds + '),1,0),"(không có dữ liệu khớp bộ lọc)")'
  );

  SpreadsheetApp.flush();
  Logger.log('Đã tạo xong tab Dashboard: ' + ss.getUrl());
  return ss.getUrl();
}
