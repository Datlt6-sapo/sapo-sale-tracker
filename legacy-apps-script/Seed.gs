/**
 * Dữ liệu mẫu để tự test thủ công (không chạy tự động trong web app).
 * Cách dùng: mở project trong Apps Script editor, chọn hàm seedSampleData, bấm Run.
 * Yêu cầu: đã mở web app ít nhất 1 lần bằng tài khoản Leader để bootstrap user đầu tiên
 * (xem getCurrentUser trong Auth.gs), vì seed không tự đặt vai trò Leader.
 */
function seedSampleData() {
  var leader = requireLeader_();

  var sales = [
    { email: 'sale.an@example.com', name: 'Nguyễn Văn An' },
    { email: 'sale.binh@example.com', name: 'Trần Thị Bình' },
    { email: 'sale.cuong@example.com', name: 'Lê Văn Cường' }
  ];
  var existingEmails = sheetToObjects_(getSheet_(SHEETS.USERS)).map(function (u) { return u.email; });
  sales.forEach(function (s) {
    if (existingEmails.indexOf(s.email) === -1) inviteMember(s.email, s.name);
  });

  var customers = [
    { name: 'Công ty TNHH Hoa Mai', phone: '0901111222', status: 'Đang chăm sóc', note: 'Quan tâm gói CRM cơ bản.' },
    { name: 'Cửa hàng Thành Đạt', phone: '0902222333', status: 'Mới', note: '' },
    { name: 'Shop Bảo Ngọc', phone: '0903333444', status: 'Đã chốt', note: 'Đã ký hợp đồng tháng trước.' }
  ];
  var createdCustomers = customers.map(function (c) { return createCustomer(c); });

  var today = todayISO_();
  var yesterday = toISODate_(new Date(Date.now() - 86400000));

  var tasks = [
    { title: 'Gọi lại tư vấn gói dịch vụ', assigneeEmail: sales[0].email, deadline: today, status: 'todo', priority: 'Cao', customerId: createdCustomers[0].id },
    { title: 'Gửi báo giá qua email', assigneeEmail: sales[0].email, deadline: today, status: 'doing', priority: 'Trung bình', customerId: createdCustomers[1].id },
    { title: 'Chuẩn bị hợp đồng', assigneeEmail: sales[1].email, deadline: today, status: 'done', priority: 'Cao', customerId: createdCustomers[2].id },
    { title: 'Follow-up sau demo', assigneeEmail: sales[1].email, deadline: yesterday, status: 'todo', priority: 'Trung bình', customerId: '' },
    { title: 'Khảo sát nhu cầu khách mới', assigneeEmail: sales[2].email, deadline: today, status: 'review', priority: 'Thấp', customerId: '' }
  ];
  tasks.forEach(function (t) { createTask(t); });

  // 3 bộ dữ liệu nhật ký khác nhau, ghi thẳng vào sheet (không qua wrapper session-based vì
  // setGoal/lockDailyLog luôn dùng email của người đang chạy script, không phải email demo):
  //   - Cường: chưa đặt mục tiêu hôm nay (không có DailyLog)
  //   - An: đã chốt báo cáo hôm nay
  //   - Bình: đã từng chốt rồi được Leader mở khoá lại
  if (!findLogById_(logId_(sales[0].email, today))) {
    appendRow_(SHEETS.DAILY_LOGS, Object.assign(draftLog_(sales[0].email, today), {
      revenueTarget: 20000000, revenueActual: 18500000, note: 'Khách Hoa Mai xin dời lịch, bù ngày mai.',
      isLocked: true, lockedAt: new Date()
    }));
  }
  if (!findLogById_(logId_(sales[1].email, today))) {
    appendRow_(SHEETS.DAILY_LOGS, Object.assign(draftLog_(sales[1].email, today), {
      revenueTarget: 15000000, revenueActual: 16000000, note: 'Chốt sớm rồi Leader mở lại để bổ sung đơn phát sinh.',
      isLocked: false, lockedAt: ''
    }));
  }

  Logger.log('Đã seed xong: 3 Sale, 3 khách hàng, 5 task, 3 kiểu nhật ký (chưa đặt mục tiêu / đã chốt / đã mở khoá).');
}
