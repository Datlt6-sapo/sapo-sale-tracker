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
