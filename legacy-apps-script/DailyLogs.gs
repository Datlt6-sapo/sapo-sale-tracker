function logId_(email, date) {
  return email + '|' + date;
}

function findLogById_(id) {
  var logs = sheetToObjects_(getSheet_(SHEETS.DAILY_LOGS));
  return logs.filter(function (l) { return l.id === id; })[0] || null;
}

function draftLog_(email, date) {
  return {
    id: logId_(email, date), userEmail: email, date: date,
    revenueTarget: '', extraMetrics: '[]', revenueActual: '',
    note: '', isLocked: false, lockedAt: ''
  };
}

function getMyLogForDate(dateISO) {
  var user = requireUser_();
  return findLogById_(logId_(user.email, dateISO)) || draftLog_(user.email, dateISO);
}

function setGoal(dateISO, revenueTarget, extraMetrics) {
  var user = requireUser_();
  var id = logId_(user.email, dateISO);
  var existing = findLogById_(id);
  if (existing && existing.isLocked) {
    throw new Error('Nhật ký ngày này đã chốt, không thể sửa mục tiêu.');
  }
  var patch = { revenueTarget: revenueTarget, extraMetrics: JSON.stringify(extraMetrics || []) };
  if (existing) return updateRowById_(SHEETS.DAILY_LOGS, 'id', id, patch);
  var row = Object.assign(draftLog_(user.email, dateISO), patch);
  return appendRow_(SHEETS.DAILY_LOGS, row);
}

function lockDailyLog(dateISO, revenueActual, note) {
  var user = requireUser_();
  var id = logId_(user.email, dateISO);
  var existing = findLogById_(id);
  if (!existing) throw new Error('Bạn cần đặt mục tiêu trước khi chốt báo cáo.');
  if (existing.isLocked) throw new Error('Nhật ký ngày này đã được chốt trước đó.');
  return updateRowById_(SHEETS.DAILY_LOGS, 'id', id, {
    revenueActual: revenueActual,
    note: note || '',
    isLocked: true,
    lockedAt: new Date()
  });
}

function unlockDailyLog(userEmail, dateISO) {
  requireLeader_();
  var id = logId_(userEmail, dateISO);
  var existing = findLogById_(id);
  if (!existing) throw new Error('Không tìm thấy nhật ký để mở khoá.');
  return updateRowById_(SHEETS.DAILY_LOGS, 'id', id, { isLocked: false, lockedAt: '' });
}

function listMyHistory(fromISO, toISO) {
  var user = requireUser_();
  return sheetToObjects_(getSheet_(SHEETS.DAILY_LOGS))
    .filter(function (l) { return l.userEmail === user.email && l.date >= fromISO && l.date <= toISO; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}

function getLogForUserAndDate(userEmail, dateISO) {
  requireLeader_();
  return findLogById_(logId_(userEmail, dateISO)) || draftLog_(userEmail, dateISO);
}
