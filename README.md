# Sapo Sale Tracker

Web app nội bộ cho team Sale (Google Apps Script + Google Sheets làm database). Không cần cài đặt gì — mở link web app là dùng được.

## Tính năng chính

- **Nhật ký ngày**: Sale đặt mục tiêu doanh thu, chốt báo cáo cuối ngày.
- **Task Board**: Kanban / danh sách / theo ngày, phân quyền Leader–Sale.
- **Khách hàng**: CRM cơ bản, gắn lịch sử tương tác qua Task.
- **Bản đồ thị trường**: quản lý điểm bán theo khu vực (Đắk Lắk, Gia Lai, Phú Yên, Quy Nhơn), check-in GPS, chụp ảnh tại chỗ, theo dõi phần mềm đối thủ đang dùng + thời gian còn lại hợp đồng + cơ hội bán thêm.
  - **Check-in nhanh**: Sale mở app → bấm "⚡ Check-in nhanh" → tự lấy định vị GPS → nhập nhanh Tên cửa hàng / Loại hình / Khu vực / Phần mềm đang dùng / Thời gian còn lại / chụp ảnh ngay trong app → xong trong 1 lượt lưu (tự tạo điểm bán + check-in cùng lúc).
- **Dashboard**: Leader theo dõi doanh thu & độ phủ thị trường toàn team.

## Cấu trúc code

| File | Vai trò |
|---|---|
| `Code.gs` | Entry point (`doGet`), web app manifest, hàm `bootstrap()` |
| `Auth.gs` | Đăng nhập theo tài khoản Google, phân quyền Leader/Sale |
| `Db.gs` | Lớp truy cập Google Sheets (đọc/ghi, cache, serialize) |
| `Tasks.gs`, `Customers.gs`, `DailyLogs.gs`, `Dashboard.gs` | Logic nghiệp vụ Task/CRM/Nhật ký/Dashboard |
| `MarketMap.gs` | Logic Bản đồ thị trường + check-in + check-in nhanh |
| `Index.html` | Giao diện chính (shell, nav, các view) |
| `MarketMapView.html` | Giao diện module Bản đồ thị trường (nhúng vào `Index.html` qua `include()`) |
| `Seed.gs` | Dữ liệu mẫu để test thủ công (chạy tay trong trình soạn thảo) |

## Triển khai

Project được quản lý qua [`clasp`](https://github.com/google/clasp) (Google Apps Script CLI):

```bash
clasp login
clasp push          # đẩy code lên Apps Script project
clasp deploy -i <deploymentId> -d "mô tả bản vá"   # cập nhật bản đang chạy (giữ nguyên URL)
```

`.clasp.json` (chứa `scriptId` trỏ tới project thật) không được commit — mỗi người deploy cần tự tạo file này trỏ tới project Apps Script của mình.
