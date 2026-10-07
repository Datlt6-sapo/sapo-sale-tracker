/**
 * Vận hành (Tier 2, xem sapo-vibe-coding-standard-non-tech-v1.0.md mục C9-C12):
 * - Log lỗi: appsscript.json bật exceptionLogging=STACKDRIVER — mọi lỗi chưa bắt trong
 *   doGet()/google.script.run đều tự ghi vào Executions/Cloud Logging của project, kèm stack trace.
 * - Rollback: Apps Script tự lưu version theo mỗi lần Deploy > New deployment. Muốn lùi lại bản cũ:
 *   Deploy > Manage deployments > chọn deployment đang chạy > Edit > chọn version cũ hơn > Deploy.
 *   Muốn dừng app ngay: chuyển webapp access trong appsscript.json/Deploy settings về "Chỉ mình tôi"
 *   hoặc Archive deployment.
 */
var APP_ICON_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KPHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIHJ4PSIxMDAiIGZpbGw9IiMwMDdBRkYiLz4KPHRleHQgeD0iMjU2IiB5PSIzMzgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjI4MCIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iI2ZmZmZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UzwvdGV4dD4KPC9zdmc+Cg==';

function doGet(e) {
  // Web App Manifest cho "Thêm vào Màn hình chính" trên Android/Chrome — mở app từ
  // icon riêng, toàn màn hình, không cần mở trình duyệt gõ link mỗi lần.
  if (e && e.parameter && e.parameter.manifest) {
    var manifest = {
      name: 'Sapo Sale Tracker',
      short_name: 'Sale Tracker',
      start_url: ScriptApp.getService().getUrl(),
      display: 'standalone',
      background_color: '#F0F4F9',
      theme_color: '#007AFF',
      icons: [
        { src: APP_ICON_DATA_URI, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    };
    return ContentService.createTextOutput(JSON.stringify(manifest)).setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sapo Sale Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Nhúng nội dung 1 file .html khác vào Index.html qua scriptlet <?!= include('TenFile'); ?>
// Dùng để tách các khối JS lớn (VD: MarketMapView.html) ra file riêng cho dễ bảo trì.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// bootstrap() KHÔNG BAO GIỜ được trả về null/undefined hay để lộ exception ra ngoài —
// mọi lỗi (kể cả lỗi truy cập Spreadsheet) đều phải được bắt và trả về dưới dạng
// { invited: false, error: '...' } để client luôn có dữ liệu hợp lệ để hiển thị,
// tránh tình trạng màn hình trắng không rõ nguyên nhân.
function bootstrap() {
  try {
    var user = getCurrentUser();
    if (!user) return { invited: false };
    return { invited: true, user: user };
  } catch (e) {
    return { invited: false, error: (e && e.message) ? e.message : String(e) };
  }
}
