// Lớp truy cập dữ liệu (thay cho Auth.gs/Db.gs/Tasks.gs/Customers.gs/DailyLogs.gs/
// Dashboard.gs/MarketMap.gs của bản Apps Script cũ). Mọi hàm ở đây gọi thẳng Firestore
// từ trình duyệt — không còn máy chủ trung gian — phân quyền được Firestore Security
// Rules (firestore.rules) chốt chặn ở tầng ghi/đọc, các hàm dưới đây chỉ thêm kiểm tra
// phía client để báo lỗi rõ ràng hơn cho người dùng.

var CURRENT_USER = null;

function emailKey_(email) { return String(email || '').trim().toLowerCase(); }

function todayISO_() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function toMillis_(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime() || 0;
}

// Chuyển Firestore Timestamp -> Date thường để phần UI (vốn chuyển từ bản Apps Script
// sang gần như nguyên vẹn) không phải biết sự khác biệt.
function normalizeDoc_(id, data) {
  var out = Object.assign({ id: id }, data);
  Object.keys(out).forEach(function (k) {
    if (out[k] && typeof out[k].toDate === 'function') out[k] = out[k].toDate();
  });
  return out;
}

function requireLeader_() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'LEADER') {
    throw new Error('Chỉ Leader mới thực hiện được thao tác này.');
  }
}

// ---------- Auth / Users ----------
function bootstrap() {
  var email = emailKey_(auth.currentUser.email);
  return db.collection('users').doc(email).get().then(function (snap) {
    if (snap.exists) {
      CURRENT_USER = normalizeDoc_(email, snap.data());
      CURRENT_USER.email = email;
      return { invited: true, user: CURRENT_USER };
    }
    // Tài khoản @sapo.vn lần đầu đăng nhập: tự tạo hồ sơ với vai trò SALE theo mặc
    // định (rules chỉ cho tự tạo chính mình với vai trò SALE). Muốn lên Leader, một
    // Leader khác cần sửa role trong Firestore Console hoặc màn hình Thành viên.
    var newUser = { name: auth.currentUser.displayName || email.split('@')[0], role: 'SALE', createdAt: new Date() };
    return db.collection('users').doc(email).set(newUser).then(function () {
      CURRENT_USER = Object.assign({ email: email }, newUser);
      return { invited: true, user: CURRENT_USER };
    });
  }).catch(function (e) {
    return { invited: false, error: e.message };
  });
}

function listMembers() {
  requireLeader_();
  return db.collection('users').get().then(function (snap) {
    return snap.docs.map(function (d) { return normalizeDoc_(d.id, d.data()); });
  });
}

function inviteMember(email, name) {
  requireLeader_();
  email = emailKey_(email);
  return db.collection('users').doc(email).get().then(function (snap) {
    if (snap.exists) throw new Error('Email này đã có trong danh sách thành viên.');
    var u = { name: name || email.split('@')[0], role: 'SALE', createdAt: new Date() };
    return db.collection('users').doc(email).set(u).then(function () { return normalizeDoc_(email, u); });
  });
}

function listSaleMembers() {
  requireLeader_();
  return listMembers().then(function (users) { return users.filter(function (u) { return u.role === 'SALE'; }); });
}

// ---------- Khách hàng ----------
var CUSTOMER_STATUSES = ['Mới', 'Đang chăm sóc', 'Đã chốt', 'Không tiềm năng'];

function createCustomer(payload) {
  if (!payload.name) throw new Error('Khách hàng cần có tên.');
  var ref = db.collection('customers').doc();
  var customer = {
    name: payload.name, phone: payload.phone || '', status: payload.status || 'Mới',
    ownerEmail: CURRENT_USER.email, lastContactedAt: '', note: payload.note || '', createdAt: new Date()
  };
  return ref.set(customer).then(function () { return normalizeDoc_(ref.id, customer); });
}

function updateCustomer(id, patch) {
  var allowed = ['name', 'phone', 'status', 'ownerEmail', 'note', 'lastContactedAt'];
  var safePatch = {};
  allowed.forEach(function (k) { if (patch[k] !== undefined) safePatch[k] = patch[k]; });
  return db.collection('customers').doc(id).update(safePatch).then(function () {
    return db.collection('customers').doc(id).get().then(function (s) { return normalizeDoc_(s.id, s.data()); });
  });
}

