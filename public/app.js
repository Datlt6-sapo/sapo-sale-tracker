
  var STATE = { user: null, tasksCache: [], customersCache: [], view: null };
  var TODAY = new Date().toISOString().slice(0, 10);
  var STATUS_LABELS = { todo: 'Cần làm', doing: 'Đang thực hiện', review: 'Chờ duyệt', done: 'Hoàn thành' };
  var STATUS_ORDER = ['todo', 'doing', 'review', 'done'];

  function fmtMoney(n) {
    n = Number(n) || 0;
    return n.toLocaleString('vi-VN') + 'đ';
  }

  function pctBadge(pct) {
    if (pct === null || pct === undefined) return '<span class="badge gray">—</span>';
    var cls = pct >= 100 ? 'green' : (pct >= 50 ? 'amber' : 'red');
    return '<span class="badge ' + cls + '">' + pct + '%</span>';
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function showModal(innerHtml) {
    var root = document.getElementById('modalRoot');
    root.innerHTML = '';
    var backdrop = el('<div class="modal-backdrop"><div class="modal">' + innerHtml + '</div></div>');
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
    root.appendChild(backdrop);
    // Bản đồ Leaflet vẽ tile bằng CSS transform nên có thể tạo lớp render riêng,
    // hiện xuyên qua modal bất kể z-index. Ẩn hẳn nội dung phía sau khi có modal mở.
    document.getElementById('mainContent').style.visibility = 'hidden';
  }
  function closeModal() {
    document.getElementById('modalRoot').innerHTML = '';
    document.getElementById('mainContent').style.visibility = 'visible';
  }

  // ---------- Bootstrap ----------
  function doSignIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'sapo.vn' });
    document.getElementById('signInError').textContent = '';
    // Dùng redirect thay vì popup: popup hay bị trình duyệt điện thoại (đặc biệt
    // Safari iOS) chặn hoặc không hiện ra được.
    auth.signInWithRedirect(provider).catch(function (err) {
      document.getElementById('signInError').textContent = 'Đăng nhập lỗi: ' + err.message;
    });
  }

  function showAppFor_(res) {
    STATE.user = res.user;
    document.getElementById('appRoot').classList.remove('hidden');
    document.getElementById('userName').textContent = res.user.name || res.user.email;
    document.getElementById('roleBadge').textContent = res.user.role === 'LEADER' ? 'Leader' : 'Sale';
    if (res.user.role === 'LEADER') {
      document.getElementById('sidebar').classList.remove('hidden');
      renderNav();
      showView('dashboard');
    } else {
      // Sale trên điện thoại: không sidebar, không tab khác — mở link là vào thẳng
      // màn hình check-in, đơn giản tối đa.
      document.getElementById('sidebar').classList.add('hidden');
      renderSaleHome();
    }
  }

  // ---------- Màn hình check-in cho Sale (không qua sidebar/tab) ----------
  function renderSaleHome() {
    var main = document.getElementById('mainContent');
    main.innerHTML = '<p class="muted">Đang lấy vị trí…</p>';
    if (!navigator.geolocation) {
      main.innerHTML = '<div class="card"><p class="muted">Trình duyệt không hỗ trợ định vị.</p></div>';
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      paintSaleCheckinForm(pos.coords.latitude, pos.coords.longitude);
    }, function (err) {
      main.innerHTML = '<div class="card"><p class="muted">Không lấy được vị trí: ' + err.message + '</p>' +
        '<button class="btn primary" id="retryGps" style="margin-top:8px">Thử lại</button></div>';
      document.getElementById('retryGps').addEventListener('click', renderSaleHome);
    }, { enableHighAccuracy: true });
  }

  function paintSaleCheckinForm(lat, lng) {
    var main = document.getElementById('mainContent');
    ensureMmConfig().then(function (cfg) {
      var html = '<div class="card">';
      html += '<h2 style="margin-top:0">📍 Check-in điểm bán</h2>';
      html += '<p class="muted">Vị trí hiện tại: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</p>';
      html += '<div class="field"><label>Tên điểm bán</label><input id="qName" placeholder="VD: Tạp hoá Cô Lan" autofocus></div>';
      html += '<div class="field"><label>Loại hình</label><select id="qType">' +
        cfg.outletTypes.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>';
      html += '<div class="field"><label>Khu vực</label><select id="qProvince">' +
        cfg.provinces.map(function (p) { return '<option>' + p + '</option>'; }).join('') + '</select></div>';
      html += '<div class="field"><label>Phần mềm đang dùng</label><select id="qSoftware">' +
        cfg.currentSoftwareOptions.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>';
      html += '<div class="field"><label>Thời gian còn lại</label><select id="qEstimate"><option value="">— Không rõ —</option>' +
        cfg.contractEstimateOptions.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>';
      html += '<div class="field"><label>Ảnh chụp (tuỳ chọn)</label>' +
        '<button type="button" class="btn ghost" id="qPhotoBtn">📷 Chụp ảnh</button>' +
        '<div id="qPhotoPreview" style="margin-top:8px"></div></div>';
      html += '<div class="field"><label>Ghi chú</label><textarea id="qNote" rows="2" placeholder="Tình hình tại điểm bán..."></textarea></div>';
      html += '<button class="btn success" id="qSubmit" style="width:100%">✓ Check-in ngay</button>';
      html += '</div>';
      main.innerHTML = html;

      var getPhoto = wirePhotoCapture_('qPhotoBtn', 'qPhotoPreview');
      document.getElementById('qSubmit').addEventListener('click', function () {
        var name = document.getElementById('qName').value;
        if (!name) return alert('Nhập tên điểm bán.');
        var btn = document.getElementById('qSubmit');
        btn.disabled = true;
        btn.textContent = 'Đang lưu…';
        quickCheckin({
          name: name,
          type: document.getElementById('qType').value,
          province: document.getElementById('qProvince').value,
          currentSoftware: document.getElementById('qSoftware').value,
          contractEstimate: document.getElementById('qEstimate').value,
          lat: lat, lng: lng,
          purpose: 'Khảo sát thị trường',
          note: document.getElementById('qNote').value,
          photoDataUrl: getPhoto()
        }).then(function () {
          paintSaleCheckinSuccess();
        }).catch(function (err) {
          alert(err.message || err);
          btn.disabled = false;
          btn.textContent = '✓ Check-in ngay';
        });
      });
    });
  }

  function paintSaleCheckinSuccess() {
    var main = document.getElementById('mainContent');
    main.innerHTML = '<div class="card" style="text-align:center">' +
      '<div style="font-size:40px">✅</div>' +
      '<h2>Đã check-in thành công!</h2>' +
      '<button class="btn primary" id="btnAgain">+ Check-in điểm khác</button>' +
      '</div>';
    document.getElementById('btnAgain').addEventListener('click', renderSaleHome);
  }

  function init() {
    auth.getRedirectResult().catch(function (err) {
      document.getElementById('signIn').classList.remove('hidden');
      document.getElementById('signInError').textContent = 'Đăng nhập lỗi: ' + err.message;
    });
    auth.onAuthStateChanged(function (fbUser) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('appRoot').classList.add('hidden');
      document.getElementById('notInvited').classList.add('hidden');
      document.getElementById('signIn').classList.add('hidden');

      if (!fbUser) {
        document.getElementById('signIn').classList.remove('hidden');
        return;
      }
      if (!fbUser.email || fbUser.email.split('@')[1] !== 'sapo.vn') {
        auth.signOut();
        document.getElementById('notInvited').classList.remove('hidden');
        document.getElementById('notInvitedTitle').textContent = 'Sai tài khoản';
        document.getElementById('notInvitedMsg').textContent = 'Vui lòng đăng nhập bằng email công ty @sapo.vn.';
        return;
      }
      bootstrap().then(function (res) {
        if (!res || !res.invited) {
          document.getElementById('notInvited').classList.remove('hidden');
          if (res && res.error) {
            document.getElementById('notInvitedTitle').textContent = 'Lỗi tải dữ liệu';
            document.getElementById('notInvitedMsg').textContent = 'Chi tiết lỗi: ' + res.error;
          }
          return;
        }
        showAppFor_(res);
      }).catch(function (err) {
        document.getElementById('notInvited').classList.remove('hidden');
        document.getElementById('notInvitedTitle').textContent = 'Lỗi tải dữ liệu';
        document.getElementById('notInvitedMsg').textContent = 'Chi tiết lỗi: ' + (err && err.message ? err.message : err);
      });
    });
  }

  function doSignOut() { auth.signOut(); }

  function renderNav() {
    var isLeader = STATE.user.role === 'LEADER';
    var tabs = isLeader
      ? [['dashboard', 'Dashboard'], ['tasks', 'Task Board'], ['customers', 'Khách hàng'], ['marketmap', 'Bản đồ thị trường'], ['members', 'Thành viên']]
      : [['journal', 'Nhật ký ngày'], ['tasks', 'Task Board'], ['customers', 'Khách hàng'], ['marketmap', 'Bản đồ thị trường']];
    var nav = document.getElementById('mainNav');
    nav.innerHTML = '';
    tabs.forEach(function (t) {
      var btn = el('<button data-view="' + t[0] + '">' + t[1] + '</button>');
      btn.addEventListener('click', function () { showView(t[0]); });
      nav.appendChild(btn);
    });
  }

  function showView(view) {
    STATE.view = view;
    Array.prototype.forEach.call(document.querySelectorAll('#mainNav button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    var main = document.getElementById('mainContent');
    main.innerHTML = '<p class="muted">Đang tải…</p>';
    var renderers = {
      journal: renderJournalView,
      tasks: renderTasksView,
      customers: renderCustomersView,
      dashboard: renderDashboardView,
      members: renderMembersView,
      marketmap: renderMarketMapView
    };
    renderers[view]();
  }

  // ---------- Nhật ký ngày ----------
  var journalMode = 'today';

  function renderJournalView() {
    journalMode = 'today';
    loadJournalToday();
  }

  function loadJournalToday() {
    Promise.all([getMyLogForDate(TODAY), listTodayTasks()])
      .then(function (r) { paintJournal(r[0], r[1]); });
  }

  function paintJournal(log, tasks) {
    var main = document.getElementById('mainContent');
    var locked = !!log.isLocked;
    var doneCount = tasks.filter(function (t) { return t.status === 'done'; }).length;

    var html = '<div class="toolbar">' +
      '<h2 style="margin:0">Nhật ký ngày · ' + TODAY + '</h2>' +
      '<button class="btn ghost" id="btnHistory" style="margin-left:auto">Lịch sử nhật ký →</button>' +
      '</div>';

    html += '<div class="card">' +
      '<div class="field"><label>Mục tiêu doanh thu hôm nay</label>' +
      '<input id="goalTarget" type="number" placeholder="VD: 20000000" value="' + (log.revenueTarget || '') + '" ' + (locked ? 'disabled' : '') + '></div>' +
      (locked ? '' : '<button class="btn primary" id="btnSaveGoal">Lưu mục tiêu</button>') +
      (log.revenueTarget ? '<p class="muted" style="margin-top:8px">Mục tiêu: ' + fmtMoney(log.revenueTarget) + '</p>' : '') +
      '</div>';

    html += '<div class="card"><h3 style="margin-top:0">Đầu việc cần làm hôm nay · ' + doneCount + '/' + tasks.length + ' đã hoàn thành</h3>' +
      '<div id="checklist"></div>' +
      (locked ? '' : '<button class="btn ghost" id="btnAddTask" style="margin-top:10px">+ Thêm việc</button>') +
      '</div>';

    if (!locked) {
      html += '<div class="card">' +
        '<h3 style="margin-top:0">Chốt báo cáo cuối ngày</h3>' +
        '<div class="field"><label>Doanh thu thực tế</label><input id="goalActual" type="number" placeholder="Số tiền thực nhận"></div>' +
        '<div class="field"><label>Ghi chú</label><textarea id="goalNote" rows="2" placeholder="Hôm nay gặp khó khăn gì? Kế hoạch bù ngày mai?"></textarea></div>' +
        '<button class="btn success" id="btnLock">Chốt & Gửi báo cáo ngày</button>' +
        '</div>';
    } else {
      var pct = log.revenueTarget > 0 ? Math.round((Number(log.revenueActual) || 0) / Number(log.revenueTarget) * 100) : null;
      html += '<div class="card">' +
        '<h3 style="margin-top:0">Đã chốt ' + pctBadge(pct) + '</h3>' +
        '<p>Doanh thu thực tế: <b>' + fmtMoney(log.revenueActual) + '</b></p>' +
        (log.note ? '<p class="muted">Ghi chú: ' + log.note + '</p>' : '') +
        '</div>';
    }

    main.innerHTML = html;

    var checklist = document.getElementById('checklist');
    if (tasks.length === 0) checklist.innerHTML = '<p class="muted">Chưa có đầu việc nào cho hôm nay.</p>';
    tasks.forEach(function (t) {
      var item = el('<div class="checklist-item ' + (t.status === 'done' ? 'done' : '') + '">' +
        '<input type="checkbox" ' + (t.status === 'done' ? 'checked' : '') + ' ' + (locked ? 'disabled' : '') + '>' +
        '<span class="title">' + t.title + (t.isOverdue ? ' <span class="badge red">Quá hạn</span>' : '') + '</span>' +
        '<span class="meta">' + (t.priority || '') + '</span>' +
        '</div>');
      item.querySelector('input').addEventListener('change', function (e) {
        updateTask(t.id, { status: e.target.checked ? 'done' : 'todo' }).then(loadJournalToday);
      });
      checklist.appendChild(item);
    });

    document.getElementById('btnHistory').addEventListener('click', renderHistoryView);
    if (!locked) {
      document.getElementById('btnSaveGoal').addEventListener('click', function () {
        var v = document.getElementById('goalTarget').value;
        if (!v) return alert('Nhập mục tiêu doanh thu trước đã.');
        setGoal(TODAY, Number(v), []).then(loadJournalToday);
      });
      document.getElementById('btnAddTask').addEventListener('click', function () { openTaskForm({ deadline: TODAY, assigneeEmail: STATE.user.email }, loadJournalToday); });
      document.getElementById('btnLock').addEventListener('click', function () {
        var actual = document.getElementById('goalActual').value;
        if (!actual) return alert('Nhập doanh thu thực tế trước khi chốt.');
        if (!confirm('Chốt báo cáo ngày hôm nay? Sau khi chốt sẽ không sửa được nữa.')) return;
        var note = document.getElementById('goalNote').value;
        lockDailyLog(TODAY, Number(actual), note).then(loadJournalToday);
      });
    }
  }

  var historyMode = 'calendar';
  var historyMonthCursor = TODAY.slice(0, 7); // 'yyyy-MM'

  function renderHistoryView() {
    historyMode = 'calendar';
    historyMonthCursor = TODAY.slice(0, 7);
    loadHistory();
  }

  function monthBounds_(yyyyMm) {
    var parts = yyyyMm.split('-').map(Number);
    var first = new Date(parts[0], parts[1] - 1, 1);
    var last = new Date(parts[0], parts[1], 0);
    return { from: toISODate_(first), to: toISODate_(last) };
  }
  function toISODate_(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addMonths_(yyyyMm, delta) {
    var parts = yyyyMm.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function loadHistory() {
    var bounds = monthBounds_(historyMonthCursor);
    listMyHistory(bounds.from, bounds.to).then(paintHistory);
  }

  function pctForLog_(l) {
    return l.revenueTarget > 0 ? Math.round((Number(l.revenueActual) || 0) / Number(l.revenueTarget) * 100) : null;
  }

  function paintHistory(logs) {
    var main = document.getElementById('mainContent');
    var logsByDate = {};
    logs.forEach(function (l) { logsByDate[l.date] = l; });

    var monthLabel = historyMonthCursor.split('-')[1] + '/' + historyMonthCursor.split('-')[0];
    var html = '<div class="toolbar"><h2 style="margin:0">Lịch sử nhật ký</h2>' +
      '<button class="btn ' + (historyMode === 'calendar' ? 'primary' : 'ghost') + '" data-hmode="calendar">Lịch tháng</button>' +
      '<button class="btn ' + (historyMode === 'list' ? 'primary' : 'ghost') + '" data-hmode="list">Danh sách</button>' +
      '<button class="btn ghost" id="btnBackToday" style="margin-left:auto">← Về hôm nay</button></div>';

    if (historyMode === 'calendar') {
      html += '<div class="card"><div class="toolbar" style="margin-bottom:10px">' +
        '<button class="btn ghost" id="prevMonth">‹</button><b>' + monthLabel + '</b><button class="btn ghost" id="nextMonth">›</button>' +
        '</div><div id="calGrid"></div>' +
        '<div class="cal-legend">' +
        '<span><i style="background:var(--green)"></i> Đạt ≥100%</span>' +
        '<span><i style="background:var(--amber)"></i> 50–99%</span>' +
        '<span><i style="background:var(--red)"></i> Dưới 50%</span>' +
        '<span><i style="background:#C7CDD6"></i> Chưa chốt</span>' +
        '</div></div>';
    } else {
      html += '<div class="card"><table><thead><tr><th>Ngày</th><th>Mục tiêu</th><th>Thực tế</th><th>% đạt</th><th>Trạng thái</th></tr></thead><tbody>';
      var sorted = logs.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (sorted.length === 0) html += '<tr><td colspan="5" class="muted">Chưa có nhật ký nào trong tháng này.</td></tr>';
      sorted.forEach(function (l) {
        var pct = pctForLog_(l);
        html += '<tr class="' + (l.isLocked ? 'clickable' : '') + '" data-date="' + l.date + '"><td>' + l.date + '</td><td>' + fmtMoney(l.revenueTarget) + '</td><td>' + (l.isLocked ? fmtMoney(l.revenueActual) : '—') + '</td>' +
          '<td>' + (l.isLocked ? pctBadge(pct) : '—') + '</td><td>' + (l.isLocked ? '<span class="badge green">Đã chốt</span>' : '<span class="badge amber">Chưa chốt</span>') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    main.innerHTML = html;

    document.getElementById('btnBackToday').addEventListener('click', renderJournalView);
    Array.prototype.forEach.call(document.querySelectorAll('[data-hmode]'), function (b) {
      b.addEventListener('click', function () { historyMode = b.getAttribute('data-hmode'); loadHistory(); });
    });

    if (historyMode === 'calendar') {
      document.getElementById('prevMonth').addEventListener('click', function () { historyMonthCursor = addMonths_(historyMonthCursor, -1); loadHistory(); });
      document.getElementById('nextMonth').addEventListener('click', function () { historyMonthCursor = addMonths_(historyMonthCursor, 1); loadHistory(); });
      document.getElementById('calGrid').appendChild(el(renderCalendarGrid(logsByDate)));
      Array.prototype.forEach.call(document.querySelectorAll('.cal-cell.clickable'), function (cell) {
        cell.addEventListener('click', function () { openHistoryDayDetail(cell.getAttribute('data-date'), logsByDate[cell.getAttribute('data-date')]); });
      });
    } else {
      Array.prototype.forEach.call(document.querySelectorAll('tr.clickable[data-date]'), function (tr) {
        tr.addEventListener('click', function () { openHistoryDayDetail(tr.getAttribute('data-date'), logsByDate[tr.getAttribute('data-date')]); });
      });
    }
  }

  function renderCalendarGrid(logsByDate) {
    var parts = historyMonthCursor.split('-').map(Number);
    var firstOfMonth = new Date(parts[0], parts[1] - 1, 1);
    var startOffset = (firstOfMonth.getDay() + 6) % 7; // Thứ 2 = cột đầu tiên
    var daysInMonth = new Date(parts[0], parts[1], 0).getDate();

    var html = '<div class="cal-grid">';
    ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].forEach(function (d) { html += '<div class="cal-head">' + d + '</div>'; });
    for (var i = 0; i < startOffset; i++) html += '<div class="cal-cell other-month"></div>';
    for (var day = 1; day <= daysInMonth; day++) {
      var dateISO = historyMonthCursor + '-' + String(day).padStart(2, '0');
      var log = logsByDate[dateISO];
      var isToday = dateISO === TODAY;
      var dot = '';
      var clickable = false;
      if (log && log.isLocked) {
        var pct = pctForLog_(log);
        var cls = pct >= 100 ? 'green' : (pct >= 50 ? 'amber' : 'red');
        dot = '<span class="cal-dot ' + cls + '"></span>';
        clickable = true;
      } else if (log && log.revenueTarget) {
        dot = '<span class="cal-dot gray"></span>';
      }
      html += '<div class="cal-cell ' + (isToday ? 'today' : '') + ' ' + (clickable ? 'clickable' : '') + '" data-date="' + dateISO + '">' + day + dot + '</div>';
    }
    html += '</div>';
    return html;
  }

  function openHistoryDayDetail(dateISO, log) {
    if (!log || !log.isLocked) return;
    listTasks({ deadline: dateISO }).then(function (tasks) {
      var pct = pctForLog_(log);
      var html = '<h3>Nhật ký ngày · ' + dateISO + ' <span class="muted" style="font-size:12px;font-weight:400">(chỉ xem)</span></h3>';
      html += '<p>Mục tiêu doanh thu: <b>' + fmtMoney(log.revenueTarget) + '</b></p>';
      html += '<p>Doanh thu thực tế: <b>' + fmtMoney(log.revenueActual) + '</b> ' + pctBadge(pct) + '</p>';
      if (log.note) html += '<p class="muted">Ghi chú: ' + log.note + '</p>';
      html += '<h4>Đầu việc hôm đó</h4>';
      if (tasks.length === 0) html += '<p class="muted">Không có đầu việc nào cho ngày này.</p>';
      tasks.forEach(function (t) {
        html += '<div class="checklist-item ' + (t.status === 'done' ? 'done' : '') + '">' +
          '<input type="checkbox" disabled ' + (t.status === 'done' ? 'checked' : '') + '>' +
          '<span class="title">' + t.title + '</span><span class="meta">' + (t.priority || '') + '</span></div>';
      });
      html += '<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="hClose">Đóng</button></div>';
      showModal(html);
      document.getElementById('hClose').addEventListener('click', closeModal);
    });
  }

  // ---------- Task Board ----------
  var taskBoardMode = 'kanban';
  var taskAssigneeFilter = '';

  function renderTasksView() {
    taskBoardMode = 'kanban';
    loadTasks();
  }

  function loadTasks() {
    var isLeader = STATE.user.role === 'LEADER';
    var call = isLeader ? getTeamTaskBoard(taskAssigneeFilter) : listTasks({});
    Promise.all([call, isLeader ? listSaleMembers() : Promise.resolve([])]).then(function (r) {
      STATE.tasksCache = r[0];
      paintTasks(r[1]);
    });
  }

  function paintTasks(members) {
    var main = document.getElementById('mainContent');
    var isLeader = STATE.user.role === 'LEADER';
    var html = '<div class="toolbar"><h2 style="margin:0">Task Board</h2>';
    ['kanban', 'list', 'bydate'].forEach(function (m) {
      var label = m === 'kanban' ? 'Kanban' : (m === 'list' ? 'Danh sách' : 'Theo hạn chót');
      html += '<button class="btn ' + (taskBoardMode === m ? 'primary' : 'ghost') + '" data-mode="' + m + '">' + label + '</button>';
    });
    if (isLeader) {
      html += '<select id="assigneeFilter" style="margin-left:8px"><option value="">Tất cả thành viên</option>' +
        members.map(function (m) { return '<option value="' + m.email + '" ' + (taskAssigneeFilter === m.email ? 'selected' : '') + '>' + (m.name || m.email) + '</option>'; }).join('') +
        '</select>';
    }
    html += '<button class="btn primary" id="btnNewTask" style="margin-left:auto">+ Tạo Task</button></div>';
    html += '<div id="taskBoardBody"></div>';
    main.innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () { taskBoardMode = b.getAttribute('data-mode'); paintTasks(members); });
    });
    if (isLeader) {
      document.getElementById('assigneeFilter').addEventListener('change', function (e) {
        taskAssigneeFilter = e.target.value; loadTasks();
      });
    }
    document.getElementById('btnNewTask').addEventListener('click', function () {
      openTaskForm({ assigneeEmail: isLeader ? '' : STATE.user.email }, loadTasks, members);
    });

    var body = document.getElementById('taskBoardBody');
    if (taskBoardMode === 'kanban') body.appendChild(el(renderKanban()));
    else if (taskBoardMode === 'list') body.appendChild(el(renderTaskList()));
    else body.appendChild(el(renderTaskByDate()));

    if (taskBoardMode === 'kanban') wireKanbanDrag();
  }

  function taskCardHtml(t) {
    return '<div class="task-card ' + (t.isOverdue ? 'overdue' : '') + '" draggable="true" data-id="' + t.id + '">' +
      '<div class="t-title">' + t.title + '</div>' +
      '<div class="t-meta"><span>' + (t.assigneeEmail || '') + '</span><span>' + (t.deadline || '') + '</span></div>' +
      '</div>';
  }

  function renderKanban() {
    var html = '<div class="kanban">';
    STATUS_ORDER.forEach(function (s) {
      var items = STATE.tasksCache.filter(function (t) { return t.status === s; });
      html += '<div class="kanban-col" data-status="' + s + '"><h4>' + STATUS_LABELS[s] + ' · ' + items.length + '</h4>' +
        items.map(taskCardHtml).join('') + '</div>';
    });
    html += '</div>';
    return html;
  }

  function wireKanbanDrag() {
    Array.prototype.forEach.call(document.querySelectorAll('.task-card'), function (card) {
      card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', card.getAttribute('data-id')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.kanban-col'), function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); });
      col.addEventListener('drop', function (e) {
        e.preventDefault();
        var id = e.dataTransfer.getData('text/plain');
        var status = col.getAttribute('data-status');
        updateTask(id, { status: status }).then(loadTasks);
      });
    });
  }

  function renderTaskList() {
    var html = '<div class="card"><table><thead><tr><th>Tiêu đề</th><th>Người phụ trách</th><th>Hạn chót</th><th>Trạng thái</th><th>Ưu tiên</th></tr></thead><tbody>';
    if (STATE.tasksCache.length === 0) html += '<tr><td colspan="5" class="muted">Chưa có task nào.</td></tr>';
    STATE.tasksCache.forEach(function (t) {
      html += '<tr class="clickable" data-id="' + t.id + '"><td>' + t.title + (t.isOverdue ? ' <span class="badge red">Quá hạn</span>' : '') + '</td>' +
        '<td>' + t.assigneeEmail + '</td><td>' + (t.deadline || '—') + '</td>' +
        '<td><select data-quick-status="' + t.id + '">' + STATUS_ORDER.map(function (s) { return '<option value="' + s + '" ' + (t.status === s ? 'selected' : '') + '>' + STATUS_LABELS[s] + '</option>'; }).join('') + '</select></td>' +
        '<td>' + t.priority + '</td></tr>';
    });
    html += '</tbody></table></div>';
    setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-quick-status]'), function (sel) {
        sel.addEventListener('click', function (e) { e.stopPropagation(); });
        sel.addEventListener('change', function (e) {
          updateTask(sel.getAttribute('data-quick-status'), { status: e.target.value }).then(loadTasks);
        });
      });
    }, 0);
    return html;
  }

  function renderTaskByDate() {
    var groups = {};
    STATE.tasksCache.forEach(function (t) {
      var key = t.deadline || 'Không có hạn';
      groups[key] = groups[key] || [];
      groups[key].push(t);
    });
    var dates = Object.keys(groups).sort();
    var html = '';
    if (dates.length === 0) html = '<p class="muted">Chưa có task nào.</p>';
    dates.forEach(function (d) {
      html += '<div class="card"><h4 style="margin-top:0">' + d + '</h4>' + groups[d].map(taskCardHtml).join('') + '</div>';
    });
    return html;
  }

  function openTaskForm(defaults, onDone, members) {
    Promise.resolve(members || (STATE.user.role === 'LEADER' ? listSaleMembers() : [])).then(function (memberList) {
      var isLeader = STATE.user.role === 'LEADER';
      var assigneeField = isLeader
        ? '<select id="fAssignee">' + [{ email: STATE.user.email, name: STATE.user.name + ' (bạn)' }].concat(memberList).map(function (m) {
            return '<option value="' + m.email + '" ' + (defaults.assigneeEmail === m.email ? 'selected' : '') + '>' + (m.name || m.email) + '</option>';
          }).join('') + '</select>'
        : '<input id="fAssignee" value="' + STATE.user.email + '" disabled>';

      listCustomers({}).then(function (customers) {
        showModal(
          '<h3>Tạo Task mới</h3>' +
          '<div class="field"><label>Tiêu đề</label><input id="fTitle" placeholder="VD: Gọi lại chốt đơn"></div>' +
          '<div class="field"><label>Người phụ trách</label>' + assigneeField + '</div>' +
          '<div class="field"><label>Hạn chót</label><input id="fDeadline" type="date" value="' + (defaults.deadline || '') + '"></div>' +
          '<div class="field"><label>Độ ưu tiên</label><select id="fPriority"><option>Thấp</option><option selected>Trung bình</option><option>Cao</option></select></div>' +
          '<div class="field"><label>Khách hàng liên kết (tuỳ chọn)</label><select id="fCustomer"><option value="">— Không —</option>' +
            customers.map(function (c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label>Mô tả</label><textarea id="fDesc" rows="2"></textarea></div>' +
          '<div class="row" style="justify-content:flex-end"><button class="btn ghost" id="fCancel">Huỷ</button><button class="btn primary" id="fSubmit">Tạo Task</button></div>'
        );
        document.getElementById('fCancel').addEventListener('click', closeModal);
        document.getElementById('fSubmit').addEventListener('click', function () {
          var title = document.getElementById('fTitle').value;
          if (!title) return alert('Nhập tiêu đề task.');
          createTask({
            title: title,
            assigneeEmail: document.getElementById('fAssignee').value,
            deadline: document.getElementById('fDeadline').value,
            priority: document.getElementById('fPriority').value,
            customerId: document.getElementById('fCustomer').value,
            description: document.getElementById('fDesc').value
          }).then(function () { closeModal(); onDone(); });
        });
      });
    });
  }

  // ---------- Khách hàng ----------
  function renderCustomersView() {
    loadCustomers({});
  }

  function loadCustomers(filter) {
    listCustomers(filter).then(function (customers) {
      STATE.customersCache = customers;
      paintCustomers(filter);
    });
  }

  function paintCustomers(filter) {
    var main = document.getElementById('mainContent');
    var statuses = ['Mới', 'Đang chăm sóc', 'Đã chốt', 'Không tiềm năng'];
    var html = '<div class="toolbar"><h2 style="margin:0">Khách hàng</h2>' +
      '<input id="custSearch" placeholder="Tìm theo tên/SĐT" value="' + (filter.search || '') + '">' +
      '<select id="custStatusFilter"><option value="">Tất cả trạng thái</option>' +
      statuses.map(function (s) { return '<option ' + (filter.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button class="btn primary" id="btnNewCustomer" style="margin-left:auto">+ Thêm khách hàng</button></div>';
    html += '<div class="card"><table><thead><tr><th>Tên</th><th>SĐT</th><th>Trạng thái</th><th>Người phụ trách</th></tr></thead><tbody>';
    if (STATE.customersCache.length === 0) html += '<tr><td colspan="4" class="muted">Chưa có khách hàng nào.</td></tr>';
    STATE.customersCache.forEach(function (c) {
      html += '<tr class="clickable" data-id="' + c.id + '"><td>' + c.name + '</td><td>' + (c.phone || '—') + '</td><td>' + c.status + '</td><td>' + c.ownerEmail + '</td></tr>';
    });
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('custSearch').addEventListener('input', debounce(function (e) { loadCustomers({ search: e.target.value, status: filter.status }); }, 350));
    document.getElementById('custStatusFilter').addEventListener('change', function (e) { loadCustomers({ search: filter.search, status: e.target.value }); });
    document.getElementById('btnNewCustomer').addEventListener('click', openCustomerForm);
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-id]'), function (tr) {
      tr.addEventListener('click', function () { openCustomerDetail(tr.getAttribute('data-id')); });
    });
  }

  function openCustomerForm() {
    showModal(
      '<h3>Thêm khách hàng</h3>' +
      '<div class="field"><label>Tên</label><input id="cName"></div>' +
      '<div class="field"><label>SĐT</label><input id="cPhone"></div>' +
      '<div class="field"><label>Trạng thái</label><select id="cStatus"><option>Mới</option><option>Đang chăm sóc</option><option>Đã chốt</option><option>Không tiềm năng</option></select></div>' +
      '<div class="field"><label>Ghi chú</label><textarea id="cNote" rows="2"></textarea></div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cCancel">Huỷ</button><button class="btn primary" id="cSubmit">Lưu</button></div>'
    );
    document.getElementById('cCancel').addEventListener('click', closeModal);
    document.getElementById('cSubmit').addEventListener('click', function () {
      var name = document.getElementById('cName').value;
      if (!name) return alert('Nhập tên khách hàng.');
      createCustomer({
        name: name, phone: document.getElementById('cPhone').value,
        status: document.getElementById('cStatus').value, note: document.getElementById('cNote').value
      }).then(function () { closeModal(); renderCustomersView(); });
    });
  }

  function openCustomerDetail(id) {
    getCustomerDetail(id).then(function (r) {
      var c = r.customer, timeline = r.timeline;
      var html = '<h3>' + c.name + '</h3><p class="muted">' + (c.phone || '') + '</p>' +
        '<div class="field"><label>Trạng thái</label><select id="dStatus">' +
        ['Mới', 'Đang chăm sóc', 'Đã chốt', 'Không tiềm năng'].map(function (s) { return '<option ' + (c.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        (c.note ? '<p class="muted">Ghi chú: ' + c.note + '</p>' : '') +
        '<h4>Lịch sử tương tác (từ Task)</h4>';
      if (timeline.length === 0) html += '<p class="muted">Chưa có task nào gắn với khách hàng này.</p>';
      timeline.forEach(function (t) {
        html += '<div class="checklist-item"><span class="title">' + t.title + ' — ' + STATUS_LABELS[t.status] + '</span><span class="meta">' + (t.deadline || '') + '</span></div>';
      });
      html += '<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="dClose">Đóng</button></div>';
      showModal(html);
      document.getElementById('dClose').addEventListener('click', closeModal);
      document.getElementById('dStatus').addEventListener('change', function (e) {
        updateCustomer(c.id, { status: e.target.value }).then(function () { closeModal(); renderCustomersView(); });
      });
    });
  }

  // ---------- Dashboard (Leader) ----------
  var dashboardDate = TODAY;
  function renderDashboardView() {
    loadDashboard();
  }
  function loadDashboard() {
    getTeamOverview(dashboardDate).then(paintDashboard);
  }
  function paintDashboard(data) {
    var main = document.getElementById('mainContent');
    var html = '<div class="toolbar"><h2 style="margin:0">Dashboard</h2><input type="date" id="dashDate" value="' + dashboardDate + '"></div>';
    html += '<div class="kpi-row">' +
      '<div class="kpi"><div class="label">Tổng mục tiêu team</div><div class="value">' + fmtMoney(data.totalTarget) + '</div></div>' +
      '<div class="kpi"><div class="label">Tổng doanh thu thực tế</div><div class="value">' + fmtMoney(data.totalActual) + '</div></div>' +
      '<div class="kpi"><div class="label">% đạt trung bình</div><div class="value">' + (data.avgPct === null ? '—' : data.avgPct + '%') + '</div></div>' +
      '</div>';
    html += '<div class="card"><table><thead><tr><th>Sale</th><th>Mục tiêu</th><th>Thực tế</th><th>% đạt</th><th>Task</th><th>Trạng thái</th></tr></thead><tbody>';
    if (data.rows.length === 0) html += '<tr><td colspan="6" class="muted">Chưa có thành viên Sale nào.</td></tr>';
    data.rows.forEach(function (r) {
      var statusBadge = r.status === 'Đã chốt' ? '<span class="badge green">Đã chốt</span>' : (r.status === 'Chưa chốt' ? '<span class="badge amber">Chưa chốt</span>' : '<span class="badge gray">Chưa đặt mục tiêu</span>');
      html += '<tr class="clickable" data-email="' + r.email + '"><td>' + (r.name || r.email) + '</td><td>' + fmtMoney(r.target) + '</td><td>' + fmtMoney(r.actual) + '</td>' +
        '<td>' + pctBadge(r.pct) + '</td><td>' + r.tasksDone + '/' + r.tasksTotal + '</td><td>' + statusBadge + '</td></tr>';
    });
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('dashDate').addEventListener('change', function (e) { dashboardDate = e.target.value; loadDashboard(); });
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-email]'), function (tr) {
      tr.addEventListener('click', function () { openSaleDetail(tr.getAttribute('data-email')); });
    });
  }

  function openSaleDetail(email) {
    getLogForUserAndDate(email, dashboardDate).then(function (log) {
      var html = '<h3>Nhật ký ngày · ' + email + ' · ' + dashboardDate + '</h3>';
      if (!log.id || log.revenueTarget === '') {
        html += '<p class="muted">Chưa đặt mục tiêu cho ngày này.</p>';
      } else {
        var pct = log.revenueTarget > 0 ? Math.round((Number(log.revenueActual) || 0) / Number(log.revenueTarget) * 100) : null;
        html += '<p>Mục tiêu: <b>' + fmtMoney(log.revenueTarget) + '</b></p>';
        html += log.isLocked
          ? '<p>Thực tế: <b>' + fmtMoney(log.revenueActual) + '</b> ' + pctBadge(pct) + '</p>' + (log.note ? '<p class="muted">Ghi chú: ' + log.note + '</p>' : '')
          : '<p class="muted">Chưa chốt báo cáo ngày này.</p>';
        if (log.isLocked) html += '<button class="btn danger" id="btnUnlock">Mở khoá để Sale sửa lại</button>';
      }
      html += '<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="sClose">Đóng</button></div>';
      showModal(html);
      document.getElementById('sClose').addEventListener('click', closeModal);
      var unlockBtn = document.getElementById('btnUnlock');
      if (unlockBtn) unlockBtn.addEventListener('click', function () {
        unlockDailyLog(email, dashboardDate).then(function () { closeModal(); loadDashboard(); });
      });
    });
  }



  // ---------- Bản đồ thị trường ----------
  var marketMapMode = 'map';
  var mmFilter = { province: '', status: '', currentSoftware: '', urgency: '', ownerEmail: '', search: '' };
  var mmLeafletMap = null;

  function ensureMmConfig() {
    if (STATE.mmConfig) return Promise.resolve(STATE.mmConfig);
    return getMarketMapConfig().then(function (cfg) { STATE.mmConfig = cfg; return cfg; });
  }

  function renderMarketMapView() {
    marketMapMode = 'map';
    mmFilter = { province: '', status: '', currentSoftware: '', urgency: '', ownerEmail: '', search: '' };
    ensureMmConfig().then(loadMarketMap);
  }

  function loadMarketMap() {
    var isLeader = STATE.user.role === 'LEADER';
    var calls = [listOutlets(mmFilter)];
    calls.push(isLeader ? listSaleMembers() : Promise.resolve([]));
    Promise.all(calls).then(function (r) {
      STATE.outletsCache = r[0];
      paintMarketMap(r[1]);
    });
  }

  function statusBadgeClass_(status) {
    return status === 'Đã hợp tác' ? 'green' : (status === 'Đang khai thác' ? 'amber' : (status === 'Ngừng hợp tác' ? 'red' : 'gray'));
  }

  function urgencyBadge_(o) {
    var label = o.daysLeft !== null
      ? (o.daysLeft < 0 ? 'Đã hết hạn' : o.daysLeft + ' ngày còn lại')
      : (o.contractEstimate || 'Không rõ');
    return '<span class="badge ' + o.urgency + '">' + label + '</span>';
  }

  function paintMarketMap(members) {
    var cfg = STATE.mmConfig;
    var isLeader = STATE.user.role === 'LEADER';
    var main = document.getElementById('mainContent');

    var html = '<div class="toolbar"><h2 style="margin:0">Bản đồ thị trường</h2>';
    ['map', 'list'].concat(isLeader ? ['coverage'] : []).forEach(function (m) {
      var label = m === 'map' ? 'Bản đồ' : (m === 'list' ? 'Danh sách' : 'Độ phủ');
      html += '<button class="btn ' + (marketMapMode === m ? 'primary' : 'ghost') + '" data-mmmode="' + m + '">' + label + '</button>';
    });
    html += '<button class="btn success" id="btnQuickCheckin" style="margin-left:auto">⚡ Check-in nhanh</button>';
    html += '<button class="btn ghost" id="btnNewOutlet">+ Thêm điểm bán (đầy đủ)</button></div>';

    html += '<div class="toolbar" id="mmFilters">';
    html += '<button class="btn ' + (!mmFilter.province ? 'primary' : 'ghost') + '" data-fprovince="">Tất cả khu vực</button>';
    cfg.provinces.forEach(function (p) {
      html += '<button class="btn ' + (mmFilter.province === p ? 'primary' : 'ghost') + '" data-fprovince="' + p + '">' + p + '</button>';
    });
    html += '<select id="fStatus"><option value="">Trạng thái: Tất cả</option>' +
      cfg.outletStatuses.map(function (s) { return '<option ' + (mmFilter.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
    html += '<select id="fSoftware"><option value="">Phần mềm đang dùng: Tất cả</option>' +
      cfg.currentSoftwareOptions.map(function (s) { return '<option ' + (mmFilter.currentSoftware === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
    html += '<select id="fUrgency"><option value="">Thời gian còn lại: Tất cả</option>' +
      '<option value="red" ' + (mmFilter.urgency === 'red' ? 'selected' : '') + '>Sắp hết hạn (≤30 ngày)</option>' +
      '<option value="amber" ' + (mmFilter.urgency === 'amber' ? 'selected' : '') + '>31–90 ngày</option>' +
      '<option value="green" ' + (mmFilter.urgency === 'green' ? 'selected' : '') + '>Trên 90 ngày</option>' +
      '<option value="gray" ' + (mmFilter.urgency === 'gray' ? 'selected' : '') + '>Không rõ</option></select>';
    if (isLeader) {
      html += '<select id="fOwner"><option value="">Tất cả nhân viên</option>' +
        members.map(function (m) { return '<option value="' + m.email + '" ' + (mmFilter.ownerEmail === m.email ? 'selected' : '') + '>' + (m.name || m.email) + '</option>'; }).join('') + '</select>';
    }
    html += '<input id="fSearch" placeholder="Tìm theo tên/SĐT/địa chỉ" value="' + (mmFilter.search || '') + '">';
    html += '</div>';

    html += '<div id="mmBody"></div>';
    main.innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('[data-mmmode]'), function (b) {
      b.addEventListener('click', function () { marketMapMode = b.getAttribute('data-mmmode'); paintMarketMap(members); });
    });
    document.getElementById('btnNewOutlet').addEventListener('click', function () { openOutletForm(null, members); });
    document.getElementById('btnQuickCheckin').addEventListener('click', openQuickCheckin);
    Array.prototype.forEach.call(document.querySelectorAll('[data-fprovince]'), function (b) {
      b.addEventListener('click', function () { mmFilter.province = b.getAttribute('data-fprovince'); loadMarketMap(); });
    });
    document.getElementById('fStatus').addEventListener('change', function (e) { mmFilter.status = e.target.value; loadMarketMap(); });
    document.getElementById('fSoftware').addEventListener('change', function (e) { mmFilter.currentSoftware = e.target.value; loadMarketMap(); });
    document.getElementById('fUrgency').addEventListener('change', function (e) { mmFilter.urgency = e.target.value; loadMarketMap(); });
    if (isLeader) document.getElementById('fOwner').addEventListener('change', function (e) { mmFilter.ownerEmail = e.target.value; loadMarketMap(); });
    document.getElementById('fSearch').addEventListener('input', debounce(function (e) { mmFilter.search = e.target.value; loadMarketMap(); }, 350));

    var body = document.getElementById('mmBody');
    if (marketMapMode === 'map') {
      body.appendChild(el('<div id="mmMap"></div>'));
      renderLeafletMap();
    } else if (marketMapMode === 'list') {
      body.appendChild(el(renderOutletList()));
    } else {
      renderCoverageInto(body);
    }
  }

  function renderOutletList() {
    var html = '<div class="card"><table><thead><tr><th>Tên điểm bán</th><th>Khu vực</th><th>Trạng thái</th>' +
      '<th>Phần mềm đang dùng</th><th>Thời gian còn lại</th><th>Bán thêm được gì</th><th>Phụ trách</th></tr></thead><tbody>';
    if (STATE.outletsCache.length === 0) html += '<tr><td colspan="7" class="muted">Chưa có điểm bán nào.</td></tr>';
    STATE.outletsCache.forEach(function (o) {
      html += '<tr class="clickable" data-id="' + o.id + '"><td>' + o.name + '</td><td>' + o.province + '</td>' +
        '<td><span class="badge ' + statusBadgeClass_(o.status) + '">' + o.status + '</span></td>' +
        '<td>' + (o.currentSoftware === 'Khác' ? o.currentSoftwareOther : (o.currentSoftware || '—')) + '</td>' +
        '<td>' + urgencyBadge_(o) + '</td>' +
        '<td>' + (o.upsellItems.join(', ') || '—') + '</td>' +
        '<td>' + (o.ownerEmail || '') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('#mmBody tr[data-id]'), function (tr) {
        tr.addEventListener('click', function () { openOutletDetail(tr.getAttribute('data-id')); });
      });
    }, 0);
    return html;
  }

  // Chỉ tải thư viện Leaflet (CSS+JS từ CDN) khi người dùng thực sự mở tab Bản đồ,
  // thay vì tải sẵn ngay từ đầu — giúp các tab khác load nhanh hơn.
  var leafletReady = null;
  function ensureLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Không tải được thư viện bản đồ. Kiểm tra kết nối mạng rồi thử lại.')); };
      document.head.appendChild(script);
    });
    return leafletReady;
  }

  // Bao vùng 4 khu vực Đắk Lắk / Gia Lai / Phú Yên / Quy Nhơn — bản đồ chỉ xoay quanh
  // vùng này, không cho kéo/zoom ra ngoài để dễ tìm điểm bán khi check-in.
  var REGION_BOUNDS = [[11.6, 106.8], [15.1, 110.0]];

  function renderLeafletMap() {
    var body = document.getElementById('mmBody');
    ensureLeaflet().then(function () {
      setTimeout(function () {
        if (mmLeafletMap) { mmLeafletMap.remove(); mmLeafletMap = null; }
        mmLeafletMap = L.map('mmMap', {
          maxBounds: REGION_BOUNDS,
          maxBoundsViscosity: 0.8,
          minZoom: 7
        }).fitBounds(REGION_BOUNDS);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mmLeafletMap);

        var colorFor = { 'Đã hợp tác': '#16D865', 'Đang khai thác': '#F5A524', 'Tiềm năng': '#6B7280', 'Ngừng hợp tác': '#E5484D' };
        STATE.outletsCache.forEach(function (o) {
          if (!o.lat || !o.lng) return;
          var marker = L.circleMarker([Number(o.lat), Number(o.lng)], {
            radius: 8, color: '#fff', weight: 2, fillColor: colorFor[o.status] || '#6B7280', fillOpacity: 0.95
          }).addTo(mmLeafletMap);
          marker.bindPopup('<b>' + o.name + '</b><br>' + o.status + '<br><a href="#" data-open-outlet="' + o.id + '">Xem chi tiết →</a>');
          marker.on('popupopen', function () {
            var link = document.querySelector('[data-open-outlet="' + o.id + '"]');
            if (link) link.addEventListener('click', function (e) { e.preventDefault(); openOutletDetail(o.id); });
          });
        });

        mmLeafletMap.on('click', function (e) {
          if (!confirm('Thêm điểm bán mới tại vị trí này?')) return;
          openOutletForm({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }, 0);
    }).catch(function (err) {
      body.innerHTML = '<p class="muted">' + err.message + '</p>';
    });
  }

  function renderCoverageInto(body) {
    getCoverageStats({ province: mmFilter.province }).then(function (data) {
      var html = '<div class="kpi-row">';
      Object.keys(data.byProvince).forEach(function (p) {
        var s = data.byProvince[p];
        var pct = s.total > 0 ? Math.round(s.visited30d / s.total * 100) : null;
        html += '<div class="kpi"><div class="label">' + p + '</div><div class="value">' + s.total + ' điểm</div>' +
          '<div class="muted" style="margin-top:4px;font-size:12px">Đã ghé 30 ngày: ' + (pct === null ? '—' : pct + '%') +
          ' · Sắp hết hạn: ' + s.urgent + '</div></div>';
      });
      html += '</div>';
      html += '<div class="card"><table><thead><tr><th>Sale</th><th>Số điểm phụ trách</th><th>Đã ghé (30 ngày)</th></tr></thead><tbody>';
      if (data.byRep.length === 0) html += '<tr><td colspan="3" class="muted">Chưa có Sale nào.</td></tr>';
      data.byRep.forEach(function (r) {
        html += '<tr><td>' + (r.name || r.email) + '</td><td>' + r.total + '</td><td>' + r.visited30d + '/' + r.total + '</td></tr>';
      });
      html += '</tbody></table></div>';
      body.innerHTML = html;
    });
  }

  function openOutletForm(defaults, members) {
    defaults = defaults || {};
    Promise.all([ensureMmConfig(), Promise.resolve(members || (STATE.user.role === 'LEADER' ? listSaleMembers() : []))]).then(function (r) {
      var cfg = r[0], memberList = r[1];
      var isLeader = STATE.user.role === 'LEADER';
      var isEdit = !!defaults.id;
      var ownerField = isLeader
        ? '<select id="oOwner">' + [{ email: STATE.user.email, name: STATE.user.name + ' (bạn)' }].concat(memberList).map(function (m) {
            return '<option value="' + m.email + '" ' + (defaults.ownerEmail === m.email ? 'selected' : '') + '>' + (m.name || m.email) + '</option>';
          }).join('') + '</select>'
        : '<input value="' + STATE.user.email + '" disabled>';

      var html = '<h3>' + (isEdit ? 'Sửa điểm bán' : 'Thêm điểm bán mới') + '</h3>';
      html += '<div class="field"><label>Tên điểm bán</label><input id="oName" value="' + (defaults.name || '') + '"></div>';

      html += '<div class="form-section tint-blue"><h4><span class="dot"></span>Thông tin cơ bản</h4>';
      html += '<div class="row">';
      html += '<div class="field col"><label>Loại hình</label><select id="oType">' +
        cfg.outletTypes.map(function (t) { return '<option ' + (defaults.type === t ? 'selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>';
      html += '<div class="field col"><label>Khu vực</label><select id="oProvince">' +
        cfg.provinces.map(function (p) { return '<option ' + (defaults.province === p ? 'selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>';
      html += '</div>';
      html += '<div class="field"><label>Địa chỉ</label><input id="oAddress" value="' + (defaults.address || '') + '"></div>';
      html += '<div class="row">';
      html += '<div class="field col"><label>SĐT</label><input id="oPhone" value="' + (defaults.phone || '') + '"></div>';
      html += '<div class="field col"><label>Người phụ trách</label>' + ownerField + '</div>';
      html += '</div>';
      html += '<div class="field"><label>Trạng thái</label><select id="oStatus">' +
        cfg.outletStatuses.map(function (s) { return '<option ' + (defaults.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>';
      html += '</div>';

      html += '<div class="form-section tint-amber"><h4><span class="dot"></span>Phần mềm & hợp đồng</h4>';
      html += '<div class="row">';
      html += '<div class="field col"><label>Phần mềm đang dùng</label><select id="oSoftware">' +
        cfg.currentSoftwareOptions.map(function (s) { return '<option ' + (defaults.currentSoftware === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>';
      html += '<div class="field col"><label>Ghi rõ nếu chọn "Khác"</label><input id="oSoftwareOther" value="' + (defaults.currentSoftwareOther || '') + '"></div>';
      html += '</div>';
      html += '<div class="row">';
      html += '<div class="field col"><label>Ngày hết hạn hợp đồng (nếu biết)</label><input id="oExpiry" type="date" value="' + (defaults.contractExpiry ? String(defaults.contractExpiry).slice(0, 10) : '') + '"></div>';
      html += '<div class="field col"><label>Hoặc ước lượng thời gian còn lại</label><select id="oEstimate"><option value="">— Không chọn —</option>' +
        cfg.contractEstimateOptions.map(function (s) { return '<option ' + (defaults.contractEstimate === s ? 'selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>';
      html += '</div>';
      html += '</div>';

      html += '<div class="form-section tint-green"><h4><span class="dot"></span>Cơ hội bán thêm</h4>';
      html += '<div class="chip-group" id="oUpsell">' + cfg.upsellItems.map(function (u) {
        var checked = (defaults.upsellItems || []).indexOf(u) !== -1;
        return '<label class="chip-check' + (checked ? ' checked' : '') + '"><input type="checkbox" value="' + u + '" ' + (checked ? 'checked' : '') + '>' + u + '</label>';
      }).join('') + '</div>';
      html += '</div>';

      html += '<div class="field"><label>Ghi chú</label><textarea id="oNote" rows="2">' + (defaults.note || '') + '</textarea></div>';
      html += '<div class="field"><label>Vị trí GPS</label><div class="row" style="align-items:center">' +
        '<span class="muted" id="oGpsLabel">' + (defaults.lat ? Number(defaults.lat).toFixed(5) + ', ' + Number(defaults.lng).toFixed(5) : 'Chưa có toạ độ') + '</span>' +
        '<button type="button" class="btn ghost" id="oUseGps">Dùng vị trí hiện tại</button></div></div>';

      html += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" id="oCancel">Huỷ</button><button class="btn primary" id="oSubmit">' + (isEdit ? 'Lưu' : 'Thêm điểm bán') + '</button></div>';

      showModal(html);
      Array.prototype.forEach.call(document.querySelectorAll('#oUpsell .chip-check'), function (label) {
        var input = label.querySelector('input');
        input.addEventListener('change', function () { label.classList.toggle('checked', input.checked); });
      });
      var gps = { lat: defaults.lat || '', lng: defaults.lng || '' };
      document.getElementById('oCancel').addEventListener('click', closeModal);
      document.getElementById('oUseGps').addEventListener('click', function () {
        if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ định vị.');
        navigator.geolocation.getCurrentPosition(function (pos) {
          gps.lat = pos.coords.latitude; gps.lng = pos.coords.longitude;
          document.getElementById('oGpsLabel').textContent = gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5);
        }, function (err) { alert('Không lấy được vị trí: ' + err.message); });
      });
      document.getElementById('oSubmit').addEventListener('click', function () {
        var name = document.getElementById('oName').value;
        if (!name) return alert('Nhập tên điểm bán.');
        var upsellItems = Array.prototype.slice.call(document.querySelectorAll('#oUpsell input:checked')).map(function (c) { return c.value; });
        var payload = {
          name: name,
          type: document.getElementById('oType').value,
          province: document.getElementById('oProvince').value,
          address: document.getElementById('oAddress').value,
          phone: document.getElementById('oPhone').value,
          ownerEmail: isLeader ? document.getElementById('oOwner').value : STATE.user.email,
          status: document.getElementById('oStatus').value,
          currentSoftware: document.getElementById('oSoftware').value,
          currentSoftwareOther: document.getElementById('oSoftwareOther').value,
          contractExpiry: document.getElementById('oExpiry').value,
          contractEstimate: document.getElementById('oEstimate').value,
          upsellItems: upsellItems,
          note: document.getElementById('oNote').value,
          lat: gps.lat, lng: gps.lng
        };
        var call = isEdit ? updateOutlet(defaults.id, payload) : createOutlet(payload);
        call.then(function () { closeModal(); loadMarketMap(); }).catch(function (err) { alert(err.message || err); });
      });
    });
  }

  function openOutletDetail(id) {
    getOutletDetail(id).then(function (r) {
      var o = r.outlet, visits = r.visits;
      var html = '<h3>' + o.name + '</h3><p class="muted">' + (o.address || '') + ' · ' + o.province + '</p>';
      html += '<p><span class="badge ' + statusBadgeClass_(o.status) + '">' + o.status + '</span> ' + urgencyBadge_(o) + '</p>';
      html += '<p>Phần mềm đang dùng: <b>' + (o.currentSoftware === 'Khác' ? o.currentSoftwareOther : (o.currentSoftware || '—')) + '</b></p>';
      html += '<p>Bán thêm được gì: <b>' + (o.upsellItems.join(', ') || '—') + '</b></p>';
      if (o.note) html += '<p class="muted">Ghi chú: ' + o.note + '</p>';
      html += '<div class="row" style="margin:10px 0"><button class="btn success" id="dCheckin">📍 Check-in tại đây</button><button class="btn ghost" id="dEdit">Sửa thông tin</button></div>';
      html += '<h4>Lịch sử ghé thăm</h4>';
      if (visits.length === 0) html += '<p class="muted">Chưa có lượt check-in nào.</p>';
      visits.forEach(function (v) {
        html += '<div class="checklist-item"><span class="title">' + v.purpose + (v.note ? ' — ' + v.note : '') + '</span>' +
          '<span class="meta">' + new Date(v.checkinAt).toLocaleString('vi-VN') + (v.distanceM != null && v.distanceM !== '' ? ' · ' + v.distanceM + 'm' : '') +
          (v.photoUrl ? ' · <a href="' + v.photoUrl + '" target="_blank">Xem ảnh</a>' : '') + '</span></div>';
      });
      html += '<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="dClose">Đóng</button></div>';
      showModal(html);
      document.getElementById('dClose').addEventListener('click', closeModal);
      document.getElementById('dEdit').addEventListener('click', function () { closeModal(); openOutletForm(o); });
      document.getElementById('dCheckin').addEventListener('click', function () { doCheckIn(o); });
    });
  }

  // Mở thẳng camera của máy (không qua hộp thoại chọn file/thư viện ảnh của hệ điều
  // hành) bằng getUserMedia, chụp xong tự resize + nén JPEG luôn trên canvas.
  function capturePhoto_() {
    return new Promise(function (resolve, reject) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        reject(new Error('Trình duyệt không hỗ trợ mở máy ảnh trực tiếp.'));
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
        var overlay = el(
          '<div class="modal-backdrop" style="z-index:10050"><div class="modal" style="max-width:460px;padding:0;overflow:hidden;border-top:none">' +
          '<video autoplay playsinline style="width:100%;display:block;background:#000;max-height:70vh"></video>' +
          '<div class="row" style="padding:14px;justify-content:space-between">' +
          '<button type="button" class="btn ghost" data-act="cancel">Huỷ</button>' +
          '<button type="button" class="btn success" data-act="shutter">📷 Chụp</button>' +
          '</div></div></div>'
        );
        document.body.appendChild(overlay);
        var video = overlay.querySelector('video');
        video.srcObject = stream;

        function cleanup() {
          stream.getTracks().forEach(function (t) { t.stop(); });
          overlay.remove();
        }
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', function () {
          cleanup();
          reject(new Error('CANCELLED'));
        });
        overlay.querySelector('[data-act="shutter"]').addEventListener('click', function () {
          // Ảnh được lưu thẳng trong Firestore (không qua Storage trả phí), nén nhỏ
          // vừa đủ để nằm an toàn dưới giới hạn 1MB/tài liệu của Firestore.
          var maxDim = 900;
          var scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(video.videoWidth * scale) || video.videoWidth;
          canvas.height = Math.round(video.videoHeight * scale) || video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.55);
          cleanup();
          resolve(dataUrl);
        });
      }).catch(function (err) {
        reject(new Error('Không mở được máy ảnh: ' + (err && err.message ? err.message : err)));
      });
    });
  }

  // Gắn nút "Chụp ảnh" + khung preview vào 1 field trong modal đang mở.
  // Trả về hàm getter để lấy dataURL ảnh hiện tại lúc submit.
  function wirePhotoCapture_(btnId, previewId) {
    var current = '';
    function render() {
      var preview = document.getElementById(previewId);
      preview.innerHTML = current
        ? '<img src="' + current + '" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border);display:block;margin-bottom:6px">' +
          '<button type="button" class="btn ghost" data-act="retake">Chụp lại</button>'
        : '';
      if (current) preview.querySelector('[data-act="retake"]').addEventListener('click', open);
    }
    function open() {
      capturePhoto_().then(function (dataUrl) {
        current = dataUrl;
        render();
      }).catch(function (err) {
        if (err.message !== 'CANCELLED') alert(err.message);
      });
    }
    document.getElementById(btnId).addEventListener('click', open);
    return function () { return current; };
  }

  // Luồng nhanh nhất: gặp 1 điểm bán chưa có trong hệ thống, chỉ cần tên + loại hình +
  // khu vực + ảnh là check-in được ngay, không phải điền form đầy đủ (SĐT, địa chỉ,
  // hợp đồng...) trước — những thông tin đó có thể bổ sung sau qua "Sửa thông tin".
  function openQuickCheckin() {
    if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ định vị.');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      ensureMmConfig().then(function (cfg) {
        var html = '<h3>⚡ Check-in nhanh</h3>';
        html += '<div class="field"><label>Tên điểm bán</label><input id="qName" placeholder="VD: Tạp hoá Cô Lan" autofocus></div>';
        html += '<div class="row">';
        html += '<div class="field col"><label>Loại hình</label><select id="qType">' +
          cfg.outletTypes.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>';
        html += '<div class="field col"><label>Khu vực</label><select id="qProvince">' +
          cfg.provinces.map(function (p) { return '<option>' + p + '</option>'; }).join('') + '</select></div>';
        html += '</div>';
        html += '<div class="row">';
        html += '<div class="field col"><label>Phần mềm đang dùng</label><select id="qSoftware">' +
          cfg.currentSoftwareOptions.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>';
        html += '<div class="field col"><label>Thời gian còn lại</label><select id="qEstimate"><option value="">— Không rõ —</option>' +
          cfg.contractEstimateOptions.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>';
        html += '</div>';
        html += '<div class="field"><label>Ảnh chụp (tuỳ chọn)</label>' +
          '<button type="button" class="btn ghost" id="qPhotoBtn">📷 Chụp ảnh</button>' +
          '<div id="qPhotoPreview" style="margin-top:8px"></div></div>';
        html += '<div class="field"><label>Ghi chú</label><textarea id="qNote" rows="2" placeholder="Tình hình tại điểm bán..."></textarea></div>';
        html += '<p class="muted">Vị trí hiện tại: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</p>';
        html += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" id="qCancel">Huỷ</button><button class="btn success" id="qSubmit">✓ Check-in ngay</button></div>';
        showModal(html);

        var getPhoto = wirePhotoCapture_('qPhotoBtn', 'qPhotoPreview');

        document.getElementById('qCancel').addEventListener('click', closeModal);
        document.getElementById('qSubmit').addEventListener('click', function () {
          var name = document.getElementById('qName').value;
          if (!name) return alert('Nhập tên điểm bán.');
          var btn = document.getElementById('qSubmit');
          btn.disabled = true;
          btn.textContent = 'Đang lưu…';
          quickCheckin({
            name: name,
            type: document.getElementById('qType').value,
            province: document.getElementById('qProvince').value,
            currentSoftware: document.getElementById('qSoftware').value,
            contractEstimate: document.getElementById('qEstimate').value,
            lat: lat, lng: lng,
            purpose: 'Khảo sát thị trường',
            note: document.getElementById('qNote').value,
            photoDataUrl: getPhoto()
          }).then(function () {
            closeModal();
            loadMarketMap();
          }).catch(function (err) {
            alert(err.message || err);
            btn.disabled = false;
            btn.textContent = '✓ Check-in ngay';
          });
        });
      });
    }, function (err) { alert('Không lấy được vị trí: ' + err.message); });
  }

  function doCheckIn(outlet) {
    if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ định vị.');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      ensureMmConfig().then(function (cfg) {
        var html = '<h3>Check-in · ' + outlet.name + '</h3>';
        html += '<div class="field"><label>Mục đích ghé thăm</label><select id="ciPurpose">' +
          cfg.visitPurposes.map(function (p) { return '<option>' + p + '</option>'; }).join('') + '</select></div>';
        html += '<div class="field"><label>Ảnh chụp tại điểm bán (tuỳ chọn)</label>' +
          '<button type="button" class="btn ghost" id="ciPhotoBtn">📷 Chụp ảnh</button>' +
          '<div id="ciPhotoPreview" style="margin-top:8px"></div></div>';
        html += '<div class="field"><label>Ghi chú</label><textarea id="ciNote" rows="2" placeholder="Tình hình tại điểm bán..."></textarea></div>';
        html += '<p class="muted">Vị trí hiện tại: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</p>';
        html += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" id="ciCancel">Huỷ</button><button class="btn success" id="ciSubmit">Xác nhận check-in</button></div>';
        showModal(html);

        var getPhoto = wirePhotoCapture_('ciPhotoBtn', 'ciPhotoPreview');

        document.getElementById('ciCancel').addEventListener('click', closeModal);
        document.getElementById('ciSubmit').addEventListener('click', function () {
          var btn = document.getElementById('ciSubmit');
          btn.disabled = true;
          btn.textContent = 'Đang lưu…';
          checkIn(outlet.id, lat, lng, document.getElementById('ciPurpose').value, document.getElementById('ciNote').value, getPhoto())
            .then(function () { closeModal(); openOutletDetail(outlet.id); })
            .catch(function (err) {
              alert(err.message || err);
              btn.disabled = false;
              btn.textContent = 'Xác nhận check-in';
            });
        });
      });
    }, function (err) { alert('Không lấy được vị trí: ' + err.message); });
  }


  // ---------- Thành viên (Leader) ----------
  function renderMembersView() {
    listMembers().then(function (members) {
      var main = document.getElementById('mainContent');
      var html = '<div class="toolbar"><h2 style="margin:0">Thành viên</h2></div>';
      html += '<div class="card row">' +
        '<input id="mEmail" placeholder="email@sapo.vn" class="col">' +
        '<input id="mName" placeholder="Tên hiển thị (tuỳ chọn)" class="col">' +
        '<button class="btn primary" id="btnInvite">+ Mời thành viên</button></div>';
      html += '<div class="card"><table><thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th></tr></thead><tbody>';
      members.forEach(function (m) {
        html += '<tr><td>' + (m.name || '—') + '</td><td>' + m.email + '</td><td>' + (m.role === 'LEADER' ? 'Leader' : 'Sale') + '</td></tr>';
      });
      html += '</tbody></table></div>';
      main.innerHTML = html;
      document.getElementById('btnInvite').addEventListener('click', function () {
        var email = document.getElementById('mEmail').value.trim();
        if (!email) return alert('Nhập email cần mời.');
        inviteMember(email, document.getElementById('mName').value).then(renderMembersView).catch(function (err) { alert(err.message || err); });
      });
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () { var args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, ms); };
  }

  init();
