(function () {
  'use strict';

  var KEY = 'pw.state.v1';
  var REMIND_KEY = 'pw.reminders';
  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  var MODES = {
    focus: { minutes: 25, name: '专注', startText: '开始专注', doneText: '专注完成' },
    short: { minutes: 5, name: '短休息', startText: '开始休息', doneText: '休息结束' },
    long: { minutes: 15, name: '长休息', startText: '开始休息', doneText: '休息结束' }
  };

  var CIRC = 2 * Math.PI * 104;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function ymd(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function todayKey() {
    return ymd(new Date());
  }

  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : null;
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /* ---------------- 状态 ---------------- */

  var DEFAULT_STATE = {
    profile: { nickname: '朋友', startWeight: null, targetWeight: null, height: null },
    weights: [],
    focus: { date: '', count: 0, minutes: 0, total: 0 }
  };

  function freshState() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function loadState() {
    var state = freshState();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        return state;
      }
      var saved = JSON.parse(raw);
      if (saved && saved.profile) {
        state.profile.nickname = saved.profile.nickname || state.profile.nickname;
        state.profile.startWeight = saved.profile.startWeight;
        state.profile.targetWeight = saved.profile.targetWeight;
        state.profile.height = saved.profile.height;
      }
      if (saved && Object.prototype.toString.call(saved.weights) === '[object Array]') {
        state.weights = saved.weights.filter(function (r) {
          return r && typeof r.d === 'string' && typeof r.w === 'number';
        });
      }
      if (saved && saved.focus) {
        state.focus.date = saved.focus.date || '';
        state.focus.count = saved.focus.count || 0;
        state.focus.minutes = saved.focus.minutes || 0;
        state.focus.total = saved.focus.total || 0;
      }
    } catch (e) {
      return freshState();
    }
    return state;
  }

  var state = loadState();

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // 存储空间不足或隐私模式，忽略
    }
  }

  var Native = (function () {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.platform === 'function') {
        return window.AndroidBridge;
      }
    } catch (e) {
      return null;
    }
    return null;
  })();

  function hasNative() {
    return !!Native;
  }

  /* ---------------- 小工具 ---------------- */

  var toastTimer = 0;

  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 2400);
  }

  function sortedWeights(asc) {
    var list = state.weights.slice().sort(function (a, b) {
      if (a.d === b.d) {
        return 0;
      }
      return a.d < b.d ? -1 : 1;
    });
    return asc ? list : list.reverse();
  }

  function latestWeight() {
    var asc = sortedWeights(true);
    return asc.length ? asc[asc.length - 1] : null;
  }

  function streakDays() {
    if (!state.weights.length) {
      return 0;
    }
    var map = {};
    state.weights.forEach(function (r) {
      map[r.d] = true;
    });
    var day = new Date();
    if (!map[ymd(day)]) {
      day.setDate(day.getDate() - 1);
    }
    var count = 0;
    while (map[ymd(day)]) {
      count += 1;
      day.setDate(day.getDate() - 1);
    }
    return count;
  }

  /* ---------------- 提醒 ---------------- */

  var reminders = [];

  function loadReminders() {
    reminders = [];
    if (hasNative() && Native.listReminders) {
      try {
        var obj = JSON.parse(Native.listReminders() || '{}');
        Object.keys(obj).forEach(function (key) {
          if (obj[key]) {
            reminders.push(obj[key]);
          }
        });
      } catch (e) {
        reminders = [];
      }
    } else {
      try {
        var local = JSON.parse(localStorage.getItem(REMIND_KEY) || '[]');
        if (Object.prototype.toString.call(local) === '[object Array]') {
          reminders = local;
        }
      } catch (e) {
        reminders = [];
      }
    }
    reminders.sort(function (a, b) {
      return (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute);
    });
  }

  function persistLocalReminders() {
    try {
      localStorage.setItem(REMIND_KEY, JSON.stringify(reminders));
    } catch (e) {
      // ignore
    }
  }

  function findReminder(id) {
    for (var i = 0; i < reminders.length; i++) {
      if (reminders[i].id === id) {
        return reminders[i];
      }
    }
    return null;
  }

  function timeText(item) {
    return pad(item.hour) + ':' + pad(item.minute);
  }

  function nextReminder() {
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var best = null;
    reminders.forEach(function (item) {
      if (item.enabled === false) {
        return;
      }
      var at = item.hour * 60 + item.minute;
      var diff = at - nowMin;
      if (diff <= 0) {
        diff += 24 * 60;
      }
      if (!best || diff < best.diff) {
        best = { item: item, diff: diff };
      }
    });
    return best;
  }

  function diffText(minutes) {
    if (minutes < 60) {
      return '还有 ' + minutes + ' 分钟';
    }
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return '还有 ' + h + ' 小时' + (m ? ' ' + m + ' 分' : '');
  }

  /* ---------------- 渲染：首页 ---------------- */

  function renderHome() {
    var prev = latestWeight();
    var profile = state.profile;

    if (prev) {
      $('#homeWeight').textContent = prev.w.toFixed(1) + ' kg';
    } else {
      $('#homeWeight').textContent = '-- kg';
    }

    var start = profile.startWeight;
    var target = profile.targetWeight;
    var pct = 0;
    if (start != null && target != null && prev && start > target) {
      if (prev.w <= target) {
        pct = 100;
      } else if (prev.w >= start) {
        pct = 0;
      } else {
        pct = ((start - prev.w) / (start - target)) * 100;
      }
      pct = Math.max(0, Math.min(100, Math.round(pct)));
    }

    $('#homeRingPct').textContent = pct + '%';
    $('#homeRingFg').style.strokeDashoffset = String(113 - (113 * pct) / 100);
    $('#homeBar').style.width = pct + '%';

    if (prev && start != null) {
      var lost = round1(start - prev.w);
      $('#homeWeightSub').textContent = '已经减了 ' + (lost > 0 ? lost : 0).toFixed(1) + ' kg';
    } else if (prev) {
      $('#homeWeightSub').textContent = '最近一次 ' + prev.d.slice(5);
    } else {
      $('#homeWeightSub').textContent = '还没有体重记录';
    }

    if (start != null && target != null && prev) {
      var left = round1(prev.w - target);
      $('#homeFatHint').textContent = left > 0
        ? '再减 ' + left.toFixed(1) + ' kg 就达到目标'
        : '目标已达成，注意保持';
    } else {
      $('#homeFatHint').textContent = '设置起始体重和目标体重，开始记录吧';
    }

    var focus = focusToday();
    $('#homeTomato').textContent = String(focus.count);
    $('#homeFocusMin').textContent = String(focus.minutes);
    $('#homeRemindCount').textContent = String(reminders.length);
    $('#focusState').textContent = focus.count > 0 ? '再来一个 ›' : '开始 ›';

    $('#chipStreak').textContent = '连续记录 ' + streakDays() + ' 天';

    var next = nextReminder();
    if (next) {
      $('#chipNext').textContent = '下次提醒 ' + timeText(next.item);
      $('#homeNextRemind').textContent = timeText(next.item) + ' · ' + next.item.label;
      $('#homeNextRemindSub').textContent = diffText(next.diff) + (next.item.repeat === false ? '（仅一次）' : '（每天）');
    } else {
      $('#chipNext').textContent = '暂无提醒';
      $('#homeNextRemind').textContent = '还没有设置提醒';
      $('#homeNextRemindSub').textContent = '设一个起床、喝水或下班提醒';
    }
  }

  /* ---------------- 渲染：减脂 ---------------- */

  function renderFat() {
    var prev = latestWeight();
    var profile = state.profile;
    var start = profile.startWeight;
    var target = profile.targetWeight;

    $('#fatCurrent').textContent = prev ? prev.w.toFixed(1) : '--';
    $('#fatTarget').textContent = target != null ? Number(target).toFixed(1) : '--';

    var pct = 0;
    if (start != null && target != null && prev && start > target) {
      pct = Math.max(0, Math.min(100, ((start - prev.w) / (start - target)) * 100));
      if (prev.w <= target) {
        pct = 100;
      }
    }
    $('#fatBar').style.width = pct.toFixed(0) + '%';

    if (prev && start != null) {
      var lost = round1(start - prev.w);
      $('#fatLost').textContent = '已减 ' + (lost > 0 ? lost : 0).toFixed(1) + ' kg';
    } else {
      $('#fatLost').textContent = '已减 0.0 kg';
    }

    if (prev && target != null) {
      var left = round1(prev.w - target);
      $('#fatTogo').textContent = left > 0 ? '还差 ' + left.toFixed(1) + ' kg' : '已达成目标';
    } else {
      $('#fatTogo').textContent = '还差 -- kg';
    }

    var heightCm = prev && profile.height ? Number(profile.height) : 0;
    if (prev && heightCm > 80) {
      var m = heightCm / 100;
      var bmi = prev.w / (m * m);
      var tag = bmi < 18.5 ? '偏瘦' : bmi < 24 ? '正常' : bmi < 28 ? '偏重' : '肥胖';
      $('#fatBmi').textContent = '身高 ' + heightCm + ' cm · BMI ' + bmi.toFixed(1) + '（' + tag + '）';
    } else if (prev) {
      $('#fatBmi').textContent = '填写身高可以算出 BMI';
    } else {
      $('#fatBmi').textContent = '先记录一次体重，再设置目标';
    }

    var todayRec = null;
    state.weights.forEach(function (r) {
      if (r.d === todayKey()) {
        todayRec = r;
      }
    });
    $('#fatLast').textContent = todayRec ? '今天已记录' : '今天还没记录';
    $('#fatCount').textContent = state.weights.length + ' 条';

    renderChart();
    renderFatList();
  }

  function renderChart() {
    var box = $('#fatChart');
    var asc = sortedWeights(true).slice(-14);

    if (asc.length < 2) {
      box.innerHTML = '<div class="empty">至少记录 2 天，才能画出趋势</div>';
      return;
    }

    var width = Math.max(280, Math.round(box.clientWidth || 320));
    var height = 150;
    var padX = 20;
    var top = 20;
    var bottom = 26;
    var values = asc.map(function (r) {
      return r.w;
    });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (max - min < 1) {
      max += 0.5;
      min -= 0.5;
    }
    var span = max - min;

    function px(i) {
      return padX + (width - padX * 2) * (i / (asc.length - 1));
    }

    function py(v) {
      return top + (height - top - bottom) * (1 - (v - min) / span);
    }

    var points = asc.map(function (r, i) {
      return { x: px(i), y: py(r.w), r: r };
    });

    var line = points.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    }).join(' ');

    var area = line + ' L' + points[points.length - 1].x.toFixed(1) + ' ' + (height - bottom) +
      ' L' + points[0].x.toFixed(1) + ' ' + (height - bottom) + ' Z';

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '">' +
      '<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#4f46e5" stop-opacity=".22"/>' +
      '<stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/>' +
      '</linearGradient></defs>';

    svg += '<line class="axis" x1="' + padX + '" y1="' + top + '" x2="' + (width - padX) + '" y2="' + top + '"/>';
    svg += '<line class="axis" x1="' + padX + '" y1="' + (height - bottom) + '" x2="' + (width - padX) + '" y2="' + (height - bottom) + '"/>';
    svg += '<path class="area" d="' + area + '"/>';
    svg += '<path class="line" d="' + line + '"/>';

    points.forEach(function (p, i) {
      var last = i === points.length - 1;
      svg += '<circle class="' + (last ? 'pt-last' : 'pt') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (last ? 4 : 2.6) + '"/>';
    });

    var lastPoint = points[points.length - 1];
    svg += '<text class="val" x="' + Math.min(width - 28, lastPoint.x + 6).toFixed(1) + '" y="' + (lastPoint.y - 9).toFixed(1) + '">' + lastPoint.r.w.toFixed(1) + '</text>';
    svg += '<text class="lbl" x="' + padX + '" y="' + (height - 8) + '">' + asc[0].d.slice(5) + '</text>';
    svg += '<text class="lbl" x="' + (width - padX - 32) + '" y="' + (height - 8) + '">' + asc[asc.length - 1].d.slice(5) + '</text>';
    svg += '</svg>';

    box.innerHTML = svg;
  }

  function renderFatList() {
    var list = $('#fatList');
    var desc = sortedWeights(false);

    if (!desc.length) {
      list.innerHTML = '<li class="empty">还没有记录，先称一次体重吧</li>';
      return;
    }

    var html = '';
    desc.forEach(function (r, i) {
      var prev = desc[i + 1];
      var delta = prev ? round1(r.w - prev.w) : null;
      var deltaHtml = '';
      if (delta !== null && delta !== 0) {
        deltaHtml = '<span class="delta ' + (delta < 0 ? 'down' : 'up') + '">' +
          (delta < 0 ? '↓' : '↑') + Math.abs(delta).toFixed(1) + '</span>';
      } else if (delta === 0) {
        deltaHtml = '<span class="delta down">持平</span>';
      }
      var note = r.note ? ' · ' + esc(r.note) : '';
      html += '<li>' +
        '<div class="li-weight"><b>' + r.w.toFixed(1) + '</b><span>kg</span></div>' +
        '<div class="li-body"><p>' + r.d + deltaHtml + '</p><small>' +
        (i === 0 ? '最新记录' : '较上次') + note + '</small></div>' +
        '<button class="icon-btn" type="button" data-del-weight="' + esc(r.d) + '" aria-label="删除">✕</button>' +
        '</li>';
    });
    list.innerHTML = html;
  }

  /* ---------------- 渲染：专注 ---------------- */

  var timer = {
    mode: 'focus',
    total: MODES.focus.minutes * 60 * 1000,
    left: MODES.focus.minutes * 60 * 1000,
    endAt: 0,
    running: false,
    handle: 0
  };

  function focusToday() {
    var today = todayKey();
    if (state.focus.date !== today) {
      return { count: 0, minutes: 0 };
    }
    return { count: state.focus.count, minutes: state.focus.minutes };
  }

  function creditFocus(minutes) {
    var today = todayKey();
    if (state.focus.date !== today) {
      state.focus.date = today;
      state.focus.count = 0;
      state.focus.minutes = 0;
    }
    state.focus.count += 1;
    state.focus.minutes += minutes;
    state.focus.total = (state.focus.total || 0) + 1;
    saveState();
  }

  function paintTimer() {
    var seconds = Math.max(0, Math.ceil(timer.left / 1000));
    var mm = Math.floor(seconds / 60);
    var ss = seconds % 60;
    $('#timerTime').textContent = pad(mm) + ':' + pad(ss);

    var ratio = timer.total > 0 ? Math.max(0, Math.min(1, timer.left / timer.total)) : 0;
    var ring = $('#timerFg');
    ring.style.strokeDasharray = String(CIRC);
    ring.style.strokeDashoffset = String(CIRC * (1 - ratio));
  }

  function renderTimerButton() {
    var btn = $('#btnTimer');
    if (timer.running) {
      btn.textContent = '暂停';
    } else if (timer.left > 0 && timer.left < timer.total) {
      btn.textContent = '继续';
    } else {
      btn.textContent = MODES[timer.mode].startText;
    }
  }

  function renderFocus() {
    $all('.mode').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mode') === timer.mode);
    });
    $('#focusModePill').textContent = MODES[timer.mode].name + ' ' + MODES[timer.mode].minutes;
    paintTimer();
    renderTimerButton();

    var focus = focusToday();
    $('#focusToday').textContent = String(focus.count);
    $('#focusMinutes').textContent = String(focus.minutes);
    $('#focusTotal').textContent = String(state.focus.total || 0);
  }

  function stopTicking() {
    if (timer.handle) {
      clearInterval(timer.handle);
      timer.handle = 0;
    }
  }

  function startTicking() {
    stopTicking();
    timer.handle = setInterval(function () {
      if (!timer.running) {
        return;
      }
      timer.left = timer.endAt - Date.now();
      if (timer.left <= 0) {
        timer.left = 0;
        finishTimer();
        return;
      }
      paintTimer();
    }, 200);
  }

  function clearNativeTimer() {
    if (hasNative() && Native.cancelTimerAlarm) {
      try {
        Native.cancelTimerAlarm();
      } catch (e) {
        // ignore
      }
    }
  }

  function startTimer() {
    if (timer.running) {
      return;
    }
    if (timer.left <= 0) {
      timer.left = timer.total;
    }
    timer.endAt = Date.now() + timer.left;
    timer.running = true;
    $('#timerLabel').textContent = '进行中，保持专注';
    ensureAudio();
    startTicking();
    renderTimerButton();

    if (hasNative() && Native.setTimerAlarm) {
      try {
        Native.setTimerAlarm(Math.ceil(timer.left / 1000), MODES[timer.mode].doneText, '时间到了，休息一下吧');
      } catch (e) {
        // ignore
      }
    }
  }

  function pauseTimer() {
    if (!timer.running) {
      return;
    }
    timer.left = Math.max(0, timer.endAt - Date.now());
    timer.running = false;
    stopTicking();
    clearNativeTimer();
    $('#timerLabel').textContent = '已暂停';
    renderTimerButton();
    paintTimer();
  }

  function resetTimer() {
    timer.running = false;
    stopTicking();
    clearNativeTimer();
    timer.total = MODES[timer.mode].minutes * 60 * 1000;
    timer.left = timer.total;
    $('#timerLabel').textContent = '准备开始';
    paintTimer();
    renderTimerButton();
  }

  function finishTimer() {
    timer.running = false;
    stopTicking();
    clearNativeTimer();
    beep();

    if (timer.mode === 'focus') {
      creditFocus(MODES.focus.minutes);
      var focus = focusToday();
      notify('专注完成', '已完成 ' + focus.count + ' 个番茄，休息 5 分钟吧');
      toast('番茄 +1，休息一下吧');
    } else {
      notify('休息结束', '准备好就继续下一个番茄');
      toast('休息结束，继续加油');
    }

    timer.left = 0;
    paintTimer();
    $('#timerLabel').textContent = MODES[timer.mode].doneText;
    renderTimerButton();
    renderHome();
    renderFocus();
  }

  /* ---------------- 声音 / 通知 ---------------- */

  var audioCtx = null;

  function ensureAudio() {
    try {
      if (audioCtx) {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
      }
    } catch (e) {
      audioCtx = null;
    }
  }

  function beep() {
    if (!audioCtx) {
      return;
    }
    try {
      var base = audioCtx.currentTime;
      for (var i = 0; i < 3; i++) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        var at = base + i * 0.42;
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.36);
      }
    } catch (e) {
      // ignore
    }
  }

  function notify(title, text) {
    if (hasNative() && Native.notifyNow) {
      try {
        Native.notifyNow(title, text);
      } catch (e) {
        // ignore
      }
    }
  }

  /* ---------------- 渲染：提醒 ---------------- */

  function renderReminders() {
    var list = $('#remindList');
    var enabledCount = 0;

    reminders.forEach(function (r) {
      if (r.enabled !== false) {
        enabledCount += 1;
      }
    });

    $('#remindCountPill').textContent = enabledCount + ' 条';
    $('#homeRemindCount').textContent = String(reminders.length);

    if (!reminders.length) {
      list.innerHTML = '<li class="empty">还没有提醒，上面加一个试试</li>';
    } else {
      var html = '';
      reminders.forEach(function (r) {
        var on = r.enabled !== false;
        html += '<li class="remind-item' + (on ? '' : ' is-off') + '">' +
          '<div class="r-time">' + timeText(r) + '</div>' +
          '<div class="r-main"><b>' + esc(r.label) + '</b><span>' +
          (r.repeat === false ? '仅一次' : '每天') + '</span></div>' +
          '<label class="switch"><input type="checkbox" data-toggle="' + esc(r.id) + '"' + (on ? ' checked' : '') + '><i></i></label>' +
          '<button class="icon-btn" type="button" data-del-remind="' + esc(r.id) + '" aria-label="删除">✕</button>' +
          '</li>';
      });
      list.innerHTML = html;
    }

    refreshPermissionUi();
  }

  function refreshPermissionUi() {
    var banner = $('#notifyBanner');
    if (!hasNative()) {
      banner.hidden = true;
      $('#remindFoot').textContent = '当前是浏览器预览模式：提醒只会显示在这里，装成 App 后才会真正响铃。';
      return;
    }
    var needNotify = false;
    var needExact = true;
    try {
      needNotify = Native.hasNotificationPermission ? !Native.hasNotificationPermission() : false;
      needExact = Native.exactAlarmAllowed ? !Native.exactAlarmAllowed() : false;
    } catch (e) {
      needNotify = false;
      needExact = false;
    }
    banner.hidden = !(needNotify || needExact);
    $('#btnExactPerm').hidden = !needExact;
    if (needNotify && !needExact) {
      $('.banner-text').textContent = '通知权限没开，提醒到点也不会响。';
    } else if (!needNotify && needExact) {
      $('.banner-text').textContent = '系统还没允许「准时提醒」，提醒可能晚几分钟。';
    } else {
      $('.banner-text').textContent = '还差两步：开启通知 + 允许准时提醒。';
    }
    $('#remindFoot').textContent = '提醒由系统闹钟触发，重启手机后会自动恢复。国产机型建议在「电池 - 应用启动管理」里允许后台运行。';
  }

  /* ---------------- 弹层 ---------------- */

  function openSheet(html) {
    $('#sheet').innerHTML = html;
    $('#overlay').hidden = false;
  }

  function closeSheet() {
    $('#overlay').hidden = true;
    $('#sheet').innerHTML = '';
  }

  function openNickSheet() {
    openSheet(
      '<h3>怎么称呼你</h3><p>会显示在首页问候和头像上。</p>' +
      '<div class="field"><label>昵称</label>' +
      '<input id="nickInput" maxlength="10" value="' + esc(state.profile.nickname) + '"></div>' +
      '<div class="sheet-actions"><button class="ghost-btn" type="button" data-close="1">取消</button>' +
      '<button class="primary-btn" id="nickSave" type="button">保存</button></div>'
    );
    var input = $('#nickInput');
    if (input) {
      input.focus();
    }
  }

  function openGoalSheet() {
    var p = state.profile;
    openSheet(
      '<h3>减脂目标</h3><p>填起始体重和目标体重，首页就会显示进度。</p>' +
      '<div class="field"><label>起始体重（kg）</label>' +
      '<input id="goalStart" type="number" step="0.1" inputmode="decimal" value="' + (p.startWeight != null ? p.startWeight : '') + '"></div>' +
      '<div class="field"><label>目标体重（kg）</label>' +
      '<input id="goalTarget" type="number" step="0.1" inputmode="decimal" value="' + (p.targetWeight != null ? p.targetWeight : '') + '"></div>' +
      '<div class="field"><label>身高（cm，可选）</label>' +
      '<input id="goalHeight" type="number" step="1" inputmode="numeric" value="' + (p.height != null ? p.height : '') + '"></div>' +
      '<div class="sheet-actions"><button class="ghost-btn" type="button" data-close="1">取消</button>' +
      '<button class="primary-btn" id="goalSave" type="button">保存</button></div>'
    );
  }

  /* ---------------- 交互 ---------------- */

  var currentTab = 'home';

  // 首页是紫色头部，状态栏跟着变紫；其它页面回到浅色
  function applyChrome(tab) {
    if (!hasNative() || !Native.setStatusBar) {
      return;
    }
    try {
      if (tab === 'home') {
        Native.setStatusBar('#4F46E5', false);
      } else {
        Native.setStatusBar('#F4F5F9', true);
      }
    } catch (e) {
      // ignore
    }
  }

  function go(tab) {
    currentTab = tab;
    applyChrome(tab);
    $all('.page').forEach(function (page) {
      page.classList.toggle('is-active', page.id === 'page-' + tab);
    });
    $all('.tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tab);
    });
    window.scrollTo(0, 0);
    if (tab === 'home') {
      renderHome();
    } else if (tab === 'fat') {
      renderFat();
    } else if (tab === 'focus') {
      renderFocus();
    } else if (tab === 'remind') {
      renderReminders();
    }
  }

  function saveWeight() {
    var date = $('#wDate').value || todayKey();
    var value = num($('#wValue').value);
    if (value === null || value < 20 || value > 300) {
      toast('请填写 20 - 300 之间的体重');
      return;
    }
    var note = ($('#wNote').value || '').trim();
    var record = { d: date, w: round1(value), note: note };
    var replaced = false;

    for (var i = 0; i < state.weights.length; i++) {
      if (state.weights[i].d === date) {
        state.weights[i] = record;
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      state.weights.push(record);
    }

    if (state.profile.startWeight == null) {
      state.profile.startWeight = record.w;
    }

    saveState();
    $('#wValue').value = '';
    $('#wNote').value = '';
    renderFat();
    renderHome();
    toast(replaced ? '已更新 ' + date.slice(5) + ' 的记录' : '已记录 ' + record.w.toFixed(1) + ' kg');
  }

  function deleteWeight(date) {
    state.weights = state.weights.filter(function (r) {
      return r.d !== date;
    });
    saveState();
    renderFat();
    renderHome();
    toast('已删除 ' + date.slice(5) + ' 的记录');
  }

  function addReminder() {
    var time = $('#rTime').value || '07:30';
    var parts = time.split(':');
    var hour = parseInt(parts[0], 10);
    var minute = parseInt(parts[1], 10);
    if (isNaN(hour) || isNaN(minute)) {
      toast('请先选择提醒时间');
      return;
    }
    var label = ($('#rLabel').value || '').trim() || '提醒';
    var repeat = $('#rRepeat').value === '1';
    var item = {
      id: 'r' + Date.now(),
      hour: hour,
      minute: minute,
      label: label,
      repeat: repeat,
      enabled: true
    };

    if (hasNative() && Native.saveReminder) {
      try {
        Native.saveReminder(JSON.stringify(item));
        toast('已添加 ' + pad(hour) + ':' + pad(minute) + ' 的提醒');
      } catch (e) {
        toast('添加失败，请重试');
      }
    } else {
      reminders.push(item);
      persistLocalReminders();
      toast('预览模式已记录，安装 App 后才会真正响铃');
    }

    $('#rLabel').value = '';
    loadReminders();
    renderReminders();
    renderHome();
  }

  function toggleReminder(id, enabled) {
    var item = findReminder(id);
    if (!item) {
      return;
    }
    item.enabled = enabled;
    if (hasNative() && Native.saveReminder) {
      Native.saveReminder(JSON.stringify(item));
    } else {
      persistLocalReminders();
    }
    loadReminders();
    renderReminders();
    renderHome();
    toast(enabled ? '已开启 ' + timeText(item) : '已关闭 ' + timeText(item));
  }

  function removeReminder(id) {
    var item = findReminder(id);
    if (hasNative() && Native.deleteReminder) {
      Native.deleteReminder(id);
    } else {
      reminders = reminders.filter(function (r) {
        return r.id !== id;
      });
      persistLocalReminders();
    }
    loadReminders();
    renderReminders();
    renderHome();
    if (item) {
      toast('已删除 ' + timeText(item) + ' 的提醒');
    }
  }

  /* ---------------- 时钟 ---------------- */

  function tickClock() {
    var now = new Date();
    var h = now.getHours();
    var greet;
    if (h < 5) {
      greet = '夜深了';
    } else if (h < 11) {
      greet = '早上好';
    } else if (h < 14) {
      greet = '中午好';
    } else if (h < 18) {
      greet = '下午好';
    } else if (h < 23) {
      greet = '晚上好';
    } else {
      greet = '夜深了';
    }

    $('#greet').textContent = greet + '，' + (state.profile.nickname || '朋友');
    $('#heroDate').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + WEEK[now.getDay()];
    $('#clockMain').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    $('#clockSec').textContent = ':' + pad(now.getSeconds());

    var avatar = $('#btnNick');
    var nick = (state.profile.nickname || '友').trim();
    if (avatar.textContent !== nick.slice(0, 1)) {
      avatar.textContent = nick.slice(0, 1);
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    $('#tabbar').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.tab') : null;
      if (btn) {
        go(btn.getAttribute('data-tab'));
      }
    });

    $all('[data-go]').forEach(function (card) {
      card.addEventListener('click', function () {
        go(card.getAttribute('data-go'));
      });
    });

    $('#btnNick').addEventListener('click', openNickSheet);
    $('#btnGoal').addEventListener('click', openGoalSheet);
    $('#btnSaveWeight').addEventListener('click', saveWeight);

    $('#fatList').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-del-weight]') : null;
      if (btn) {
        deleteWeight(btn.getAttribute('data-del-weight'));
      }
    });

    $('#btnAddRemind').addEventListener('click', addReminder);

    $('#remindList').addEventListener('click', function (e) {
      var del = e.target.closest ? e.target.closest('[data-del-remind]') : null;
      if (del) {
        removeReminder(del.getAttribute('data-del-remind'));
      }
    });

    $('#remindList').addEventListener('change', function (e) {
      var input = e.target;
      if (input && input.getAttribute && input.getAttribute('data-toggle')) {
        toggleReminder(input.getAttribute('data-toggle'), input.checked);
      }
    });

    $('#btnNotifyPerm').addEventListener('click', function () {
      if (hasNative() && Native.requestNotificationPermission) {
        Native.requestNotificationPermission();
      }
    });

    $('#btnExactPerm').addEventListener('click', function () {
      if (hasNative() && Native.openExactAlarmSettings) {
        Native.openExactAlarmSettings();
      }
    });

    $('#modes').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.mode') : null;
      if (!btn) {
        return;
      }
      var mode = btn.getAttribute('data-mode');
      if (!MODES[mode] || mode === timer.mode) {
        return;
      }
      timer.mode = mode;
      resetTimer();
      renderFocus();
    });

    $('#btnTimer').addEventListener('click', function () {
      if (timer.running) {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    $('#btnReset').addEventListener('click', function () {
      resetTimer();
      toast('已重置');
    });

    $('#overlay').addEventListener('click', function (e) {
      if (e.target === $('#overlay')) {
        closeSheet();
      }
    });

    $('#sheet').addEventListener('click', function (e) {
      var close = e.target.closest ? e.target.closest('[data-close]') : null;
      if (close) {
        closeSheet();
        return;
      }
      if (e.target.id === 'nickSave') {
        var nick = ($('#nickInput').value || '').trim() || '朋友';
        state.profile.nickname = nick;
        saveState();
        closeSheet();
        tickClock();
        toast('你好，' + nick);
        return;
      }
      if (e.target.id === 'goalSave') {
        var start = num($('#goalStart').value);
        var target = num($('#goalTarget').value);
        var height = num($('#goalHeight').value);
        if (start !== null && (start < 20 || start > 300)) {
          toast('起始体重看起来不太对');
          return;
        }
        if (target !== null && (target < 20 || target > 300)) {
          toast('目标体重看起来不太对');
          return;
        }
        state.profile.startWeight = start;
        state.profile.targetWeight = target;
        state.profile.height = height;
        saveState();
        closeSheet();
        renderFat();
        renderHome();
        toast('目标已保存');
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && timer.running) {
        timer.left = Math.max(0, timer.endAt - Date.now());
        if (timer.left <= 0) {
          finishTimer();
        } else {
          paintTimer();
        }
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    $('#wDate').value = todayKey();
    bindEvents();
    loadReminders();
    tickClock();
    applyChrome('home');
    setInterval(tickClock, 1000);
    renderHome();
    renderFat();
    renderFocus();
    renderReminders();

    // 原生权限可能在设置页被改过，回到前台时刷新提示
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        loadReminders();
        renderReminders();
      }
    });
  }

  window.App = {
    onBack: function () {
      if (!$('#overlay').hidden) {
        closeSheet();
        return true;
      }
      if (currentTab !== 'home') {
        go('home');
        return true;
      }
      return false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