function listCustomers(filter) {
  filter = filter || {};
  return db.collection('customers').get().then(function (snap) {
    var customers = snap.docs.map(function (d) { return normalizeDoc_(d.id, d.data()); });
    if (filter.status) customers = customers.filter(function (c) { return c.status === filter.status; });
    if (filter.search) {
      var q = String(filter.search).toLowerCase();
      customers = customers.filter(function (c) {
        return (c.name || '').toLowerCase().indexOf(q) !== -1 || (c.phone || '').indexOf(q) !== -1;
      });
    }
    return customers;
  });
}

function getCustomerDetail(id) {
  return db.collection('customers').doc(id).get().then(function (snap) {
    if (!snap.exists) throw new Error('Không tìm thấy khách hàng.');
    var customer = normalizeDoc_(snap.id, snap.data());
    return db.collection('tasks').where('customerId', '==', id).get().then(function (tsnap) {
      var timeline = tsnap.docs.map(function (d) { return decorateTask_(normalizeDoc_(d.id, d.data())); })
        .sort(function (a, b) { return toMillis_(b.createdAt) - toMillis_(a.createdAt); });
      return { customer: customer, timeline: timeline };
    });
  });
}

// ---------- Task ----------
var TASK_STATUSES = ['todo', 'doing', 'review', 'done'];

function decorateTask_(task) {
  var deadline = task.deadline || '';
  task.deadline = deadline;
  task.isOverdue = !!deadline && deadline < todayISO_() && task.status !== 'done';
  return task;
}

function createTask(payload) {
  if (!payload.title) throw new Error('Task cần có tiêu đề.');
  if (!payload.assigneeEmail) throw new Error('Task cần có người phụ trách.');
  var ref = db.collection('tasks').doc();
  var task = {
    title: payload.title, assigneeEmail: payload.assigneeEmail, customerId: payload.customerId || '',
    deadline: payload.deadline || '', status: payload.status || 'todo', priority: payload.priority || 'Trung bình',
    description: payload.description || '', createdBy: CURRENT_USER.email, createdAt: new Date()
  };
  return ref.set(task).then(function () { return decorateTask_(normalizeDoc_(ref.id, task)); });
}

function updateTask(id, patch) {
  var allowed = ['title', 'assigneeEmail', 'customerId', 'deadline', 'status', 'priority', 'description'];
  var safePatch = {};
  allowed.forEach(function (k) { if (patch[k] !== undefined) safePatch[k] = patch[k]; });
  return db.collection('tasks').doc(id).update(safePatch).then(function () {
    return db.collection('tasks').doc(id).get().then(function (s) { return decorateTask_(normalizeDoc_(s.id, s.data())); });
  });
}

function listTasks(filter) {
  filter = filter || {};
  var isLeaderView = filter.teamWide && CURRENT_USER.role === 'LEADER';
  var q = db.collection('tasks');
  var effectiveAssignee = isLeaderView ? filter.assigneeEmail : CURRENT_USER.email;
  if (effectiveAssignee) q = q.where('assigneeEmail', '==', effectiveAssignee);
  return q.get().then(function (snap) {
    var tasks = snap.docs.map(function (d) { return decorateTask_(normalizeDoc_(d.id, d.data())); });
    if (filter.deadline) tasks = tasks.filter(function (t) { return t.deadline === filter.deadline; });
    if (filter.customerId) tasks = tasks.filter(function (t) { return String(t.customerId) === String(filter.customerId); });
    return tasks;
  });
}

function listTodayTasks() {
  return listTasks({ assigneeEmail: CURRENT_USER.email, deadline: todayISO_() });
}

// ---------- Nhật ký ngày ----------
function logId_(email, date) { return email + '|' + date; }

function draftLog_(email, date) {
  return { id: logId_(email, date), userEmail: email, date: date, revenueTarget: '', extraMetrics: '[]', revenueActual: '', note: '', isLocked: false, lockedAt: '' };
}

function findLogById_(id) {
  return db.collection('dailyLogs').doc(id).get().then(function (snap) { return snap.exists ? normalizeDoc_(snap.id, snap.data()) : null; });
}

