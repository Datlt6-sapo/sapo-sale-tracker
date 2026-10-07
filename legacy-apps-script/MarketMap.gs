var PROVINCES = ['Đắk Lắk', 'Gia Lai', 'Phú Yên', 'Quy Nhơn'];
var OUTLET_TYPES = ['Đại lý', 'Tạp hóa', 'Siêu thị mini', 'Nhà thuốc', 'Quán ăn/Cà phê (HORECA)', 'Khác'];
var OUTLET_STATUSES = ['Tiềm năng', 'Đang khai thác', 'Đã hợp tác', 'Ngừng hợp tác'];
var CURRENT_SOFTWARE_OPTIONS = ['KiotViet', 'Sapo', 'Haravan', 'POS365', 'Ohana POS', 'Sổ tay/Excel', 'Chưa dùng phần mềm', 'Khác'];
var CONTRACT_ESTIMATE_OPTIONS = ['Dưới 1 tháng', '1-3 tháng', '3-6 tháng', 'Trên 6 tháng', 'Không rõ'];
var UPSELL_ITEMS = ['Module quản lý kho', 'CRM chăm sóc khách hàng', 'App bán hàng đa kênh', 'Website bán hàng', 'Máy POS/máy in hoá đơn', 'Gói kế toán', 'Khác'];
var VISIT_PURPOSES = ['Khảo sát thị trường', 'Chào hàng lần đầu', 'Tư vấn chuyển đổi', 'Chăm sóc định kỳ', 'Ký hợp đồng'];

function getMarketMapConfig() {
  requireUser_();
  return {
    provinces: PROVINCES,
    outletTypes: OUTLET_TYPES,
    outletStatuses: OUTLET_STATUSES,
    currentSoftwareOptions: CURRENT_SOFTWARE_OPTIONS,
    contractEstimateOptions: CONTRACT_ESTIMATE_OPTIONS,
    upsellItems: UPSELL_ITEMS,
    visitPurposes: VISIT_PURPOSES
  };
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
  try { upsellItems = outlet.upsellItems ? JSON.parse(outlet.upsellItems) : []; } catch (e) { upsellItems = []; }
  outlet.upsellItems = upsellItems;
  outlet.daysLeft = computeDaysLeft_(outlet.contractExpiry);
  outlet.urgency = urgencyFromOutlet_(outlet.daysLeft, outlet.contractEstimate);
  return outlet;
}

function canAccessOutlet_(user, outlet) {
  return user.role === 'LEADER' || outlet.ownerEmail === user.email;
}

function createOutlet(payload) {
  var user = requireUser_();
  if (!payload.name) throw new Error('Điểm bán cần có tên.');
  if (!payload.province) throw new Error('Điểm bán cần chọn khu vực.');
  var outlet = {
    id: newId_(),
    name: payload.name,
    type: payload.type || 'Khác',
    province: payload.province,
    district: payload.district || '',
    address: payload.address || '',
    lat: payload.lat || '',
    lng: payload.lng || '',
    phone: payload.phone || '',
    ownerEmail: payload.ownerEmail || user.email,
    status: payload.status || 'Tiềm năng',
    currentSoftware: payload.currentSoftware || '',
    currentSoftwareOther: payload.currentSoftwareOther || '',
    contractExpiry: payload.contractExpiry || '',
    contractEstimate: payload.contractEstimate || '',
    upsellItems: JSON.stringify(payload.upsellItems || []),
    note: payload.note || '',
    createdAt: new Date()
  };
  return decorateOutlet_(appendRow_(SHEETS.OUTLETS, outlet));
}

function updateOutlet(id, patch) {
  var user = requireUser_();
  var outlet = sheetToObjects_(getSheet_(SHEETS.OUTLETS)).filter(function (o) { return String(o.id) === String(id); })[0];
  if (!outlet) throw new Error('Không tìm thấy điểm bán.');
  if (!canAccessOutlet_(user, outlet)) throw new Error('Bạn không có quyền sửa điểm bán này.');

  var allowed = ['name', 'type', 'province', 'district', 'address', 'lat', 'lng', 'phone', 'ownerEmail', 'status',
    'currentSoftware', 'currentSoftwareOther', 'contractExpiry', 'contractEstimate', 'upsellItems', 'note'];
  var safePatch = {};
  allowed.forEach(function (k) {
    if (patch[k] === undefined) return;
    safePatch[k] = k === 'upsellItems' ? JSON.stringify(patch[k]) : patch[k];
  });
  if (safePatch.ownerEmail !== undefined && user.role !== 'LEADER') delete safePatch.ownerEmail;

  var updated = updateRowById_(SHEETS.OUTLETS, 'id', id, safePatch);
  return decorateOutlet_(updated);
}

