# Sapo Sale Tracker

Web app nội bộ cho team Sale — chạy trên **Firebase** (Hosting + Firestore + Authentication). Không cần cài đặt gì — mở link là dùng được.

**Link app**: https://sapo-sale-tracker.web.app

> Trước đây chạy trên Google Apps Script, đã chuyển hẳn sang Firebase vì Apps Script triển khai bất tiện (deploy chậm, hay lỗi khó debug). Bản cũ được giữ lại ở `legacy-apps-script/` chỉ để tham khảo, không dùng nữa.

## Tính năng chính

- **Đăng nhập Google** — chỉ chấp nhận tài khoản công ty `@sapo.vn`. Người đăng nhập lần đầu tự động có vai trò **Sale**; muốn lên **Leader** cần một Leader khác (hoặc admin) sửa trực tiếp trong Firestore Console.
- **Nhật ký ngày**: Sale đặt mục tiêu doanh thu, chốt báo cáo cuối ngày.
- **Task Board**: Kanban / danh sách / theo ngày, phân quyền Leader–Sale.
- **Khách hàng**: CRM cơ bản, gắn lịch sử tương tác qua Task.
- **Bản đồ thị trường**: quản lý điểm bán theo khu vực (Đắk Lắk, Gia Lai, Phú Yên, Quy Nhơn), check-in GPS, chụp ảnh tại chỗ (lưu thẳng trong Firestore dưới dạng ảnh nén nhỏ — không dùng Firebase Storage vì dịch vụ đó yêu cầu gói trả phí), theo dõi phần mềm đối thủ đang dùng + thời gian còn lại hợp đồng + cơ hội bán thêm.
  - **Check-in nhanh**: Sale mở app → bấm "⚡ Check-in nhanh" → tự lấy định vị GPS → nhập nhanh Tên cửa hàng / Loại hình / Khu vực / Phần mềm đang dùng / Thời gian còn lại / chụp ảnh ngay trong app (camera trực tiếp, không qua hộp thoại chọn tệp) → xong trong 1 lượt lưu.
- **Dashboard**: Leader theo dõi doanh thu & độ phủ thị trường toàn team.

## Kiến trúc

Không có máy chủ/backend riêng — toàn bộ logic chạy thẳng trên trình duyệt, gọi Firestore trực tiếp. Phân quyền (ai đọc/ghi được gì) được chốt chặn ở **Firestore Security Rules** (`firestore.rules`), không phải ở code JS (code JS chỉ kiểm tra thêm để báo lỗi rõ ràng, không phải lớp bảo mật chính).

| File/Thư mục | Vai trò |
|---|---|
| `public/index.html` | Khung giao diện (CSS, shell, màn hình đăng nhập) |
| `public/firebase-init.js` | Cấu hình kết nối Firebase |
| `public/db.js` | Toàn bộ logic nghiệp vụ (đọc/ghi Firestore) — thay cho các file `.gs` cũ |
| `public/app.js` | Giao diện chính: Nhật ký, Task Board, Khách hàng, Dashboard, Bản đồ thị trường, Thành viên |
| `public/manifest.json` | Web App Manifest — để nhân viên "Thêm vào Màn hình chính" trên điện thoại |
| `firestore.rules` | Luật phân quyền đọc/ghi Firestore (Leader vs Sale) |
| `legacy-apps-script/` | Bản cũ (Google Apps Script) — đã ngừng dùng, giữ để tham khảo |

## Triển khai

Quản lý qua [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
firebase login
firebase deploy --only firestore:rules,hosting --project=sapo-sale-tracker
```

Project Firebase thuộc tài khoản Google cá nhân của người triển khai đầu tiên (không phải tài khoản @sapo.vn, do IT công ty đã khoá quyền tạo project mới cho tài khoản domain) — ứng dụng vẫn chỉ cho phép người dùng cuối đăng nhập bằng email @sapo.vn.
