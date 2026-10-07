function listSaleMembers() {
  requireLeader_();
  return sheetToObjects_(getSheet_(SHEETS.USERS)).filter(function (u) { return u.role === 'SALE'; });
}

function getTeamOverview(dateISO) {
  requireLeader_();
  var members = listSaleMembers();
  var logs = sheetToObjects_(getSheet_(SHEETS.DAILY_LOGS)).filter(function (l) { return l.date === dateISO; });
  var tasks = sheetToObjects_(getSheet_(SHEETS.TASKS)).map(decorateTask_).filter(function (t) { return t.deadline === dateISO; });

  var rows = members.map(function (m) {
    var log = logs.filter(function (l) { return l.userEmail === m.email; })[0];
    var memberTasks = tasks.filter(function (t) { return t.assigneeEmail === m.email; });
    var done = memberTasks.filter(function (t) { return t.status === 'done'; }).length;
    var target = log ? Number(log.revenueTarget) || 0 : 0;
    var actual = log ? Number(log.revenueActual) || 0 : 0;
    var pct = target > 0 ? Math.round((actual / target) * 100) : null;
    var status = !log ? 'Chưa đặt mục tiêu' : (log.isLocked ? 'Đã chốt' : 'Chưa chốt');
    return {
      email: m.email, name: m.name,
      target: target, actual: actual, pct: pct,
      tasksDone: done, tasksTotal: memberTasks.length,
      status: status
    };
  });

  var withGoal = rows.filter(function (r) { return r.status !== 'Chưa đặt mục tiêu'; });
  var totalTarget = withGoal.reduce(function (s, r) { return s + r.target; }, 0);
  var totalActual = withGoal.reduce(function (s, r) { return s + r.actual; }, 0);
  var avgPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null;

  return { date: dateISO, totalTarget: totalTarget, totalActual: totalActual, avgPct: avgPct, rows: rows };
}

function getTeamTaskBoard(assigneeEmail) {
  requireLeader_();
  return listTasks({ teamWide: true, assigneeEmail: assigneeEmail || undefined });
}
