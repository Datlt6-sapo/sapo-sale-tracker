function getCurrentUser() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('Không xác định được tài khoản Google đang đăng nhập.');
  }
  var users = sheetToObjects_(getSheet_(SHEETS.USERS));

  if (users.length === 0) {
    // Bootstrap: người đầu tiên mở app trở thành Leader.
    var leader = { email: email, name: email.split('@')[0], role: 'LEADER', createdAt: new Date() };
    return appendRow_(SHEETS.USERS, leader);
  }

  var found = users.filter(function (u) { return u.email === email; })[0];
  if (!found) {
    return null; // chưa được Leader mời
  }
  return found;
}

function requireUser_() {
  var user = getCurrentUser();
  if (!user) throw new Error('NOT_INVITED');
  return user;
}

function requireLeader_() {
  var user = requireUser_();
  if (user.role !== 'LEADER') throw new Error('FORBIDDEN: chỉ Leader mới thực hiện được thao tác này.');
  return user;
}

function listMembers() {
  requireLeader_();
  return sheetToObjects_(getSheet_(SHEETS.USERS));
}

function inviteMember(email, name) {
  requireLeader_();
  email = String(email).trim().toLowerCase();
  var users = sheetToObjects_(getSheet_(SHEETS.USERS));
  if (users.some(function (u) { return u.email === email; })) {
    throw new Error('Email này đã có trong danh sách thành viên.');
  }
  return appendRow_(SHEETS.USERS, {
    email: email,
    name: name || email.split('@')[0],
    role: 'SALE',
    createdAt: new Date()
  });
}
