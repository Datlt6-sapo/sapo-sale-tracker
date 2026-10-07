var CUSTOMER_STATUSES = ['Mới', 'Đang chăm sóc', 'Đã chốt', 'Không tiềm năng'];

function createCustomer(payload) {
  var user = requireUser_();
  if (!payload.name) throw new Error('Khách hàng cần có tên.');
  var customer = {
    id: newId_(),
    name: payload.name,
    phone: payload.phone || '',
    status: payload.status || 'Mới',
    ownerEmail: user.email,
    lastContactedAt: '',
    note: payload.note || '',
    createdAt: new Date()
  };
  return appendRow_(SHEETS.CUSTOMERS, customer);
}

function updateCustomer(id, patch) {
  requireUser_();
  var allowed = ['name', 'phone', 'status', 'ownerEmail', 'note', 'lastContactedAt'];
  var safePatch = {};
  allowed.forEach(function (k) { if (patch[k] !== undefined) safePatch[k] = patch[k]; });
  return updateRowById_(SHEETS.CUSTOMERS, 'id', id, safePatch);
}

function listCustomers(filter) {
  requireUser_();
  filter = filter || {};
  var customers = sheetToObjects_(getSheet_(SHEETS.CUSTOMERS));
  if (filter.status) {
    customers = customers.filter(function (c) { return c.status === filter.status; });
  }
  if (filter.search) {
    var q = String(filter.search).toLowerCase();
    customers = customers.filter(function (c) {
      return (c.name || '').toLowerCase().indexOf(q) !== -1 || (c.phone || '').indexOf(q) !== -1;
    });
  }
  return customers;
}

function getCustomerDetail(id) {
  requireUser_();
  var customer = sheetToObjects_(getSheet_(SHEETS.CUSTOMERS)).filter(function (c) {
    return String(c.id) === String(id);
  })[0];
  if (!customer) throw new Error('Không tìm thấy khách hàng.');

  var timeline = sheetToObjects_(getSheet_(SHEETS.TASKS))
    .filter(function (t) { return String(t.customerId) === String(id); })
    .map(decorateTask_)
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

  return { customer: customer, timeline: timeline };
}
