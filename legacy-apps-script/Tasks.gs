var TASK_STATUSES = ['todo', 'doing', 'review', 'done'];

function decorateTask_(task) {
  var deadline = task.deadline ? toISODate_(new Date(task.deadline)) : '';
  task.deadline = deadline;
  task.isOverdue = !!deadline && deadline < todayISO_() && task.status !== 'done';
  return task;
}

function createTask(payload) {
  var user = requireUser_();
  if (!payload.title) throw new Error('Task cần có tiêu đề.');
  if (!payload.assigneeEmail) throw new Error('Task cần có người phụ trách.');
  var task = {
    id: newId_(),
    title: payload.title,
    assigneeEmail: payload.assigneeEmail,
    customerId: payload.customerId || '',
    deadline: payload.deadline || '',
    status: payload.status || 'todo',
    priority: payload.priority || 'Trung bình',
    description: payload.description || '',
    createdBy: user.email,
    createdAt: new Date()
  };
  return decorateTask_(appendRow_(SHEETS.TASKS, task));
}

function canEditTask_(user, task) {
  return user.role === 'LEADER' || task.assigneeEmail === user.email || task.createdBy === user.email;
}

function updateTask(id, patch) {
  var user = requireUser_();
  var tasks = sheetToObjects_(getSheet_(SHEETS.TASKS));
  var task = tasks.filter(function (t) { return String(t.id) === String(id); })[0];
  if (!task) throw new Error('Không tìm thấy task.');
  if (!canEditTask_(user, task)) throw new Error('Bạn không có quyền sửa task này.');
  var allowed = ['title', 'assigneeEmail', 'customerId', 'deadline', 'status', 'priority', 'description'];
  var safePatch = {};
  allowed.forEach(function (k) { if (patch[k] !== undefined) safePatch[k] = patch[k]; });
  var updated = updateRowById_(SHEETS.TASKS, 'id', id, safePatch);
  return decorateTask_(updated);
}

function listTasks(filter) {
  var user = requireUser_();
  filter = filter || {};
  var tasks = sheetToObjects_(getSheet_(SHEETS.TASKS)).map(decorateTask_);

  if (filter.teamWide) {
    requireLeader_();
  } else {
    tasks = tasks.filter(function (t) { return t.assigneeEmail === user.email; });
  }
  if (filter.assigneeEmail) {
    tasks = tasks.filter(function (t) { return t.assigneeEmail === filter.assigneeEmail; });
  }
  if (filter.deadline) {
    tasks = tasks.filter(function (t) { return t.deadline === filter.deadline; });
  }
  if (filter.customerId) {
    tasks = tasks.filter(function (t) { return String(t.customerId) === String(filter.customerId); });
  }
  return tasks;
}

function listTodayTasks() {
  var user = requireUser_();
  return listTasks({ assigneeEmail: user.email, deadline: todayISO_() });
}