function getMyLogForDate(dateISO) {
  return findLogById_(logId_(CURRENT_USER.email, dateISO)).then(function (log) { return log || draftLog_(CURRENT_USER.email, dateISO); });
}

function setGoal(dateISO, revenueTarget, extraMetrics) {
  var email = CURRENT_USER.email;
  var id = logId_(email, dateISO);
  return findLogById_(id).then(function (existing) {
    if (existing && existing.isLocked) throw new Error('Nhật ký ngày này đã chốt, không thể sửa mục tiêu.');
    var row = Object.assign(draftLog_(email, dateISO), { revenueTarget: revenueTarget, extraMetrics: JSON.stringify(extraMetrics || []) });
    delete row.id;
    return db.collection('dailyLogs').doc(id).set(row, { merge: true }).then(function () { return normalizeDoc_(id, row); });
  });
}

function lockDailyLog(dateISO, revenueActual, note) {
  var email = CURRENT_USER.email;
  var id = logId_(email, dateISO);
  return findLogById_(id).then(function (existing) {
    if (!existing) throw new Error('Bạn cần đặt mục tiêu trước khi chốt báo cáo.');
    if (existing.isLocked) throw new Error('Nhật ký ngày này đã được chốt trước đó.');
    var patch = { revenueActual: revenueActual, note: note || '', isLocked: true, lockedAt: new Date() };
    return db.collection('dailyLogs').doc(id).update(patch).then(function () { return normalizeDoc_(id, Object.assign({}, existing, patch)); });
  });
}

function unlockDailyLog(userEmail, dateISO) {
  requireLeader_();
  var id = logId_(emailKey_(userEmail), dateISO);
  return db.collection('dailyLogs').doc(id).update({ isLocked: false, lockedAt: '' }).then(function () { return findLogById_(id); });
}