function listOutlets(filter) {
  var user = requireUser_();
  filter = filter || {};
  var outlets = sheetToObjects_(getSheet_(SHEETS.OUTLETS)).map(decorateOutlet_);

  if (user.role !== 'LEADER') {
    outlets = outlets.filter(function (o) { return o.ownerEmail === user.email; });
  } else if (filter.ownerEmail) {
    outlets = outlets.filter(function (o) { return o.ownerEmail === filter.ownerEmail; });
  }
  if (filter.province) outlets = outlets.filter(function (o) { return o.province === filter.province; });
  if (filter.status) outlets = outlets.filter(function (o) { return o.status === filter.status; });
  if (filter.currentSoftware) outlets = outlets.filter(function (o) { return o.currentSoftware === filter.currentSoftware; });
  if (filter.urgency) outlets = outlets.filter(function (o) { return o.urgency === filter.urgency; });
  if (filter.search) {
    var q = String(filter.search).toLowerCase();
    outlets = outlets.filter(function (o) {
      return (o.name || '').toLowerCase().indexOf(q) !== -1 ||
        (o.phone || '').indexOf(q) !== -1 ||
        (o.address || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  return outlets;
}

function getOutletDetail(id) {
  var user = requireUser_();
  var outlet = sheetToObjects_(getSheet_(SHEETS.OUTLETS)).map(decorateOutlet_).filter(function (o) {
    return String(o.id) === String(id);
  })[0];
  if (!outlet) throw new Error('Không tìm thấy điểm bán.');
  if (!canAccessOutlet_(user, outlet)) throw new Error('Bạn không có quyền xem điểm bán này.');

  var visits = sheetToObjects_(getSheet_(SHEETS.VISITS))
    .filter(function (v) { return String(v.outletId) === String(id); })
    .sort(function (a, b) { return new Date(b.checkinAt) - new Date(a.checkinAt); });

  return { outlet: outlet, visits: visits };
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

function getOrCreateCheckinFolder_() {
  var folderName = 'Sapo Sale Tracker - Ảnh check-in';
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

// photoDataUrl dạng "data:image/jpeg;base64,....". Trả về URL file trên Drive,
// hoặc '' nếu không có ảnh / lỗi lưu ảnh (không chặn việc check-in vì lỗi ảnh).
function saveCheckinPhoto_(photoDataUrl, outletId) {
  if (!photoDataUrl) return '';
  try {
    var match = String(photoDataUrl).match(/^data:(image\/\w+);base64,(.*)$/);
    if (!match) return '';
    var mimeType = match[1];
    var ext = mimeType.split('/')[1] || 'jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(match[2]), mimeType, 'checkin_' + outletId + '_' + Date.now() + '.' + ext);
    var file = getOrCreateCheckinFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return '';
  }
}

function checkIn(outletId, lat, lng, purpose, note, photoDataUrl) {
  var user = requireUser_();
  var outlet = sheetToObjects_(getSheet_(SHEETS.OUTLETS)).filter(function (o) { return String(o.id) === String(outletId); })[0];
  if (!outlet) throw new Error('Không tìm thấy điểm bán.');
  if (!canAccessOutlet_(user, outlet)) throw new Error('Bạn không có quyền check-in điểm bán này.');

  var visit = {
    id: newId_(),
    outletId: outletId,
    userEmail: user.email,
    checkinAt: new Date(),
    lat: lat || '',
    lng: lng || '',
    distanceM: distanceMeters_(Number(outlet.lat), Number(outlet.lng), Number(lat), Number(lng)),
    purpose: purpose || 'Chăm sóc định kỳ',
    note: note || '',
    photoUrl: saveCheckinPhoto_(photoDataUrl, outletId),
    createdAt: new Date()
  };
  return appendRow_(SHEETS.VISITS, visit);
}

// Gộp "tạo điểm bán mới" + "check-in" thành 1 lượt gọi duy nhất — dùng cho luồng
// check-in nhanh khi Sale ghé 1 điểm bán chưa từng có trong hệ thống: chỉ cần tên,
// loại hình, khu vực, ảnh + ghi chú là xong, không phải điền form đầy đủ trước.
function quickCheckin(payload) {
  var outlet = createOutlet({
    name: payload.name,
    type: payload.type,
    province: payload.province,
    lat: payload.lat,
    lng: payload.lng,
    status: 'Tiềm năng',
    currentSoftware: payload.currentSoftware || '',
    contractEstimate: payload.contractEstimate || ''
  });
  var visit = checkIn(outlet.id, payload.lat, payload.lng, payload.purpose, payload.note, payload.photoDataUrl);
  return { outlet: outlet, visit: visit };
}

function listVisits(filter) {
  var user = requireUser_();
  filter = filter || {};
  var visits = sheetToObjects_(getSheet_(SHEETS.VISITS));
  if (user.role !== 'LEADER') visits = visits.filter(function (v) { return v.userEmail === user.email; });
  if (filter.outletId) visits = visits.filter(function (v) { return String(v.outletId) === String(filter.outletId); });
  return visits;
}

function getCoverageStats(filter) {
  requireLeader_();
  filter = filter || {};
  var outlets = sheetToObjects_(getSheet_(SHEETS.OUTLETS)).map(decorateOutlet_);
  if (filter.province) outlets = outlets.filter(function (o) { return o.province === filter.province; });

  var visits = sheetToObjects_(getSheet_(SHEETS.VISITS));
  var since = new Date();
  since.setDate(since.getDate() - 30);
  var recentVisited = {};
  visits.forEach(function (v) {
    if (new Date(v.checkinAt) >= since) recentVisited[v.outletId] = true;
  });

  var byProvince = {};
  PROVINCES.forEach(function (p) { byProvince[p] = { total: 0, visited30d: 0, urgent: 0 }; });
  outlets.forEach(function (o) {
    if (!byProvince[o.province]) byProvince[o.province] = { total: 0, visited30d: 0, urgent: 0 };
    byProvince[o.province].total++;
    if (recentVisited[o.id]) byProvince[o.province].visited30d++;
    if (o.urgency === 'red') byProvince[o.province].urgent++;
  });

  var members = listSaleMembers();
  var byRep = members.map(function (m) {
    var repOutlets = outlets.filter(function (o) { return o.ownerEmail === m.email; });
    var visited = repOutlets.filter(function (o) { return recentVisited[o.id]; }).length;
    return { email: m.email, name: m.name, total: repOutlets.length, visited30d: visited };
  });

  return { byProvince: byProvince, byRep: byRep, totalOutlets: outlets.length };
}
