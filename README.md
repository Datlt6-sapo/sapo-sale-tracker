# Check-in điểm bán

1 trang web duy nhất (`docs/index.html`) cho nhân viên Sale check-in tại điểm bán. Không backend, không đăng nhập, không phụ thuộc Firebase hay Apps Script — chỉ HTML/CSS/JS thuần, host miễn phí trên GitHub Pages.

**Link dùng**: https://datlt6-sapo.github.io/sapo-sale-tracker/

## Cách hoạt động

1. Mở link → trang tự xin quyền định vị GPS.
2. Nhập: Tên cửa hàng, Ngành nghề, Khu vực (Đắk Lắk/Gia Lai/Phú Yên/Quy Nhơn), Phần mềm đang dùng, Thời gian còn lại, Ghi chú.
3. Bấm "Check-in ngay" → dữ liệu (kèm toạ độ GPS) gửi thẳng tới 1 **Google Form** đã tạo sẵn, Form tự lưu vào **Google Sheet**.

Xem dữ liệu ở đây: https://docs.google.com/spreadsheets/d/1UMXjZZi_cv58wmD9oR5u370fsWH1I743NdfKoOqijm8/edit

## Vì sao làm thế này

Đã thử qua Google Apps Script (deploy phức tạp, load chậm) rồi Firebase (nhiều bước thiết lập, một số dịch vụ bất ngờ yêu cầu gói trả phí, lỗi đăng nhập khó debug). Cả 2 đều bị bỏ. Cách này không có gì để "lỗi" — chỉ là 1 file tĩnh gửi dữ liệu tới Google Form, cơ chế mà Google tự vận hành và luôn ổn định.

## Cấu trúc

| File | Vai trò |
|---|---|
| `docs/index.html` | Toàn bộ trang (HTML/CSS/JS gộp 1 file) |
| `docs/manifest.json` | Để nhân viên "Thêm vào Màn hình chính" trên điện thoại |
| `setup-script/` | Script Apps Script dùng 1 lần để tạo Google Form + Sheet ở trên — không cần đụng tới lại trừ khi muốn tạo bộ form mới |

## Sửa form (thêm/bớt câu hỏi)

1. Mở Form: https://docs.google.com/forms/d/e/1FAIpQLSf46-i-6MdfCnSgltqIKmkPsSpyb6DTjpzBdxuCBSWwdWSlCQ/viewform — sửa trực tiếp trong Google Forms.
2. Nếu đổi tên/thêm câu hỏi, cần lấy `entry.<id>` mới (menu ⋮ trong Form → "Nhận liên kết đã điền sẵn" → điền thử → copy link → đọc các `entry.xxx`) rồi cập nhật object `ENTRY` trong `docs/index.html`.