function listMyHistory(fromISO, toISO) {
  return db.collection('dailyLogs').where('userEmail', '==', CURRENT_USER.email).get().then(function (snap) {
    return snap.docs.map(function (d) { return normalizeDoc_(d.id, d.data()); })
      .filter(function (l) { return l.date >= fromISO && l.date <= toISO; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  });
}

function getLogForUserAndDate(userEmail, dateISO) {
  requireLeader_();
  var email = emailKey_(userEmail);
  return findLogById_(logId_(email, dateISO)).then(function (log) { return log || draftLog_(email, dateISO); });
}

// ---------- Dashboard (Leader) ----------
function getTeamOverview(dateISO) {
  requireLeader_();
  return Promise.all([
    listSaleMembers(),
    db.collection('dailyLogs').where('date', '==', dateISO).get(),
    db.collection('tasks').where('deadline', '==', dateISO).get()
  ]).then(function (r) {
    var members = r[0];
    var logs = r[1].docs.map(function (d) { return normalizeDoc_(d.id, d.data()); });
    var tasks = r[2].docs.map(function (d) { return decorateTask_(normalizeDoc_(d.id, d.data())); });

    var rows = members.map(function (m) {
      var log = logs.filter(function (l) { return l.userEmail === m.email; })[0];
      var memberTasks = tasks.filter(function (t) { return t.assigneeEmail === m.email; });
      var done = memberTasks.filter(function (t) { return t.status === 'done'; }).length;
      var target = log ? Number(log.revenueTarget) || 0 : 0;
      var actual = log ? Number(log.revenueActual) || 0 : 0;
      var pct = target > 0 ? Math.round((actual / target) * 100) : null;
      var status = !log ? 'Chưa đặt mục tiêu' : (log.isLocked ? 'Đã chốt' : 'Chưa chốt');
      return { email: m.email, name: m.name, target: target, actual: actual, pct: pct, tasksDone: done, tasksTotal: memberTasks.length, status: status };
    });

    var withGoal = rows.filter(function (row) { return row.status !== 'Chưa đặt mục tiêu'; });
    var totalTarget = withGoal.reduce(function (s, row) { return s + row.target; }, 0);
    var totalActual = withGoal.reduce(function (s, row) { return s + row.actual; }, 0);
    var avgPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null;

    return { date: dateISO, totalTarget: totalTarget, totalActual: totalActual, avgPct: avgPct, rows: rows };
  });
}

function getTeamTaskBoard(assigneeEmail) {
  requireLeader_();
  return listTasks({ teamWide: true, assigneeEmail: assigneeEmail || undefined });
}

// ---------- Bản đồ thị trường ----------
var PROVINCES = ['Đắk Lắk', 'Gia Lai', 'Phú Yên', 'Quy Nhơn'];
var OUTLET_TYPES = ['Đại lý', 'Tạp hóa', 'Siêu thị mini', 'Nhà thuốc', 'Quán ăn/Cà phê (HORECA)', 'Khác'];
var OUTLET_STATUSES = ['Tiềm năng', 'Đang khai thác', 'Đã hợp tác', 'Ngừng hợp tác'];
var CURRENT_SOFTWARE_OPTIONS = ['KiotViet', 'Sapo', 'Haravan', 'POS365', 'Ohana POS', 'Sổ tay/Excel', 'Chưa dùng phần mềm', 'Khác'];
var CONTRACT_ESTIMATE_OPTIONS = ['Dưới 1 tháng', '1-3 tháng', '3-6 tháng', 'Trên 6 tháng', 'Không rõ'];
var UPSELL_ITEMS = ['Module quản lý kho', 'CRM chăm sóc khách hàng', 'App bán hàng đa kênh', 'Website bán hàng', 'Máy POS/máy in hoá đơn', 'Gói kế toán', 'Khác'];
var VISIT_PURPOSES = ['Khảo sát thị trường', 'Chào hàng lần đầu', 'Tư vấn chuyển đổi', 'Chăm sóc định kỳ', 'Ký hợp đồng'];

function getMarketMapConfig() {
  return Promise.resolve({
    provinces: PROVINCES, outletTypes: OUTLET_TYPES, outletStatuses: OUTLET_STATUSES,
    currentSoftwareOptions: CURRENT_SOFTWARE_OPTIONS, contractEstimateOptions: CONTRACT_ESTIMATE_OPTIONS,
    upsellItems: UPSELL_ITEMS, visitPurposes: VISIT_PURPOSES
  });
}

function computeDaysLeft_(expiry) {
  if (!expiry) return null;
  var expiryDate = new Date(expiry);
  if (isNaN(expiryDate.getTime())) return null;
  var today = new Date(todayISO_());
  return Math.round((expiryDate - today) / 86400000);
}

function urgencyFromOutlet_(daysLeft, estimate) {
  if (daysLeft !== null) {
    if (daysLeft <= 30) return 'red';
    if (daysLeft <= 90) return 'amber';
    return 'green';
  }
  if (estimate === 'Dưới 1 tháng') return 'red';
  if (estimate === '1-3 tháng') return 'amber';
  if (estimate === '3-6 tháng' || estimate === 'Trên 6 tháng') return 'green';
  return 'gray';
}

function decorateOutlet_(outlet) {
  var upsellItems = [];
  try {
    upsellItems = outlet.upsellItems
      ? (typeof outlet.upsellItems === 'string' ? JSON.parse(outlet.upsellItems) : outlet.upsellItems)
      : [];
  } catch (e) { upsellItems = []; }
  outlet.upsellItems = upsellItems;
  outlet.daysLeft = computeDaysLeft_(outlet.contractExpiry);
  outlet.urgency = urgencyFromOutlet_(outlet.daysLeft, outlet.contractEstimate);
  return outlet;
}

function canAccessOutlet_(outlet) {
  return CURRENT_USER.role === 'LEADER' || outlet.ownerEmail === CURRENT_USER.email;
}

function createOutlet(payload) {
  if (!payload.name) throw new Error('Điểm bán cần có tên.');
  if (!payload.province) throw new Error('Điểm bán cần chọn khu vực.');
  var ref = db.collection('outlets').doc();
  var outlet = {
    name: payload.name, type: payload.type || 'Khác', province: payload.province,
    district: payload.district || '', address: payload.address || '', lat: payload.lat || '', lng: payload.lng || '',
    phone: payload.phone || '', ownerEmail: payload.ownerEmail || CURRENT_USER.email, status: payload.status || 'Tiềm năng',
    currentSoftware: payload.currentSoftware || '', currentSoftwareOther: payload.currentSoftwareOther || '',
    contractExpiry: payload.contractExpiry || '', contractEstimate: payload.contractEstimate || '',
    upsellItems: JSON.stringify(payload.upsellItems || []), note: payload.note || '', createdAt: new Date()
  };
  return ref.set(outlet).then(function () { return decorateOutlet_(normalizeDoc_(ref.id, outlet)); });
}

function updateOutlet(id, patch) {
  return db.collection('outlets').doc(id).get().then(function (snap) {
    if (!snap.exists) throw new Error('Không tìm thấy điểm bán.');
    var outlet = normalizeDoc_(snap.id, snap.data());
    if (!canAccessOutlet_(outlet)) throw new Error('Bạn không có quyền sửa điểm bán này.');
    var allowed = ['name', 'type', 'province', 'district', 'address', 'lat', 'lng', 'phone', 'ownerEmail', 'status',
      'currentSoftware', 'currentSoftwareOther', 'contractExpiry', 'contractEstimate', 'upsellItems', 'note'];
    var safePatch = {};
    allowed.forEach(function (k) {
      if (patch[k] === undefined) return;
      safePatch[k] = k === 'upsellItems' ? JSON.stringify(patch[k]) : patch[k];
    });
    if (safePatch.ownerEmail !== undefined && CURRENT_USER.role !== 'LEADER') delete safePatch.ownerEmail;
    return db.collection('outlets').doc(id).update(safePatch).then(function () {
      return db.collection('outlets').doc(id).get().then(function (s2) { return decorateOutlet_(normalizeDoc_(s2.id, s2.data())); });
    });
  });
}

function listOutlets(filter) {
  filter = filter || {};
  var isLeader = CURRENT_USER.role === 'LEADER';
  var q = db.collection('outlets');
  if (!isLeader) {
    q = q.where('ownerEmail', '==', CURRENT_USER.email);
  } else if (filter.ownerEmail) {
    q = q.where('ownerEmail', '==', filter.ownerEmail);
  }
  return q.get().then(function (snap) {
    var outlets = snap.docs.map(function (d) { return decorateOutlet_(normalizeDoc_(d.id, d.data())); });
    if (filter.province) outlets = outlets.filter(function (o) { return o.province === filter.province; });
    if (filter.status) outlets = outlets.filter(function (o) { return o.status === filter.status; });
    if (filter.currentSoftware) outlets = outlets.filter(function (o) { return o.currentSoftware === filter.currentSoftware; });
    if (filter.urgency) outlets = outlets.filter(function (o) { return o.urgency === filter.urgency; });
    if (filter.search) {
      var q2 = String(filter.search).toLowerCase();
      outlets = outlets.filter(function (o) {
        return (o.name || '').toLowerCase().indexOf(q2) !== -1 ||
          (o.phone || '').indexOf(q2) !== -1 ||
          (o.address || '').toLowerCase().indexOf(q2) !== -1;
      });
    }
    return outlets;
  });
}

function getOutletDetail(id) {
  return db.collection('outlets').doc(id).get().then(function (snap) {
    if (!snap.exists) throw new Error('Không tìm thấy điểm bán.');
    var outlet = decorateOutlet_(normalizeDoc_(snap.id, snap.data()));
    if (!canAccessOutlet_(outlet)) throw new Error('Bạn không có quyền xem điểm bán này.');
    return db.collection('visits').where('outletId', '==', id).get().then(function (vsnap) {
      var visits = vsnap.docs.map(function (d) { return normalizeDoc_(d.id, d.data()); })
        .sort(function (a, b) { return toMillis_(b.checkinAt) - toMillis_(a.checkinAt); });
      return { outlet: outlet, visits: visits };
    });
  });
}

function distanceMeters_(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  var R = 6371000;
  var toRad = function (d) { return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Firebase Storage yêu cầu gói trả phí (Blaze) nên không dùng ở đây — ảnh đã được
// nén nhỏ (xem capturePhoto_ trong app.js) và lưu thẳng dạng chuỗi base64 ngay trong
// Firestore (giới hạn 1 tài liệu Firestore là 1MB, ảnh nén JPEG ~150-400px còn lại
// luôn nằm trong mức an toàn). Nếu vì lý do gì đó ảnh vẫn quá lớn, bỏ qua không lưu
// thay vì làm hỏng cả lượt check-in.
function uploadCheckinPhoto_(photoDataUrl) {
  if (!photoDataUrl) return Promise.resolve('');
  if (photoDataUrl.length > 700000) return Promise.resolve('');
  return Promise.resolve(photoDataUrl);
}

function checkIn(outletId, lat, lng, purpose, note, photoDataUrl) {
  return db.collection('outlets').doc(outletId).get().then(function (snap) {
    if (!snap.exists) throw new Error('Không tìm thấy điểm bán.');
    var outlet = normalizeDoc_(snap.id, snap.data());
    if (!canAccessOutlet_(outlet)) throw new Error('Bạn không có quyền check-in điểm bán này.');
    return uploadCheckinPhoto_(photoDataUrl, outletId).then(function (photoUrl) {
      var ref = db.collection('visits').doc();
      var visit = {
        outletId: outletId, userEmail: CURRENT_USER.email, checkinAt: new Date(),
        lat: lat || '', lng: lng || '', distanceM: distanceMeters_(Number(outlet.lat), Number(outlet.lng), Number(lat), Number(lng)),
        purpose: purpose || 'Chăm sóc định kỳ', note: note || '', photoUrl: photoUrl, createdAt: new Date()
      };
      return ref.set(visit).then(function () { return normalizeDoc_(ref.id, visit); });
    });
  });
}

function quickCheckin(payload) {
  return createOutlet({
    name: payload.name, type: payload.type, province: payload.province, lat: payload.lat, lng: payload.lng,
    status: 'Tiềm năng', currentSoftware: payload.currentSoftware || '', contractEstimate: payload.contractEstimate || ''
  }).then(function (outlet) {
    return checkIn(outlet.id, payload.lat, payload.lng, payload.purpose, payload.note, payload.photoDataUrl).then(function (visit) {
      return { outlet: outlet, visit: visit };
    });
  });
}

function listVisits(filter) {
  filter = filter || {};
  var q = db.collection('visits');
  if (CURRENT_USER.role !== 'LEADER') q = q.where('userEmail', '==', CURRENT_USER.email);
  return q.get().then(function (snap) {
    var visits = snap.docs.map(function (d) { return normalizeDoc_(d.id, d.data()); });
    if (filter.outletId) visits = visits.filter(function (v) { return String(v.outletId) === String(filter.outletId); });
    return visits;
  });
}

function getCoverageStats(filter) {
  requireLeader_();
  filter = filter || {};
  return Promise.all([
    db.collection('outlets').get(),
    db.collection('visits').get(),
    listSaleMembers()
  ]).then(function (r) {
    var outlets = r[0].docs.map(function (d) { return decorateOutlet_(normalizeDoc_(d.id, d.data())); });
    if (filter.province) outlets = outlets.filter(function (o) { return o.province === filter.province; });
    var visits = r[1].docs.map(function (d) { return normalizeDoc_(d.id, d.data()); });
    var members = r[2];

    var since = new Date();
    since.setDate(since.getDate() - 30);
    var recentVisited = {};
    visits.forEach(function (v) { if (toMillis_(v.checkinAt) >= since.getTime()) recentVisited[v.outletId] = true; });

    var byProvince = {};
    PROVINCES.forEach(function (p) { byProvince[p] = { total: 0, visited30d: 0, urgent: 0 }; });
    outlets.forEach(function (o) {
      if (!byProvince[o.province]) byProvince[o.province] = { total: 0, visited30d: 0, urgent: 0 };
      byProvince[o.province].total++;
      if (recentVisited[o.id]) byProvince[o.province].visited30d++;
      if (o.urgency === 'red') byProvince[o.province].urgent++;
    });

    var byRep = members.map(function (m) {
      var repOutlets = outlets.filter(function (o) { return o.ownerEmail === m.email; });
      var visited = repOutlets.filter(function (o) { return recentVisited[o.id]; }).length;
      return { email: m.email, name: m.name, total: repOutlets.length, visited30d: visited };
    });

    return { byProvince: byProvince, byRep: byRep, totalOutlets: outlets.length };
  });
}
