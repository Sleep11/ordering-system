// app.js - 前端主逻辑
(function() {
  'use strict';

  // ========== 状态 ==========
  var token = null;
  var currentUser = null;
  var allUsers = [];
  var allOrders = [];
  var expandedDates = {};
  var settings = { orderLocked: false, lunchLocked: false, dinnerLocked: false };
  var lunchSelfPick = false;
  var dinnerSelfPick = false;
  var dishItems = [];
  var dishLoaded = false;
  var lastDishManagerSignature = '';
  var blindLunchPrice = 11;
  var blindDinnerPrice = 12;
  var refreshTimer = null;
  var focusRefreshBound = false;
  var isBatchSubmitting = false;
  var lastRefreshTime = 0;
  var lastOrdersHash = '';
  var lastUsersSignature = '';
  var lastUsersLoadTime = 0;
  var API_BASE = '/api.node.js';
  var MIN_REFRESH_INTERVAL = 3000;
  var USERS_REFRESH_INTERVAL = 30000;
  var ORDERS_REFRESH_INTERVAL = 8000;
  var APP_VERSION = '2.5.1.1';
  var COLLAPSED_KEY = 'ordering_collapsed_sections';
  var DEFAULT_SAFE_USERS = [
    { id: 'admin_chenli', name: '陈立昊', role: 'admin' },
    { id: 'admin_wangyux', name: '王宇翔', role: 'admin' },
    { id: 'user_wanglig', name: '王里庚', role: 'user' },
    { id: 'user_wangchen', name: '王晨强', role: 'user' },
    { id: 'user_kangzi', name: '康子阔', role: 'user' },
    { id: 'user_liuyan', name: '刘彦宏', role: 'user' },
    { id: 'user_weijia', name: '卫佳旺', role: 'user' },
    { id: 'user_zhangxi', name: '张晓旭', role: 'user' },
    { id: 'user_hanzhi', name: '韩志芳', role: 'user' },
    { id: 'user_huchan', name: '胡昌雨', role: 'user' }
  ];

  // ========== 工具函数 ==========
  var MAX_TOASTS = 3;
  var menuOptsCache = '';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getMessageCode(message, type) {
    var input = (type || 'info') + ':' + String(message || '');
    var hash = 0;
    for (var i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) >>> 0;
    }
    return 'MSG-' + (hash % 1679616).toString(36).toUpperCase().padStart(4, '0');
  }

  // ========== Toast 通知系统 ==========
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;

    // 限制最大 toast 数量
    // 排除正在退出的 toast，仅统计活跃 toast
    var toasts = container.querySelectorAll('.toast:not(.toast-exit)');
    while (toasts.length >= MAX_TOASTS) {
      toasts[0].classList.add('toast-exit');
      // toast 自身的 transitionend/fallback 定时器会负责移除 DOM
      toasts = container.querySelectorAll('.toast:not(.toast-exit)');
    }

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var code = getMessageCode(message, type);
    toast.innerHTML = '<span class="toast-icon"></span><span class="toast-msg">' + escapeHtml(message) + '</span>' +
      '<span class="toast-code">' + code + '</span>' +
      '<button type="button" class="toast-copy-code" title="复制提示码">复制</button>';
    container.appendChild(toast);
    // 入场动画
    requestAnimationFrame(function() { toast.classList.add('toast-enter'); });
    // 自动移除
    var duration = type === 'error' ? 6000 : 4500;
    setTimeout(function() {
      toast.classList.add('toast-exit');
      toast.addEventListener('transitionend', function() { toast.remove(); });
      // 兜底：600ms 后强制移除
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 600);
    }, duration);
    // 点击立即关闭
    toast.addEventListener('click', function(e) {
      var copyBtn = toast.querySelector('.toast-copy-code');
      if (copyBtn && e.target === copyBtn) {
        copyToClipboard(code);
        copyBtn.textContent = '已复制';
        setTimeout(function() { copyBtn.textContent = '复制'; }, 1500);
        return;
      }
      toast.classList.add('toast-exit');
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
    });
  }

  // 带确认的操作辅助：显示 loading 状态并执行操作
  function withConfirmFeedback(btnEl, actionFn, successMsg) {
    if (!btnEl) return;
    var origText = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '处理中...';
    // 添加脉冲动效
    btnEl.classList.add('btn-busy');
    var result = actionFn();
    // 处理 Promise 和同步返回值
    var promise = result && typeof result.then === 'function' ? result : Promise.resolve(result);
    promise.then(function(ok) {
      btnEl.disabled = false;
      btnEl.textContent = origText;
      btnEl.classList.remove('btn-busy');
      if (ok !== false && successMsg) {
        showToast(successMsg, 'success');
      }
    }).catch(function(err) {
      btnEl.disabled = false;
      btnEl.textContent = origText;
      btnEl.classList.remove('btn-busy');
      showToast(err && err.message || '操作失败', 'error');
    });
  }

  function getChinaDate() {
    var now = new Date();
    var chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return chinaTime.toISOString().split('T')[0];
  }

  function formatDate(dateStr) {
    var parts = dateStr.split('-');
    return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  }

  function getDayOfWeek(dateStr) {
    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var d = new Date(dateStr + 'T12:00:00+08:00');
    return days[d.getDay()];
  }

  function formatPrice(price) {
    var num = parseFloat(price);
    if (isNaN(num)) return '¥0.00';
    return '¥' + num.toFixed(2);
  }

  function getOrderDiscount(order) {
    if (typeof order.discount === 'number') return order.discount;
    var today = getChinaDate();
    if (order.date === today && order.mealType === 'lunch' && lunchSelfPick) return 1;
    if (order.date === today && order.mealType === 'dinner' && dinnerSelfPick) return 1;
    return 0;
  }

  function getOrderReceivable(order) {
    if (typeof order.receivable === 'number') return order.receivable;
    var price = parseFloat(order.price) || 0;
    return Math.max(0, price - getOrderDiscount(order));
  }

  function getOrderActual(order) {
    if (typeof order.actual === 'number') return order.actual;
    return order.paid ? (parseFloat(order.price) || 0) : 0;
  }

  function getOrderRefund(order) {
    if (typeof order.refund === 'number') return order.refund;
    return order.paid ? getOrderDiscount(order) : 0;
  }

  function getOrderRefunded(order) {
    return !!order.refunded;
  }

  function getOrderItems(order) {
    if (Array.isArray(order.items) && order.items.length > 0) return order.items;
    return [{
      menuId: order.menuId || '',
      name: order.itemName || '未知',
      price: parseFloat(order.price) || 0,
      quantity: 1
    }];
  }

  function getMealTypeName(type) {
    return type === 'lunch' ? '午餐' : '晚餐';
  }

  // ========== API 调用 ==========
  function apiRequest(method, action, data, timeoutMs) {
    var url = API_BASE;
    timeoutMs = timeoutMs || 10000;
    var options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    var timeoutId = null;
    if (window.AbortController) {
      var controller = new AbortController();
      options.signal = controller.signal;
      timeoutId = setTimeout(function() {
        controller.abort();
      }, timeoutMs);
    }
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }

    var params = new URLSearchParams();
    if (token) {
      params.append('token', token);
    }
    params.append('action', action);
    if (data) {
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          var value = data[key];
          if (value !== undefined && value !== null) {
            params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
          }
        }
      }
    }
    options.body = params.toString();

    return fetch(url, options).then(function(response) {
      return response.json().then(function(json) {
        json._status = response.status;
        return json;
      });
    }).finally(function() {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  // ========== 记住登录 ==========
  var STORAGE_KEY = 'ordering_login';

  function saveLoginInfo(username, password, token, remember) {
    try {
      if (remember) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          username: username,
          password: password,
          token: token,
          remember: true
        }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
  }

  function loadLoginInfo() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
  }

  function updateSavedToken(newToken) {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        var parsed = JSON.parse(data);
        parsed.token = newToken;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch (e) {}
  }

  function clearLoginInfo() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function getUsersSignature(users) {
    var parts = [];
    for (var i = 0; i < users.length; i++) {
      parts.push(users[i].id + ':' + users[i].name + ':' + users[i].role);
    }
    return parts.join('|');
  }

  function getDefaultSafeUsers() {
    return DEFAULT_SAFE_USERS.map(function(user) {
      return { id: user.id, name: user.name, role: user.role };
    });
  }

  function showDataLoadNotice(message) {
    var el = document.getElementById('dataLoadNotice');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideDataLoadNotice() {
    var el = document.getElementById('dataLoadNotice');
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
  }

  // ========== 设置管理 ==========
  var settingsLoaded = false;

  // ========== 菜单管理 ==========
  function loadDishes() {
    return apiRequest('POST', 'get-menu', {}).then(function(result) {
      if (result.success && result.data && result.data.menu) {
        dishItems = result.data.menu;
        dishLoaded = true;
        populateDishDropdowns();
        if (currentUser && currentUser.role === 'admin' && allUsers.length > 0) {
          populateBatchOrderTable();
        }
        if (currentUser && currentUser.role === 'admin') {
          renderDishManager();
          lastDishManagerSignature = getDishManagerSignature();
        }
      }
    }).catch(function() {});
  }

  function populateDishDropdowns() {
    menuOptsCache = '';
    var singleSelect = document.getElementById('singleDishItem');
    var editSelect = document.getElementById('editDishItem');
    var html = '<option value="">-- 请选择餐品 --</option>';
    for (var i = 0; i < dishItems.length; i++) {
      var m = dishItems[i];
      html += '<option value="' + escapeHtml(m.id) + '" data-price="' + m.price + '">' + escapeHtml(m.name) + '</option>';
    }
    if (singleSelect) singleSelect.innerHTML = html;
    if (editSelect) editSelect.innerHTML = html;
  }

  function getDishById(id) {
    for (var i = 0; i < dishItems.length; i++) {
      if (dishItems[i].id === id) return dishItems[i];
    }
    return null;
  }

  function updateDishPriceHint(selectId, hintId) {
    var sel = document.getElementById(selectId);
    var hint = document.getElementById(hintId);
    if (!sel || !hint) return;
    var opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
      var price = opt.getAttribute('data-price');
      var qty = selectId === 'singleDishItem' ? (parseInt(document.getElementById('singleQty').value) || 1) : 1;
      hint.textContent = '价格：¥' + ((parseFloat(price) || 0) * qty) + (qty > 1 ? '（' + qty + ' 份）' : '');
    } else {
      hint.textContent = '';
    }
  }

  // 获取盲盒价格
  function getBlindPrice(mealType) {
    return mealType === 'lunch' ? blindLunchPrice : blindDinnerPrice;
  }

  // 格式化盲盒价格显示文本
  function getBlindPriceText() {
    return '午餐盲盒：' + blindLunchPrice.toFixed(2) + '元 | 晚餐盲盒：' + blindDinnerPrice.toFixed(2) + '元';
  }

  function loadSettings() {
    return apiRequest('POST', 'get-settings', {}).then(function(result) {
      if (result.success && result.data && result.data.settings) {
        settings = result.data.settings;
        blindLunchPrice = result.data.settings.blindLunchPrice || 11;
        blindDinnerPrice = result.data.settings.blindDinnerPrice || 12;
        lunchSelfPick = result.data.settings.lunchSelfPick || false;
        dinnerSelfPick = result.data.settings.dinnerSelfPick || false;
        settingsLoaded = true;
        updateSettingsUI();
        // 价格变化后更新批量订餐表格中的盲盒价格
        if (currentUser && currentUser.role === 'admin') {
          populateBatchOrderTable();
        }
      }
    }).catch(function() {
      // 静默失败
    });
  }

  function updateSettingsUI() {
    var lockToggle = document.getElementById('lockToggle');
    if (lockToggle) {
      lockToggle.checked = settings.orderLocked === true;
    }
    var lunchLockToggle = document.getElementById('lunchLockToggle');
    if (lunchLockToggle) {
      lunchLockToggle.checked = settings.lunchLocked === true;
    }
    var dinnerLockToggle = document.getElementById('dinnerLockToggle');
    if (dinnerLockToggle) {
      dinnerLockToggle.checked = settings.dinnerLocked === true;
    }
    var blindLunchInput = document.getElementById('blindLunchPrice');
    if (blindLunchInput) blindLunchInput.value = blindLunchPrice;
    var blindDinnerInput = document.getElementById('blindDinnerPrice');
    if (blindDinnerInput) blindDinnerInput.value = blindDinnerPrice;
    var lunchSelfPickToggle = document.getElementById('lunchSelfPickToggle');
    if (lunchSelfPickToggle) lunchSelfPickToggle.checked = lunchSelfPick;
    var dinnerSelfPickToggle = document.getElementById('dinnerSelfPickToggle');
    if (dinnerSelfPickToggle) dinnerSelfPickToggle.checked = dinnerSelfPick;
  }

  function updateSetting(key, value) {
    return apiRequest('POST', 'update-settings', { key: key, value: value });
  }

  // ========== 折叠功能 ==========
  function loadCollapsedState() {
    try {
      var data = localStorage.getItem(COLLAPSED_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
  }

  function saveCollapsedState(state) {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function initCollapsibleSections() {
    var state = loadCollapsedState();
    var toggles = document.querySelectorAll('.collapsible-toggle');

    for (var i = 0; i < toggles.length; i++) {
      var toggle = toggles[i];
      var section = toggle.getAttribute('data-section');
      var body = toggle.parentElement.querySelector('.collapsible-body');

      if (!body) continue;

      // 注意：不再自动恢复之前的折叠状态
      // 所有面板默认展开，用户手动折叠后才记住状态

      toggle.addEventListener('click', function(t, b, s) {
        return function() {
          var isCollapsed = t.classList.toggle('collapsed');
          b.classList.toggle('collapsed');

          var newState = loadCollapsedState();
          newState[s] = isCollapsed;
          saveCollapsedState(newState);
        };
      }(toggle, body, section));
    }
  }

  // ========== 登录 ==========
  function tryAutoLogin() {
    var saved = loadLoginInfo();
    if (!saved) return false;

    document.getElementById('username').value = saved.username || '';
    document.getElementById('password').value = saved.password || '';
    // 恢复记住密码复选框状态
    if (saved.remember !== undefined) {
      document.getElementById('rememberMe').checked = saved.remember;
    }

    // 如果保存了密码，优先直接用密码登录（token 可能已过期）
    if (saved.username && saved.password) {
      // 显示自动登录提示
      var errorEl = document.getElementById('loginError');
      errorEl.textContent = '';
      var hintEl = document.getElementById('autoLoginHint');
      if (hintEl) hintEl.classList.remove('hidden');
      performLogin(saved.username, saved.password, saved.remember !== false);
      return true;
    }
    return false;
  }

  // 执行登录（供自动登录和手动登录共用）
  function performLogin(username, password, rememberMe) {
    var submitBtn = document.querySelector('#loginForm button[type="submit"]');
    var errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    // 禁用按钮显示加载状态
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.disabled = true;
      submitBtn.textContent = '登录中...';
    }
    apiRequest('POST', 'login', { username: username, password: password })
      .then(function(result) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '登录'; }
        if (result.success) {
          token = result.data.token;
          currentUser = result.data.user;
          saveLoginInfo(username, password, token, rememberMe);
          showMainPage();
        } else {
          errorEl.textContent = result.message || '登录失败';
          // 自动登录失败时清除过期凭据
          if (!result.success && document.getElementById('mainPage').classList.contains('hidden')) {
            var hintEl = document.getElementById('autoLoginHint');
            if (hintEl) hintEl.classList.add('hidden');
            clearLoginInfo();
          }
        }
      })
      .catch(function() {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '登录'; }
        errorEl.textContent = '网络错误，请重试';
      });
  }

  document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;
    var rememberMe = document.getElementById('rememberMe').checked;

    if (!username || !password) {
      document.getElementById('loginError').textContent = '请输入用户名和密码';
      return;
    }

    performLogin(username, password, rememberMe);
  });

  // ========== 显示主页面 ==========
  function showMainPage() {
    var loginPage = document.getElementById('loginPage');
    var mainPage = document.getElementById('mainPage');
    // 淡入主页面
    mainPage.style.opacity = '0';
    mainPage.classList.remove('hidden');
    loginPage.style.opacity = '0';
    // 强制回流后启动过渡
    mainPage.offsetHeight;
    mainPage.style.opacity = '1';
    setTimeout(function() {
      loginPage.classList.add('hidden');
      loginPage.style.opacity = '';
      mainPage.style.opacity = '';
    }, 700);

    document.getElementById('userName').textContent = currentUser.name;
    var roleBadge = document.getElementById('userRole');
    roleBadge.textContent = currentUser.role === 'admin' ? '管理员' : '普通用户';
    roleBadge.className = 'role-badge ' + (currentUser.role === 'admin' ? 'admin' : 'user');

    var versionBadge = document.getElementById('versionBadge');
    if (versionBadge) {
      versionBadge.textContent = 'v' + APP_VERSION;
      versionBadge.style.display = currentUser.role === 'admin' ? '' : 'none';
    }
    var selfpickInline = document.getElementById('selfpickInline');
    if (selfpickInline) {
      selfpickInline.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
    }

    // 管理员显示侧边栏和用户管理区
    if (currentUser.role === 'admin') {
      document.getElementById('sidebar').classList.remove('hidden');
      document.getElementById('section-dish').classList.remove('hidden');
      document.getElementById('section-admin').classList.remove('hidden');
      document.getElementById('section-report').classList.remove('hidden');
      document.getElementById('userSelectGroup').style.display = '';
      document.getElementById('singleDishGroup').style.display = 'none';
      document.getElementById('singleDishItem').removeAttribute('required');
    } else {
      document.getElementById('sidebar').classList.add('hidden');
      document.getElementById('section-dish').classList.add('hidden');
      document.getElementById('section-admin').classList.add('hidden');
      document.getElementById('section-report').classList.add('hidden');
      document.getElementById('userSelectGroup').style.display = 'none';
      document.getElementById('singleDishGroup').style.display = '';
      document.getElementById('singleDishItem').setAttribute('required', 'required');
    }

    // 设置日期默认值
    var dateInput = document.getElementById('orderDate');
    dateInput.value = getChinaDate();
    var chinaNow = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
    var minDate = new Date(chinaNow.getTime() - 30 * 24 * 60 * 60 * 1000);
    var maxDate = new Date(chinaNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    dateInput.min = minDate.toISOString().split('T')[0];
    dateInput.max = maxDate.toISOString().split('T')[0];

    // 8:00-11:30 午餐 / 11:30-20:30 晚餐 / 20:30-8:00 明天午餐
    var nowHour = chinaNow.getUTCHours();
    var nowMin = chinaNow.getUTCMinutes();
    var nowTotalMin = nowHour * 60 + nowMin;
    var mealSelect = document.getElementById('mealType');
    if (nowTotalMin >= 8 * 60 && nowTotalMin < 11 * 60 + 30) {
      mealSelect.value = 'lunch';
    } else if (nowTotalMin >= 11 * 60 + 30 && nowTotalMin < 20 * 60 + 30) {
      mealSelect.value = 'dinner';
    } else {
      mealSelect.value = 'lunch';
      var tomorrow = new Date(chinaNow.getTime() + 24 * 60 * 60 * 1000);
      dateInput.value = tomorrow.toISOString().split('T')[0];
    }
    // 触发 change 事件以更新盲盒价格
    mealSelect.dispatchEvent(new Event('change'));

    // 初始化折叠
    setTimeout(initCollapsibleSections, 0);

    // 管理员：立即用默认用户填充，再异步加载真实数据
    if (currentUser.role === 'admin') {
      allUsers = getDefaultSafeUsers();
      renderAdminUsersArea();
      // 菜品管理和用户管理默认折叠
      ['dish', 'admin'].forEach(function(section) {
        var sectionToggle = document.querySelector('.collapsible-toggle[data-section="' + section + '"]');
        var sectionBody = document.querySelector('#section-' + section + ' .collapsible-body');
        if (sectionToggle && sectionBody && !sectionToggle.classList.contains('collapsed')) {
          sectionToggle.classList.add('collapsed');
          sectionBody.classList.add('collapsed');
          var state = loadCollapsedState();
          state[section] = true;
          saveCollapsedState(state);
        }
      });
    }

    // 加载数据
    loadAllData();
    // 自动加载本周报表
    setTimeout(function() {
      if (currentUser && currentUser.role !== 'admin') return;
      loadReport('week');
    }, 500);
    startAutoRefresh();
  }

  // ========== 全局刷新按钮 ==========
  document.getElementById('refreshBtn').addEventListener('click', function() {
    refreshDataNow();
    showToast('数据已刷新', 'success');
  });

  // ========== 退出登录 ==========
  document.getElementById('logoutBtn').addEventListener('click', function() {
    apiRequest('POST', 'logout', {}).then(function() {
      var saved = loadLoginInfo();
      token = null;
      currentUser = null;
      allUsers = [];
      allOrders = [];
      lastUsersSignature = '';
      lastUsersLoadTime = 0;
      stopAutoRefresh();
      // 如果用户之前勾选了"记住密码"，保留用户名和密码，只清除 token
      // 下次打开页面时会自动重新登录获取新 token
      if (saved && saved.remember) {
        updateSavedToken(null);
      } else {
        clearLoginInfo();
      }
      var mainPage = document.getElementById('mainPage');
      var loginPage = document.getElementById('loginPage');
      mainPage.style.opacity = '0';
      loginPage.classList.remove('hidden');
      loginPage.style.opacity = '0';
      loginPage.offsetHeight;
      loginPage.style.opacity = '1';
      setTimeout(function() {
        mainPage.classList.add('hidden');
        mainPage.style.opacity = '';
        loginPage.style.opacity = '';
      }, 700);
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.getElementById('loginError').textContent = '';
    });
  });

  // ========== 加载数据 ==========
  function loadAllData() {
    var now = Date.now();
    if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) return;
    lastRefreshTime = now;

    // 首次加载设置
    if (!settingsLoaded) {
      loadSettings();
    }
    if (!dishLoaded) {
      loadDishes();
    }

    // 加载订单（不阻塞其他数据加载）
    apiRequest('POST', 'get-orders', {}).then(function(ordersResult) {
      if (ordersResult.success) {
        var newOrders = ordersResult.data.orders || [];
        var newHash = JSON.stringify(newOrders);
        if (newHash === lastOrdersHash) return;
        lastOrdersHash = newHash;
        allOrders = newOrders;
      } else if (ordersResult._status === 401) {
        handleUnauthorized();
        return;
      }
      renderAll();
    }).catch(function() {
      // 静默失败，保留上次数据
    });
    
    // 管理员额外独立加载用户列表（不依赖订单加载完成）
    if (currentUser && currentUser.role === 'admin') {
      if (now - lastUsersLoadTime >= USERS_REFRESH_INTERVAL) {
        lastUsersLoadTime = now;
        loadUsersForAdmin();
      }
    }
  }

  function refreshDataNow() {
    lastRefreshTime = 0;
    lastUsersLoadTime = 0;
    loadAllData();
  }

  function loadUsersForAdmin() {
    apiRequest('POST', 'get-users', {}).then(function(usersResult) {
      if (usersResult.success && usersResult.data && usersResult.data.users && usersResult.data.users.length > 0) {
        hideDataLoadNotice();
        allUsers = usersResult.data.users;
      } else {
        // API成功但用户为空 → 使用默认兜底
        allUsers = getDefaultSafeUsers();
      }
      renderAdminUsersArea();
    }).catch(function() {
      // 网络错误 → 使用默认兜底
      allUsers = getDefaultSafeUsers();
      renderAdminUsersArea();
    });
  }

  function handleUnauthorized() {
    token = null;
    currentUser = null;
    stopAutoRefresh();
    var mainPage = document.getElementById('mainPage');
    var loginPage = document.getElementById('loginPage');
    mainPage.style.opacity = '0';
    loginPage.classList.remove('hidden');
    loginPage.style.opacity = '0';
    loginPage.offsetHeight;
    loginPage.style.opacity = '1';
    setTimeout(function() {
      mainPage.classList.add('hidden');
      mainPage.style.opacity = '';
      loginPage.style.opacity = '';
    }, 700);
    lastUsersSignature = '';
    lastUsersLoadTime = 0;
  }

  // 保存容器内所有展开的确认框 ID（用于 DOM 重建后恢复）
  function saveConfirmationStates(container) {
    var ids = [];
    var confirms = container.querySelectorAll('.confirm-action:not(.hidden)');
    for (var i = 0; i < confirms.length; i++) {
      if (confirms[i].id) ids.push(confirms[i].id);
    }
    return ids;
  }

  // DOM 重建后恢复确认框的展开状态
  function restoreConfirmationStates(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) {
        el.classList.remove('hidden');
        // 对应的操作按钮需要隐藏
        var btn = el.previousElementSibling;
        if (btn && (btn.tagName === 'BUTTON' || btn.classList.contains('btn'))) {
          btn.classList.add('hidden');
        }
      }
    }
  }

  function renderAll() {
    updateTodayStats();
    renderOrders();
  }

  function renderAdminUsersArea() {
    var usersSignature = getUsersSignature(allUsers);
    var batchRows = document.getElementById('batchOrderRows');
    if (usersSignature !== lastUsersSignature || batchRows.children.length === 0) {
      populateBatchOrderTable();
      renderUsersList();
      lastUsersSignature = usersSignature;
    } else {
      updateSelectedCount();
    }
  }

  // ========== 填充批量订餐表格 ==========
  function collectBatchOrderDrafts() {
    var drafts = {};
    var rows = document.querySelectorAll('.batch-item-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var userId = row.getAttribute('data-user-id');
      if (!userId) continue;
      if (!drafts[userId]) drafts[userId] = { checked: false, items: [] };
      var checkbox = row.querySelector('.user-checkbox');
      if (checkbox) drafts[userId].checked = checkbox.checked;
      var menuSelect = row.querySelector('.dish-select');
      var qtyInput = row.querySelector('.item-qty');
      var idx = parseInt(row.getAttribute('data-item-index')) || 0;
      drafts[userId].items[idx] = {
        dishId: menuSelect ? menuSelect.value : '',
        qty: parseInt(qtyInput ? qtyInput.value : '1') || 1
      };
    }
    return drafts;
  }

  function buildBatchItemRow(user, item, idx, checked) {
    item = item || { dishId: '', qty: 1 };
    var qty = parseInt(item.qty) || 1;
    if (qty < 1) qty = 1;
    var optsHtml = menuOptsCache;
    if (item.dishId) {
      optsHtml = optsHtml.replace('value="' + escapeHtml(item.dishId) + '"', 'value="' + escapeHtml(item.dishId) + '" selected');
    }
    var priceText = '-';
    if (item.dishId) {
      var mi = getDishById(item.dishId);
      if (mi) priceText = '¥' + ((parseFloat(mi.price) || 0) * qty);
    }
    var row = document.createElement('div');
    row.className = 'batch-order-row batch-item-row' + (idx === 0 ? ' is-first-item' : '');
    row.setAttribute('data-user-id', user.id);
    row.setAttribute('data-item-index', idx);
    var checkboxHtml = idx === 0
      ? '<input type="checkbox" class="user-checkbox" value="' + escapeHtml(user.id) + '"' + (checked ? ' checked' : '') + '>'
      : '<button type="button" class="item-remove-btn" data-action="remove-item" data-user-id="' + escapeHtml(user.id) + '" data-item-index="' + idx + '" title="删除餐食">×</button>';
    row.innerHTML =
      '<span class="col-checkbox">' + checkboxHtml + '</span>' +
      '<span class="col-name">' + (idx === 0 ? escapeHtml(user.name) : '') + '</span>' +
      '<span class="col-menu"><select class="dish-select">' + optsHtml + '</select></span>' +
      '<span class="col-price-cell">' +
        '<span class="dish-price-display">' + priceText + '</span>' +
        '<span class="item-qty-wrap">' +
          '<button type="button" class="qty-btn" data-action="qty-minus" data-user-id="' + escapeHtml(user.id) + '" data-item-index="' + idx + '">−</button>' +
          '<input type="number" class="item-qty" value="' + qty + '" min="1">' +
          '<button type="button" class="qty-btn" data-action="qty-plus" data-user-id="' + escapeHtml(user.id) + '" data-item-index="' + idx + '">+</button>' +
        '</span>' +
      '</span>';
    return row;
  }

  function populateBatchOrderTable(overrideDrafts) {
    var container = document.getElementById('batchOrderRows');
    var drafts = overrideDrafts || collectBatchOrderDrafts();
    var fragment = document.createDocumentFragment();

    // 构建菜单选项
    if (!menuOptsCache) {
      menuOptsCache = '<option value="">-- 选择 --</option>';
      for (var k = 0; k < dishItems.length; k++) {
        var mi = dishItems[k];
        menuOptsCache += '<option value="' + escapeHtml(mi.id) + '" data-price="' + mi.price + '">' + escapeHtml(mi.name) + '</option>';
      }
    }

    container.innerHTML = '';
    for (var i = 0; i < allUsers.length; i++) {
      var user = allUsers[i];
      var draft = drafts[user.id] || { checked: false, items: [{ dishId: '', qty: 1 }] };
      if (!draft.items || draft.items.length === 0) draft.items = [{ dishId: '', qty: 1 }];
      var group = document.createElement('div');
      group.className = 'batch-user-group';
      group.setAttribute('data-user-id', user.id);
      for (var j = 0; j < draft.items.length; j++) {
        group.appendChild(buildBatchItemRow(user, draft.items[j], j, draft.checked));
      }
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-ghost btn-small add-item-btn';
      addBtn.setAttribute('data-action', 'add-item');
      addBtn.setAttribute('data-user-id', user.id);
      addBtn.textContent = '+ 添加餐食';
      (function(uid, grp) {
        addBtn.onclick = function() {
          var drafts = collectBatchOrderDrafts();
          if (!drafts[uid]) drafts[uid] = { checked: false, items: [] };
          drafts[uid].items.push({ dishId: '', qty: 1 });
          var checkbox = grp.querySelector('.user-checkbox');
          if (checkbox) drafts[uid].checked = checkbox.checked;
          populateBatchOrderTable(drafts);
        };
      })(user.id, group);
      group.appendChild(addBtn);
      fragment.appendChild(group);
    }
    container.appendChild(fragment);
    updateSelectedCount();
  }

  function updateBatchRowPrice(row) {
    if (!row) return;
    var select = row.querySelector('.dish-select');
    var qtyInput = row.querySelector('.item-qty');
    var priceCell = row.querySelector('.dish-price-display');
    var qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
    if (qty < 1) qty = 1;
    if (qtyInput) qtyInput.value = qty;
    var opt = select && select.options[select.selectedIndex];
    if (priceCell && opt && opt.value) {
      priceCell.textContent = '¥' + ((parseFloat(opt.getAttribute('data-price')) || 0) * qty);
    } else if (priceCell) {
      priceCell.textContent = '-';
    }
  }

  // ========== 更新已选计数 ==========
  var selectedCountEl = document.getElementById('selectedUserCount');
  var selectAllCheckbox = document.getElementById('selectAllUsers');

  function updateSelectedCount() {
    var checkboxes = document.querySelectorAll('.user-checkbox');
    var checkedCount = 0;
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        checkedCount++;
        checkboxes[i].closest('.batch-order-row').classList.add('is-selected');
      } else {
        checkboxes[i].closest('.batch-order-row').classList.remove('is-selected');
      }
    }
    if (selectedCountEl) {
      selectedCountEl.textContent = '已选 ' + checkedCount + ' 人';
    }
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
    }
  }

  // 全选/取消全选
  document.getElementById('batchOrderTable').addEventListener('change', function(e) {
    var target = e.target;
    if (target.id === 'selectAllUsers') {
      var checkboxes = document.querySelectorAll('.user-checkbox');
      for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = target.checked;
      }
      updateSelectedCount();
    } else if (target.classList.contains('user-checkbox')) {
      updateSelectedCount();
    } else if (target.classList.contains('dish-select') || target.classList.contains('item-qty')) {
      updateBatchRowPrice(target.closest('.batch-item-row'));
    }
  });

  // 行内 select/input 变化联动
  document.getElementById('batchOrderRows').addEventListener('change', function(e) {
    var target = e.target;
    if (target.classList.contains('dish-select')) {
      var row = target.closest('.batch-order-row');
      var priceCell = row.querySelector('.dish-price-display');
      var opt = target.options[target.selectedIndex];
      if (priceCell && opt && opt.value) {
        priceCell.textContent = '¥' + opt.getAttribute('data-price');
      } else if (priceCell) {
        priceCell.textContent = '-';
      }
    }
  });

  // 点击人员行切换复选框
  document.getElementById('batchOrderRows').addEventListener('click', function(e) {
    var target = e.target;
    var row = target.closest('.batch-order-row');
    var action = target.getAttribute && target.getAttribute('data-action');
    if (!row) return;
    if (action === 'qty-minus' || action === 'qty-plus') {
      var qtyInput = row.querySelector('.item-qty');
      var qty = parseInt(qtyInput.value) || 1;
      qty = action === 'qty-minus' ? Math.max(1, qty - 1) : qty + 1;
      qtyInput.value = qty;
      updateBatchRowPrice(row);
      return;
    }
    if (action === 'remove-item') {
      var userId = target.getAttribute('data-user-id');
      var idx = parseInt(target.getAttribute('data-item-index')) || 0;
      var drafts = collectBatchOrderDrafts();
      if (drafts[userId] && drafts[userId].items) {
        drafts[userId].items.splice(idx, 1);
        if (drafts[userId].items.length === 0) drafts[userId].items = [{ dishId: '', qty: 1 }];
      }
      var currentChecked = {};
      var checkboxes = document.querySelectorAll('.user-checkbox');
      for (var ci = 0; ci < checkboxes.length; ci++) currentChecked[checkboxes[ci].value] = checkboxes[ci].checked;
      for (var uid in drafts) drafts[uid].checked = currentChecked[uid] === true;
      populateBatchOrderTable(drafts);
      return;
    }
    // 如果点击的是 select、input、checkbox 等交互元素，不处理
    if (target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'LABEL') return;
    var checkbox = row.querySelector('.user-checkbox');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      updateSelectedCount();
    }
  });

  // ========== 更新今日统计 ==========
  function updateTodayStats() {
    var today = getChinaDate();
    var totalOrders = 0;
    var paidCount = 0;
    var totalAmount = 0;
    var paidAmount = 0;
    var refundAmount = 0;

    for (var i = 0; i < allOrders.length; i++) {
      var o = allOrders[i];
      if (o.date === today) {
        totalOrders++;
        totalAmount += getOrderReceivable(o);
        if (o.paid) {
          paidCount++;
          paidAmount += getOrderActual(o);
          if (getOrderRefunded(o)) refundAmount += getOrderRefund(o);
        }
      }
    }

    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('paidOrders').textContent = paidCount;
    document.getElementById('unpaidOrders').textContent = totalOrders - paidCount;
    document.getElementById('totalAmount').textContent = formatPrice(totalAmount);
    document.getElementById('paidAmount').textContent = formatPrice(paidAmount);
    document.getElementById('unpaidAmount').textContent = formatPrice(totalAmount - paidAmount);
    var refundEl = document.getElementById('refundAmount');
    if (refundEl) refundEl.textContent = formatPrice(refundAmount);

    // 显示自取开关
    var selfpickInline = document.getElementById('selfpickInline');
    if (selfpickInline) {
      selfpickInline.style.display = currentUser && currentUser.role === 'admin' ? 'flex' : 'none';
    }
  }

  // ========== 编辑订单弹窗 ==========
  var editingOrder = null;

  function openEditModal(order) {
    editingOrder = order;
    document.getElementById('editPersonName').textContent = order.personName;
    document.getElementById('editOrderDate').textContent = formatDate(order.date) + ' ' + getDayOfWeek(order.date);
    document.getElementById('editMealType').value = order.mealType;

    // 尝试匹配菜单项
    var editMenu = document.getElementById('editDishItem');
    if (editMenu && dishItems.length > 0) {
      var matched = null;
      for (var mi = 0; mi < dishItems.length; mi++) {
        if (dishItems[mi].name === order.itemName) { matched = dishItems[mi]; break; }
      }
      if (!matched) {
        var editOrderItems = getOrderItems(order);
        if (editOrderItems.length > 0) {
          for (var mi2 = 0; mi2 < dishItems.length; mi2++) {
            if (dishItems[mi2].id === editOrderItems[0].menuId) { matched = dishItems[mi2]; break; }
          }
        }
      }
      editMenu.value = matched ? matched.id : '';
      editMenu.setAttribute('data-original-value', editMenu.value);
      updateDishPriceHint('editDishItem', 'editDishPrice');
    }

    document.getElementById('editOrderError').textContent = '';
    document.getElementById('editOrderModal').classList.remove('hidden');
  }

  function closeEditModal() {
    editingOrder = null;
    document.getElementById('editOrderModal').classList.add('hidden');
  }

  document.getElementById('editOrderForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!editingOrder) return;

    var order = editingOrder;
    var newMealType = document.getElementById('editMealType').value;
    var dishId = document.getElementById('editDishItem').value;
    var errorEl = document.getElementById('editOrderError');
    errorEl.textContent = '';

    if (!dishId) { errorEl.textContent = '请选择餐品'; return; }

    var data = {
      userId: order.userId,
      personName: order.personName,
      date: order.date,
      mealType: newMealType,
      itemType: 'menu'
    };
    var editMenu = document.getElementById('editDishItem');
    if (editMenu && dishId === editMenu.getAttribute('data-original-value') && Array.isArray(order.items) && order.items.length > 1) {
      data.items = order.items;
    } else {
      data.items = [{ menuId: dishId, quantity: 1 }];
    }

    // 如果餐别变了，传递旧餐别以便后端迁移订单
    if (newMealType !== order.mealType) {
      data.oldMealType = order.mealType;
    }

    apiRequest('POST', 'create-order', data).then(function(result) {
      if (result.success) {
        closeEditModal();
        refreshDataNow();
      } else {
        errorEl.textContent = result.message || '修改失败';
      }
    }).catch(function() {
      errorEl.textContent = '网络错误，请重试';
    });
  });

  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('cancelEditBtn2').addEventListener('click', closeEditModal);
  document.getElementById('editOrderModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
  });

  // ========== 渲染订单 ==========
  // 生成餐品汇总文本（如"盲盒×3、梅菜扣肉×1、黄焖鸡×1"）
  function getMealSummary(orders) {
    var counts = {};
    for (var i = 0; i < orders.length; i++) {
      var items = getOrderItems(orders[i]);
      for (var k = 0; k < items.length; k++) {
        var name = items[k].name || '未知';
        counts[name] = (counts[name] || 0) + (parseInt(items[k].quantity) || 1);
      }
    }
    var parts = [];
    var names = Object.keys(counts);
    for (var j = 0; j < names.length; j++) {
      parts.push(names[j] + '\u00D7' + counts[names[j]]);
    }
    return parts.join('\u3001'); // 用中文顿号分隔
  }

  // 复制文本到剪贴板
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('已复制到剪贴板', 'success');
      }).catch(function() {
        // fallback
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('已复制到剪贴板', 'success');
    } catch (e) {
      showToast('复制失败，请手动复制', 'error');
    }
    document.body.removeChild(textarea);
  }

  function renderOrders() {
    var container = document.getElementById('ordersContainer');
    var mainContent = document.getElementById('mainContent');
    var scrollTop = mainContent ? mainContent.scrollTop : 0;

    // 清理上次渲染遗留的复制用 textarea
    var staleTextareas = container.querySelectorAll('textarea[id^="copy-"]');
    for (var si = 0; si < staleTextareas.length; si++) {
      staleTextareas[si].remove();
    }

    var today = getChinaDate();

    var dateGroups = {};
    for (var i = 0; i < allOrders.length; i++) {
      var order = allOrders[i];
      if (!dateGroups[order.date]) {
        dateGroups[order.date] = [];
      }
      dateGroups[order.date].push(order);
    }

    var dates = Object.keys(dateGroups).sort().reverse();

    if (dates.length === 0) {
      var emptyConfirms = saveConfirmationStates(container);
      container.innerHTML = '<div class="empty-state">暂无订单</div>';
      restoreConfirmationStates(emptyConfirms);
      return;
    }

    var html = '';
    for (var d = 0; d < dates.length; d++) {
      var date = dates[d];
      var orders = dateGroups[date];
      var isToday = date === today;
      var isExpanded = isToday || expandedDates[date];

      var orderCount = orders.length;
      var paidCount = orders.filter(function(o) { return o.paid; }).length;
      var unpaidCount = orderCount - paidCount;
      var totalAmount = orders.reduce(function(sum, o) { return sum + getOrderReceivable(o); }, 0);

      html += '<div class="date-group" data-date="' + escapeHtml(date) + '">';
      html += '<div class="date-header' + (isToday ? ' today' : '') + '" data-date="' + escapeHtml(date) + '">';
      html += '<div class="date-title">';
      html += '<span class="collapse-indicator">▶</span>';
      html += '<span>' + formatDate(date) + ' ' + getDayOfWeek(date) + '</span>';
      if (isToday) html += '<span class="today-badge">今天</span>';
      html += '<span>共 ' + orderCount + ' 单</span>';
      html += '</div>';
      html += '<div class="date-stats">';
      html += '<span>已付: ' + paidCount + '</span>';
      html += '<span>未付: ' + unpaidCount + '</span>';
      html += '<span>总额: ' + formatPrice(totalAmount) + '</span>';
      html += '</div>';
      html += '</div>';

      html += '<div class="orders-list"' + (isExpanded ? '' : ' style="display:none;"') + '>';

      // 所有日期均按午餐/晚餐分组
      var lunchOrders = orders.filter(function(o) { return o.mealType === 'lunch'; });
      var dinnerOrders = orders.filter(function(o) { return o.mealType === 'dinner'; });

      html += renderMealGroup(lunchOrders, '午餐', 'lunch', date);
      html += renderMealGroup(dinnerOrders, '晚餐', 'dinner', date);

      // 删除当天全部订单（管理员）
      if (currentUser.role === 'admin') {
        html += '<div style="padding:8px 16px;text-align:right;">';
        html += '<button class="btn btn-danger btn-small delete-date-btn" data-date="' + escapeHtml(date) + '">删除当天全部订单</button>';
        html += '<span class="confirm-action hidden" id="confirm-delete-date-' + escapeHtml(date) + '">';
        html += ' 确认？';
        html += '<button class="btn btn-danger btn-small" data-action="confirm-delete-date" data-date="' + escapeHtml(date) + '">是</button>';
        html += '<button class="btn btn-small btn-secondary" data-action="cancel-delete-date" data-date="' + escapeHtml(date) + '">否</button>';
        html += '</span>';
        html += '</div>';
      }

      html += '</div>';
      html += '</div>';
    }

    // 保存确认框状态，DOM 重建后恢复
    var confirmIds = saveConfirmationStates(container);
    container.innerHTML = html;
    restoreConfirmationStates(confirmIds);

    // 恢复滚动位置
    if (mainContent) {
      mainContent.scrollTop = scrollTop;
    }
  }

  // 渲染一个餐别组（午餐/晚餐），带汇总和复制
  function renderMealGroup(orders, mealLabel, mealType, date) {
    if (orders.length === 0) {
      return '<div class="meal-group meal-group--' + mealType + '">' +
        '<div class="meal-group__header">' +
        '<span class="meal-tag ' + mealType + '">' + mealLabel + '</span>' +
        '<span class="meal-group__count">暂无订单</span>' +
        '</div></div>';
    }

    var summaryText = getMealSummary(orders);
    var totalPrice = orders.reduce(function(sum, o) {
      return sum + getOrderReceivable(o);
    }, 0);
    var paidAll = orders.every(function(o) { return o.paid; });
    var paidNone = orders.every(function(o) { return !o.paid; });
    var paidSome = !paidAll && !paidNone;

    var paidBadge = '';
    if (paidAll) paidBadge = '<span class="order-paid-badge paid paid-dot">全部已付</span>';
    else if (paidSome) paidBadge = '<span class="order-paid-badge unpaid">部分已付</span>';
    else paidBadge = '<span class="order-paid-badge unpaid">全部未付</span>';

    var copyId = 'copy-' + date + '-' + mealType;

    var html = '<div class="meal-group meal-group--' + mealType + '">';
    html += '<div class="meal-group__header">';
    html += '<div class="meal-group__info">';
    html += '<span class="meal-tag ' + mealType + '">' + mealLabel + '</span>';
    html += '<span class="meal-group__count">共 ' + orders.length + ' 单</span>';
    html += paidBadge;
    html += '<span class="meal-group__total">' + formatPrice(totalPrice) + '</span>';
    html += '</div>';
    html += '<div class="meal-group__summary">';
    html += '<span class="meal-summary-text">' + escapeHtml(summaryText) + '</span>';
    html += '<button class="btn btn-ghost btn-small copy-summary-btn" data-copy-id="' + copyId + '" title="复制汇总">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    html += ' 复制</button>';
    html += '</div>';
    html += '<textarea id="' + copyId + '" style="position:absolute;opacity:0;pointer-events:none" readonly>' + escapeHtml(summaryText) + '</textarea>';
    html += '</div>';

    // 订单卡片
    html += '<div class="meal-group__orders">';
    html += renderOrderCards(orders);
    html += '</div>';

    html += '</div>';
    return html;
  }

  // 渲染订单卡片列表
  function renderOrderCards(orders) {
    var html = '';
    for (var j = 0; j < orders.length; j++) {
      var o = orders[j];
      var isOwner = currentUser && (currentUser.id === o.userId);

      html += '<div class="order-card">';
      html += '<span class="order-user">' + escapeHtml(o.personName) + '</span>';
      html += '<span class="order-detail">';
      var orderItems = getOrderItems(o);
      var itemTexts = [];
      for (var oi = 0; oi < orderItems.length; oi++) {
        var oiName = orderItems[oi].name || '未知';
        var oiQty = parseInt(orderItems[oi].quantity) || 1;
        itemTexts.push(escapeHtml(oiName) + (oiQty > 1 ? ' × ' + oiQty : ''));
      }
      html += '<span class="item-name">' + itemTexts.join('、') + '</span>';
      html += '</span>';
      var receivable = getOrderReceivable(o);
      var discount = getOrderDiscount(o);
      var actual = getOrderActual(o);
      var refund = getOrderRefund(o);
      var refunded = getOrderRefunded(o);
      html += '<span class="order-money">';
      html += '<span class="money-item money-price"><span class="money-label">价格</span><span class="money-value">' + formatPrice(parseFloat(o.price) || 0) + '</span></span>';
      html += '<span class="money-item money-receivable"><span class="money-label">应收</span><span class="money-value">' + formatPrice(receivable) + '</span></span>';
      html += '<span class="money-item money-discount' + (discount > 0 ? ' has-value' : '') + '"><span class="money-label">减免</span><span class="money-value">' + (discount > 0 ? '-' : '') + formatPrice(discount) + '</span></span>';
      html += '<span class="money-item money-actual"><span class="money-label">实收</span><span class="money-value">' + formatPrice(actual) + '</span></span>';
      html += '<span class="money-item money-refund' + (refunded ? ' refunded' : '') + '"><span class="money-label">退款</span><span class="money-value">' + formatPrice(refund) + '</span></span>';
      html += '</span>';

      if (refunded) {
        html += '<span class="order-paid-badge refunded">已退款</span>';
      } else if (o.paid) {
        html += '<span class="order-paid-badge paid paid-dot">已付</span>';
      } else {
        html += '<span class="order-paid-badge unpaid">未付</span>';
      }

      html += '<span class="order-actions">';

      // 修改按钮
      if ((isOwner && !settings.orderLocked) || currentUser.role === 'admin') {
        html += '<button class="btn btn-ghost btn-small edit-order-btn" data-order-id="' + escapeHtml(o.id) + '" title="修改餐品">修改</button>';
      }

      // 管理员 - 付款操作
      if (currentUser.role === 'admin') {
        if (!o.paid) {
          html += '<button class="btn btn-ghost btn-small" data-action="toggle-payment" data-order-id="' + escapeHtml(o.id) + '">标记已付</button>';
          html += '<span class="confirm-action hidden" id="confirm-pay-' + escapeHtml(o.id) + '">';
          html += ' 确认已付？';
          html += '<button class="btn btn-small btn-primary" data-action="confirm-pay" data-order-id="' + escapeHtml(o.id) + '">是</button>';
          html += '<button class="btn btn-small btn-secondary" data-action="cancel-pay" data-order-id="' + escapeHtml(o.id) + '">否</button>';
          html += '</span>';
        } else {
          html += '<button class="btn btn-ghost btn-small" data-action="toggle-payment" data-order-id="' + escapeHtml(o.id) + '">取消已付</button>';
          html += '<span class="confirm-action hidden" id="confirm-pay-' + escapeHtml(o.id) + '">';
          html += ' 取消已付？';
          html += '<button class="btn btn-small btn-primary" data-action="confirm-unpay" data-order-id="' + escapeHtml(o.id) + '">是</button>';
          html += '<button class="btn btn-small btn-secondary" data-action="cancel-pay" data-order-id="' + escapeHtml(o.id) + '">否</button>';
          html += '</span>';
        }
      }

      if (currentUser.role === 'admin' && o.paid && !refunded && discount > 0) {
        html += '<button class="btn btn-ghost btn-small" data-action="toggle-refund" data-order-id="' + escapeHtml(o.id) + '">退款</button>';
        html += '<span class="confirm-action hidden" id="confirm-refund-' + escapeHtml(o.id) + '">';
        html += ' 确认退款？';
        html += '<button class="btn btn-small btn-primary" data-action="confirm-refund" data-order-id="' + escapeHtml(o.id) + '">是</button>';
        html += '<button class="btn btn-small btn-secondary" data-action="cancel-refund" data-order-id="' + escapeHtml(o.id) + '">否</button>';
        html += '</span>';
      }

      // 删除按钮
      if (currentUser.role === 'admin' || (isOwner && !settings.orderLocked)) {
        html += '<button class="btn btn-danger btn-small delete-order-btn" data-order-id="' + escapeHtml(o.id) + '">删除</button>';
        html += '<span class="confirm-action hidden" id="confirm-del-' + escapeHtml(o.id) + '">';
        html += ' 确认？';
        html += '<button class="btn btn-danger btn-small" data-action="confirm-delete" data-order-id="' + escapeHtml(o.id) + '">是</button>';
        html += '<button class="btn btn-small btn-secondary" data-action="cancel-delete" data-order-id="' + escapeHtml(o.id) + '">否</button>';
        html += '</span>';
      }

      html += '</span>';
      html += '</div>';
    }
    return html;
  }

  // ========== 全局事件委托 ==========
  document.getElementById('ordersContainer').addEventListener('click', function(e) {
    var target = e.target;

    // 日期展开/折叠
    var dateHeader = target.classList.contains('date-header') ? target : target.closest('.date-header');
    if (dateHeader) {
      var list = dateHeader.nextElementSibling;
      while (list && !list.classList.contains('orders-list')) {
        list = list.nextElementSibling;
      }
      if (list) {
        var date = dateHeader.getAttribute('data-date');
        var isNowVisible = list.style.display !== 'none';
        expandedDates[date] = !isNowVisible;
        list.style.display = isNowVisible ? 'none' : '';
        dateHeader.classList.toggle('collapsed', isNowVisible);
      }
      return;
    }

    // 修改订单
    if (target.classList.contains('edit-order-btn')) {
      var orderId = target.getAttribute('data-order-id');
      for (var i = 0; i < allOrders.length; i++) {
        if (allOrders[i].id === orderId) {
          openEditModal(allOrders[i]);
          break;
        }
      }
      return;
    }

    // 付款状态切换
    if (target.getAttribute('data-action') === 'toggle-payment') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-pay-' + orderId);
      target.classList.add('hidden');
      confirmEl.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-pay') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-pay-' + orderId);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'update-payment', { orderId: orderId, paid: true })
          .then(function(result) { if (result.success) { refreshDataNow(); return true; } else { showToast(result.message || '操作失败', 'error'); return false; } });
      }, '已标记为已付');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-unpay') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-pay-' + orderId);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'update-payment', { orderId: orderId, paid: false })
          .then(function(result) { if (result.success) { refreshDataNow(); return true; } else { showToast(result.message || '操作失败', 'error'); return false; } });
      }, '已取消已付');
      return;
    }

    if (target.getAttribute('data-action') === 'cancel-pay') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-pay-' + orderId);
      var badge = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      badge.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'toggle-refund') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-refund-' + orderId);
      target.classList.add('hidden');
      confirmEl.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-refund') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-refund-' + orderId);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'refund-order', { orderId: orderId })
          .then(function(result) {
            if (result.success) {
              refreshDataNow();
              return true;
            } else {
              showToast(result.message || '退款失败', 'error');
              return false;
            }
          });
      }, '订单已退款');
      return;
    }

    if (target.getAttribute('data-action') === 'cancel-refund') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-refund-' + orderId);
      var btn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      btn.classList.remove('hidden');
      return;
    }

    // 删除订单
    if (target.classList.contains('delete-order-btn')) {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-del-' + orderId);
      target.classList.add('hidden');
      confirmEl.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-delete') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-del-' + orderId);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'delete-order', { orderId: orderId })
          .then(function(result) { if (result.success) { refreshDataNow(); return true; } else { showToast(result.message || '删除失败', 'error'); return false; } });
      }, '订单已删除');
      return;
    }

    if (target.getAttribute('data-action') === 'cancel-delete') {
      var orderId = target.getAttribute('data-order-id');
      var confirmEl = document.getElementById('confirm-del-' + orderId);
      var btn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      btn.classList.remove('hidden');
      return;
    }

    // 删除当天全部订单
    if (target.classList.contains('delete-date-btn')) {
      var date = target.getAttribute('data-date');
      var confirmEl = document.getElementById('confirm-delete-date-' + date);
      target.classList.add('hidden');
      confirmEl.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-delete-date') {
      var date = target.getAttribute('data-date');
      var confirmEl = document.getElementById('confirm-delete-date-' + date);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'delete-orders-by-date', { date: date })
          .then(function(result) { if (result.success) { refreshDataNow(); return true; } else { showToast(result.message || '删除失败', 'error'); return false; } });
      }, '当天订单已删除');
      return;
    }

    if (target.getAttribute('data-action') === 'cancel-delete-date') {
      var date = target.getAttribute('data-date');
      var confirmEl = document.getElementById('confirm-delete-date-' + date);
      var btn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      btn.classList.remove('hidden');
      return;
    }

    // 复制餐品汇总
    if (target.classList.contains('copy-summary-btn') || (target.closest && target.closest('.copy-summary-btn'))) {
      var btn = target.classList.contains('copy-summary-btn') ? target : target.closest('.copy-summary-btn');
      var copyId = btn.getAttribute('data-copy-id');
      var textarea = document.getElementById(copyId);
      var text = textarea ? textarea.value : '';
      if (text) {
        copyToClipboard(text);
        // 按钮短暂反馈
        btn.classList.add('copied');
        var origHTML = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
        setTimeout(function() {
          btn.innerHTML = origHTML;
          btn.classList.remove('copied');
        }, 1500);
      }
      return;
    }
  });

  // ========== 提交订单 ==========
  document.getElementById('orderForm').addEventListener('submit', function(e) {
    e.preventDefault();

    // 防止重复提交
    var submitBtn = this.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;
    
    var date = document.getElementById('orderDate').value;
    var mealType = document.getElementById('mealType').value;

    if (currentUser.role === 'admin') {
      var rows = document.querySelectorAll('.batch-order-row');
      var checkedRows = [];
      for (var i = 0; i < rows.length; i++) {
        var checkbox = rows[i].querySelector('.user-checkbox');
        if (checkbox && checkbox.checked && checkedRows.indexOf(checkbox.value) === -1) {
          checkedRows.push(checkbox.value);
        }
      }

      if (checkedRows.length === 0) {
        showToast('请至少选择一个订餐人员', 'info');
        return;
      }

      // 二次确认：首次点击显示确认状态，再次点击执行提交
      var statusEl = document.getElementById('batchSubmitStatus');
      if (submitBtn.textContent !== '确认提交') {
        var mealLabel = mealType === 'lunch' ? '午餐' : '晚餐';
        submitBtn.textContent = '确认提交';
        submitBtn.classList.add('btn-danger');
        statusEl.classList.remove('hidden');
        statusEl.className = 'batch-submit-status';
        statusEl.textContent = '即将为 ' + checkedRows.length + ' 人提交 ' + mealLabel + ' 订单，请再次点击确认';
        statusEl.classList.add('confirm-prompt');
        // 5 秒后自动取消确认状态
        setTimeout(function() {
          if (submitBtn.textContent === '确认提交') {
            submitBtn.textContent = '提交订单';
            submitBtn.classList.remove('btn-danger');
            statusEl.classList.add('hidden');
            statusEl.classList.remove('confirm-prompt');
          }
        }, 5000);
        return;
      }

      // 实际提交：重置按钮状态
      submitBtn.classList.remove('btn-danger');
      isBatchSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中...';
      
      statusEl.className = 'batch-submit-status';
      statusEl.textContent = '正在提交 0/' + checkedRows.length + '...';

      var completedCount = 0;
      var failedCount = 0;
      function submitNext() {
        if (completedCount >= checkedRows.length) {
          if (failedCount > 0) {
            statusEl.textContent = '完成 ' + (checkedRows.length - failedCount) + '/' + checkedRows.length + '，失败 ' + failedCount + ' 单';
            statusEl.classList.add('has-error');
          } else {
            statusEl.textContent = '全部提交完成！';
          }
          isBatchSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = '提交订单';
          // 强制刷新订单数据（清除间隔限制）
          refreshDataNow();
          setTimeout(function() { statusEl.classList.add('hidden'); }, 3000);
          return;
        }
        var userId = checkedRows[completedCount];
        var userRows = document.querySelectorAll('.batch-item-row[data-user-id="' + userId + '"]');
        var items = [];
        for (var ri = 0; ri < userRows.length; ri++) {
          var menuSelect = userRows[ri].querySelector('.dish-select');
          var qtyInput = userRows[ri].querySelector('.item-qty');
          var dishId = menuSelect ? menuSelect.value : '';
          var qty = parseInt(qtyInput ? qtyInput.value : '1') || 1;
          if (dishId) items.push({ menuId: dishId, quantity: qty });
        }
        if (items.length === 0) { failedCount++; completedCount++; submitNext(); return; }
        var data = {
          userId: userId,
          date: date,
          mealType: mealType,
          itemType: 'menu',
          items: items
        };
        
        apiRequest('POST', 'create-order', data).then(function(result) {
          completedCount++;
          if (result && result.success) {
            statusEl.textContent = '正在提交 ' + completedCount + '/' + checkedRows.length + '...';
          } else {
            failedCount++;
            statusEl.textContent = '第 ' + completedCount + ' 单失败' + (result && result.message ? ': ' + result.message : '') + '，继续...';
          }
          submitNext();
        }).catch(function(err) {
          completedCount++;
          failedCount++;
          statusEl.textContent = '第 ' + completedCount + ' 单网络错误，继续...';
          submitNext();
        });
      }
      submitNext();
    } else {
      // 普通用户单人提交
      var dishId = document.getElementById('singleDishItem').value;
      if (!dishId) { showToast('请选择餐品', 'info'); return; }
      var qty = parseInt(document.getElementById('singleQty').value) || 1;
      if (qty < 1) qty = 1;
      var data = {
        date: date,
        mealType: mealType,
        itemType: 'menu',
        items: [{ menuId: dishId, quantity: qty }]
      };
      

      // 禁用提交按钮，防止重复提交
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中...';

      apiRequest('POST', 'create-order', data).then(function(result) {
        submitBtn.disabled = false;
        submitBtn.textContent = '提交订单';
        if (result.success) {
          refreshDataNow();
          document.getElementById('singleDishItem').value = '';
          document.getElementById('singleDishPrice').textContent = '';
        } else {
          showToast(result.message || '提交失败', 'error');
        }
      }).catch(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = '提交订单';
        showToast('网络错误，请重试', 'error');
      });
    }
  });

  // ========== 修改密码 ==========
  document.getElementById('changePasswordBtn').addEventListener('click', function() {
    document.getElementById('passwordModal').classList.remove('hidden');
    document.getElementById('passwordForm').reset();
    document.getElementById('passwordError').textContent = '';
  });

  document.getElementById('cancelPasswordBtn').addEventListener('click', function() {
    document.getElementById('passwordModal').classList.add('hidden');
  });

  document.getElementById('cancelPasswordBtn2').addEventListener('click', function() {
    document.getElementById('passwordModal').classList.add('hidden');
  });

  document.getElementById('passwordModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });

  document.getElementById('passwordForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var oldPassword = document.getElementById('oldPassword').value;
    var newPassword = document.getElementById('newPassword').value;
    var confirmPassword = document.getElementById('confirmPassword').value;
    var errorEl = document.getElementById('passwordError');
    errorEl.textContent = '';

    if (newPassword !== confirmPassword) { errorEl.textContent = '两次输入的密码不一致'; return; }
    if (newPassword.length < 6) { errorEl.textContent = '新密码长度不能少于 6 位'; return; }

    apiRequest('POST', 'change-password', { oldPassword: oldPassword, newPassword: newPassword })
      .then(function(result) {
        if (result.success) {
          document.getElementById('passwordModal').classList.add('hidden');
          showToast(result.message || '密码修改成功，请重新登录', 'success');
          token = null;
          currentUser = null;
          stopAutoRefresh();
          clearLoginInfo();
          document.getElementById('mainPage').classList.add('hidden');
          document.getElementById('loginPage').classList.remove('hidden');
          document.getElementById('password').value = '';
        } else {
          errorEl.textContent = result.message || '修改失败';
        }
      });
  });

  // ========== 管理员 - 添加用户 ==========
  document.getElementById('addUserForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var username = document.getElementById('newUsername').value.trim();
    var role = document.getElementById('newUserRole').value;

    if (!username) { showToast('请输入用户名', 'info'); return; }

    apiRequest('POST', 'create-user', { username: username, role: role })
      .then(function(result) {
        if (result.success) {
          document.getElementById('newUsername').value = '';
          showToast(result.message || '用户添加成功', 'success');
          refreshDataNow();
        } else {
          showToast(result.message || '添加失败', 'error');
        }
      });
  });

  // ========== 管理员 - 用户列表 ==========
  function renderUsersList() {
    var container = document.getElementById('usersList');
    if (!container) return;
    var html = '';
    for (var i = 0; i < allUsers.length; i++) {
      var user = allUsers[i];
      html += '<div class="user-card">';
      html += '<div>';
      html += '<span class="user-name">' + escapeHtml(user.name) + '</span>';
      html += '<span class="user-role-tag ' + user.role + '">' + (user.role === 'admin' ? '管理员' : '普通用户') + '</span>';
      html += '</div>';
      html += '<span class="user-actions">';
      html += '<button class="btn btn-ghost btn-small reset-pwd-btn" data-user-id="' + escapeHtml(user.id) + '">重置密码</button>';
      html += '<span class="confirm-action hidden" id="confirm-reset-' + escapeHtml(user.id) + '">';
      html += ' 重置为 123456？';
      html += '<button class="btn btn-small btn-primary" data-action="confirm-reset" data-user-id="' + escapeHtml(user.id) + '">是</button>';
      html += '<button class="btn btn-small btn-secondary" data-action="cancel-reset" data-user-id="' + escapeHtml(user.id) + '">否</button>';
      html += '</span>';
      html += '<button class="btn btn-danger btn-small delete-user-btn" data-user-id="' + escapeHtml(user.id) + '">删除</button>';
      html += '<span class="confirm-action hidden" id="confirm-del-user-' + escapeHtml(user.id) + '">';
      html += ' 确认删除？';
      html += '<button class="btn btn-danger btn-small" data-action="confirm-delete-user" data-user-id="' + escapeHtml(user.id) + '">是</button>';
      html += '<button class="btn btn-small btn-secondary" data-action="cancel-delete-user" data-user-id="' + escapeHtml(user.id) + '">否</button>';
      html += '</span>';
      html += '</span>';
      html += '</div>';
    }
    var userConfirmIds = saveConfirmationStates(container);
    container.innerHTML = html;
    restoreConfirmationStates(userConfirmIds);
  }

  // 用户管理事件委托
  document.getElementById('usersList').addEventListener('click', function(e) {
    var target = e.target;

    if (target.classList.contains('reset-pwd-btn')) {
      var userId = target.getAttribute('data-user-id');
      var confirmEl = document.getElementById('confirm-reset-' + userId);
      target.classList.add('hidden');
      confirmEl.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-reset') {
      var userId = target.getAttribute('data-user-id');
      var confirmEl = document.getElementById('confirm-reset-' + userId);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'reset-password', { userId: userId })
          .then(function(result) {
            if (result.success) { refreshDataNow(); return true; }
            else { showToast(result.message || '重置失败', 'error'); return false; }
          });
      }, '密码已重置为 123456');
      return;
    }

    if (target.getAttribute('data-action') === 'cancel-reset') {
      var userId = target.getAttribute('data-user-id');
      var confirmEl = document.getElementById('confirm-reset-' + userId);
      var btn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      btn.classList.remove('hidden');
      return;
    }

    if (target.classList.contains('delete-user-btn')) {
      var userId = target.getAttribute('data-user-id');
      var confirmEl = document.getElementById('confirm-del-user-' + userId);
      target.classList.add('hidden');
      confirmEl.classList.remove('hidden');
      return;
    }

    if (target.getAttribute('data-action') === 'confirm-delete-user') {
      var userId = target.getAttribute('data-user-id');
      var confirmEl = document.getElementById('confirm-del-user-' + userId);
      var actionBtn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      if (actionBtn) actionBtn.classList.remove('hidden');
      withConfirmFeedback(target, function() {
        return apiRequest('POST', 'delete-user', { userId: userId })
          .then(function(result) { if (result.success) { refreshDataNow(); return true; } else { showToast(result.message || '删除失败', 'error'); return false; } });
      }, '用户已删除');
      return;
    }

    if (target.getAttribute('data-action') === 'cancel-delete-user') {
      var userId = target.getAttribute('data-user-id');
      var confirmEl = document.getElementById('confirm-del-user-' + userId);
      var btn = confirmEl.previousElementSibling;
      confirmEl.classList.add('hidden');
      btn.classList.remove('hidden');
      return;
    }
  });

  // ========== 侧边栏 ==========
  document.getElementById('sidebarToggle').addEventListener('click', function() {
    var sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
  });

  // 点击侧边栏外部关闭（移动端）
  document.addEventListener('click', function(e) {
    var sidebar = document.getElementById('sidebar');
    var toggle = document.getElementById('sidebarToggle');
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });

  // 侧边栏导航滚动到对应区域
  var sidebarLinks = document.querySelectorAll('.sidebar-link');
  for (var i = 0; i < sidebarLinks.length; i++) {
    (function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var section = link.getAttribute('data-section');
        var el = document.getElementById('section-' + section);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // 切换到报表时自动加载
        if (section === 'report' && typeof loadReport === 'function') {
          loadReport(currentReportType);
        }
        // 高亮激活
        for (var j = 0; j < sidebarLinks.length; j++) {
          sidebarLinks[j].classList.remove('active');
        }
        link.classList.add('active');
        // 移动端关闭侧边栏
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('open');
        }
      });
    })(sidebarLinks[i]);
  }

  // 滚动时高亮对应侧边栏链接
  function updateActiveSidebarLink() {
    if (window.innerWidth <= 768) return;
    var sections = ['section-order', 'section-stats', 'section-orders', 'section-admin'];
    sections.push('section-dish');
    sections.push('section-report');
    var scrollPos = window.scrollY + 100;

    for (var i = sections.length - 1; i >= 0; i--) {
      var el = document.getElementById(sections[i]);
      if (el && el.offsetTop <= scrollPos && !el.classList.contains('hidden')) {
        var section = sections[i].replace('section-', '');
        for (var j = 0; j < sidebarLinks.length; j++) {
          sidebarLinks[j].classList.remove('active');
          if (sidebarLinks[j].getAttribute('data-section') === section) {
            sidebarLinks[j].classList.add('active');
          }
        }
        break;
      }
    }
  }

  window.addEventListener('scroll', updateActiveSidebarLink);

  // ========== 锁定开关 ==========
  // 盲盒价格修改
  document.getElementById('blindLunchPrice').addEventListener('change', function() {
    var newPrice = parseFloat(this.value);
    if (isNaN(newPrice) || newPrice < 0.5 || newPrice > 200) {
      this.value = blindLunchPrice;
      showToast('价格需在 0.5 ~ 200 之间', 'error');
      return;
    }
    updateSetting('settings_blind_lunch_price', newPrice).then(function(result) {
      if (result.success) {
        blindLunchPrice = newPrice;
        updateSettingsUI();
        populateBatchOrderTable();
      } else {
        document.getElementById('blindLunchPrice').value = blindLunchPrice;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      document.getElementById('blindLunchPrice').value = blindLunchPrice;
      showToast('网络错误，设置未保存', 'error');
    });
  });

  document.getElementById('blindDinnerPrice').addEventListener('change', function() {
    var newPrice = parseFloat(this.value);
    if (isNaN(newPrice) || newPrice < 0.5 || newPrice > 200) {
      this.value = blindDinnerPrice;
      showToast('价格需在 0.5 ~ 200 之间', 'error');
      return;
    }
    updateSetting('settings_blind_dinner_price', newPrice).then(function(result) {
      if (result.success) {
        blindDinnerPrice = newPrice;
        updateSettingsUI();
        populateBatchOrderTable();
      } else {
        document.getElementById('blindDinnerPrice').value = blindDinnerPrice;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      document.getElementById('blindDinnerPrice').value = blindDinnerPrice;
      showToast('网络错误，设置未保存', 'error');
    });
  });

  document.getElementById('lockToggle').addEventListener('change', function() {
    var newValue = this.checked;
    updateSetting('settings_order_locked', newValue).then(function(result) {
      if (result.success) {
        settings.orderLocked = newValue;
        renderOrders();
      } else {
        document.getElementById('lockToggle').checked = !newValue;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      document.getElementById('lockToggle').checked = !newValue;
      showToast('网络错误，设置未保存', 'error');
    });
  });

  document.getElementById('lunchLockToggle').addEventListener('change', function() {
    var newValue = this.checked;
    updateSetting('settings_lunch_locked', newValue).then(function(result) {
      if (result.success) {
        settings.lunchLocked = newValue;
        showToast(newValue ? '午餐点餐已禁止' : '午餐点餐已开放', 'success');
      } else {
        document.getElementById('lunchLockToggle').checked = !newValue;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      document.getElementById('lunchLockToggle').checked = !newValue;
      showToast('网络错误，设置未保存', 'error');
    });
  });

  document.getElementById('dinnerLockToggle').addEventListener('change', function() {
    var newValue = this.checked;
    updateSetting('settings_dinner_locked', newValue).then(function(result) {
      if (result.success) {
        settings.dinnerLocked = newValue;
        showToast(newValue ? '晚餐点餐已禁止' : '晚餐点餐已开放', 'success');
      } else {
        document.getElementById('dinnerLockToggle').checked = !newValue;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      document.getElementById('dinnerLockToggle').checked = !newValue;
      showToast('网络错误，设置未保存', 'error');
    });
  });

  // ========== 自动刷新 ==========
  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(function() {
      if (!isBatchSubmitting && !document.hidden) loadAllData();
    }, ORDERS_REFRESH_INTERVAL);

    if (!focusRefreshBound) {
      window.addEventListener('focus', function() {
        if (token && currentUser && !isBatchSubmitting) loadAllData();
      });
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden && token && currentUser && !isBatchSubmitting) loadAllData();
      });
      focusRefreshBound = true;
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // ========== 周月报统计 ==========
  var currentReportType = 'week';

  function loadReport(type) {
    type = type || currentReportType;
    currentReportType = type;
    var fromEl = document.getElementById('reportDateFrom');
    var toEl = document.getElementById('reportDateTo');
    var data = { type: type };
    if (fromEl && fromEl.value && toEl && toEl.value) {
      data.from = fromEl.value;
      data.to = toEl.value;
    }
    var reportContainer = document.getElementById('reportContainer');
    if (reportContainer) reportContainer.innerHTML = '<div class="empty-state">加载中...</div>';
    apiRequest('POST', 'get-report', data).then(function(result) {
      if (result.success) {
        renderReport(result.data);
      } else {
        if (reportContainer) reportContainer.innerHTML = '<div class="empty-state">加载失败</div>';
      }
    }).catch(function() {
      if (reportContainer) reportContainer.innerHTML = '<div class="empty-state">网络错误</div>';
    });
  }

  function renderReport(data) {
    var container = document.getElementById('reportContainer');
    if (!container) return;
    var s = data.summary;
    var rangeText = data.range.from + ' ~ ' + data.range.to;
    // 更新日期输入框
    var fromEl = document.getElementById('reportDateFrom');
    var toEl = document.getElementById('reportDateTo');
    if (fromEl && toEl && data.type !== 'custom') {
      fromEl.value = data.range.from;
      toEl.value = data.range.to;
    }

    // 更新 tab 激活状态
    var weekTab = document.getElementById('reportTabWeek');
    var monthTab = document.getElementById('reportTabMonth');
    if (weekTab && monthTab) {
      weekTab.classList.toggle('active', data.type === 'week' || data.type === 'custom');
      monthTab.classList.toggle('active', data.type === 'month');
    }

    var html = '';
    html += '<div class="report-range">' + rangeText + '</div>';

    // 汇总卡片
    html += '<div class="report-cards">';
    html += '<div class="report-card"><div class="report-card-value">' + s.totalOrders + '</div><div class="report-card-label">订单总数</div></div>';
    html += '<div class="report-card"><div class="report-card-value">' + s.lunchCount + ' / ' + s.dinnerCount + '</div><div class="report-card-label">午餐 / 晚餐</div></div>';
    html += '<div class="report-card"><div class="report-card-value">' + formatPrice(s.totalAmount) + '</div><div class="report-card-label">总金额</div></div>';
    html += '<div class="report-card report-card--success"><div class="report-card-value">' + formatPrice(s.paidAmount) + '</div><div class="report-card-label">已付金额（' + s.paidCount + '单）</div></div>';
    html += '<div class="report-card report-card--danger"><div class="report-card-value">' + formatPrice(s.unpaidAmount) + '</div><div class="report-card-label">未付金额（' + s.unpaidCount + '单）</div></div>';
    html += '</div>';

    // 人均明细表
    if (data.perPerson.length > 0) {
      html += '<div class="report-table-wrap"><table class="report-table"><thead><tr>';
      html += '<th>姓名</th><th>订单数</th><th>已付</th><th>金额</th>';
      html += '</tr></thead><tbody>';
      for (var i = 0; i < data.perPerson.length; i++) {
        var p = data.perPerson[i];
        html += '<tr>';
        html += '<td>' + escapeHtml(p.name) + '</td>';
        html += '<td>' + p.count + '</td>';
        html += '<td>' + p.paid + '/' + p.count + '</td>';
        html += '<td>' + formatPrice(p.amount) + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    } else {
      html += '<div class="empty-state">暂无数据</div>';
    }

    container.innerHTML = html;
  }

  document.getElementById('reportTabWeek').addEventListener('click', function() {
    loadReport('week');
  });
  document.getElementById('reportTabMonth').addEventListener('click', function() { loadReport('month'); });

  // 报表日期导航
  document.getElementById('reportPrev').addEventListener('click', function() {
    var fromEl = document.getElementById('reportDateFrom');
    if (!fromEl || !fromEl.value) { document.getElementById('reportTabWeek').click(); return; }
    var d = new Date(fromEl.value + 'T00:00:00+08:00');
    if (currentReportType === 'month') {
      d.setUTCMonth(d.getUTCMonth() - 1);
    } else {
      d.setUTCDate(d.getUTCDate() - 7);
    }
    fromEl.value = d.toISOString().split('T')[0];
    var toD = new Date(d);
    if (currentReportType === 'month') {
      toD.setUTCMonth(toD.getUTCMonth() + 1);
      toD.setUTCDate(0);
    } else {
      toD.setUTCDate(toD.getUTCDate() + 6);
    }
    document.getElementById('reportDateTo').value = toD.toISOString().split('T')[0];
    updateReportQuery();
  });

  document.getElementById('reportNext').addEventListener('click', function() {
    var fromEl = document.getElementById('reportDateFrom');
    if (!fromEl || !fromEl.value) { document.getElementById('reportTabWeek').click(); return; }
    var d = new Date(fromEl.value + 'T00:00:00+08:00');
    if (currentReportType === 'month') {
      d.setUTCMonth(d.getUTCMonth() + 1);
    } else {
      d.setUTCDate(d.getUTCDate() + 7);
    }
    fromEl.value = d.toISOString().split('T')[0];
    var toD = new Date(d);
    if (currentReportType === 'month') {
      toD.setUTCMonth(toD.getUTCMonth() + 1);
      toD.setUTCDate(0);
    } else {
      toD.setUTCDate(toD.getUTCDate() + 6);
    }
    document.getElementById('reportDateTo').value = toD.toISOString().split('T')[0];
    updateReportQuery();
  });

  document.getElementById('reportQueryBtn').addEventListener('click', function() {
    updateReportQuery();
  });

  function updateReportQuery() {
    var from = document.getElementById('reportDateFrom').value;
    var to = document.getElementById('reportDateTo').value;
    if (from && to) {
      loadReport('custom');
    }
  }

  // ========== 菜单管理渲染 ==========
  function renderDishManager() {
    var container = document.getElementById('dishList');
    if (!container) return;
    var html = '';
    for (var i = 0; i < dishItems.length; i++) {
      var m = dishItems[i];
      html += '<div class="dish-item-row" data-id="' + escapeHtml(m.id) + '">';
      html += '<span class="dish-item-drag">☰</span>';
      html += '<input type="text" class="dish-item-name" value="' + escapeHtml(m.name) + '" placeholder="名称">';
      html += '<span class="dish-price-wrap"><span class="dish-yen">¥</span><input type="number" class="dish-item-price" value="' + m.price + '" step="1" min="0"></span>';
      html += '<label class="dish-item-weight-label">权重 <input type="number" class="dish-item-weight" value="' + (m.weight || 0) + '" step="1" min="0"></label>';
      html += '<button class="btn btn-danger btn-small dish-item-del" data-id="' + escapeHtml(m.id) + '">×</button>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function getDishManagerSignature() {
    var rows = document.querySelectorAll('.dish-item-row');
    var parts = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var nameInput = row.querySelector('.dish-item-name');
      var priceInput = row.querySelector('.dish-item-price');
      var weightInput = row.querySelector('.dish-item-weight');
      parts.push([
        row.getAttribute('data-id'),
        nameInput ? (nameInput.value.trim() || '未命名') : '',
        priceInput ? (parseInt(priceInput.value) || 0) : '',
        weightInput ? (parseInt(weightInput.value) || 0) : ''
      ].join('|'));
    }
    return parts.join('~');
  }

  document.getElementById('addDishItemBtn').addEventListener('click', function() {
    var newId = 'm' + Date.now();
    var newWeight = dishItems.length > 0 ? Math.max.apply(null, dishItems.map(function(m) { return m.weight || 0; })) + 1 : 100;
    dishItems.push({ id: newId, name: '新餐品', price: 15, weight: newWeight });
    menuOptsCache = '';
    renderDishManager();
    populateDishDropdowns();
    populateBatchOrderTable();
  });

  function saveDishManager() {
    var rows = document.querySelectorAll('.dish-item-row');
    if (rows.length === 0) { showToast('无菜品数据，请先添加', 'error'); return; }
    var updated = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = row.getAttribute('data-id');
      var nameInput = row.querySelector('.dish-item-name');
      var priceInput = row.querySelector('.dish-item-price');
      var weightInput = row.querySelector('.dish-item-weight');
      if (!nameInput || !priceInput) continue;
      var price = parseInt(priceInput.value) || 0;
      if (price < 0) price = 0;
      updated.push({
        id: id,
        name: nameInput.value.trim() || '未命名',
        price: price,
        weight: parseInt(weightInput.value) || 0
      });
    }
    if (updated.length === 0) { showToast('菜品数据为空', 'error'); return; }
    updated.sort(function(a, b) { return b.weight - a.weight; });
    var signature = updated.map(function(m) {
      return m.id + '|' + m.name + '|' + m.price + '|' + m.weight;
    }).join('~');
    if (signature === lastDishManagerSignature) return;
    apiRequest('POST', 'update-menu', { menu: updated, menuJson: JSON.stringify(updated) }).then(function(result) {
      if (result.success) {
        menuOptsCache = '';
        dishItems = updated;
        dishItems.sort(function(a, b) { return b.weight - a.weight; });
        lastDishManagerSignature = signature;
        populateDishDropdowns();
        populateBatchOrderTable();
        showToast('菜品已保存', 'success');
      } else {
        showToast(result.message || '保存失败', 'error');
      }
    }).catch(function() {
      showToast('网络错误', 'error');
    });
  }

  document.getElementById('saveDishBtn').addEventListener('click', saveDishManager);
  document.getElementById('dishList').addEventListener('change', function(e) {
    if (e.target && e.target.classList.contains('dish-item-price')) saveDishManager();
  });

  document.getElementById('dishList').addEventListener('click', function(e) {
    var target = e.target;
    if (target.classList.contains('dish-item-del')) {
      var id = target.getAttribute('data-id');
      dishItems = dishItems.filter(function(m) { return m.id !== id; });
      menuOptsCache = '';
      renderDishManager();
      populateDishDropdowns();
      populateBatchOrderTable();
    }
  });

  // ========== 自取优惠开关 ==========
  document.getElementById('lunchSelfPickToggle').addEventListener('change', function() {
    lunchSelfPick = this.checked;
    updateSetting('settings_lunch_selfpick', lunchSelfPick).then(function(result) {
      if (result.success) {
        refreshDataNow();
        showToast('午餐自取减免已更新', 'success');
      } else {
        lunchSelfPick = !lunchSelfPick;
        document.getElementById('lunchSelfPickToggle').checked = lunchSelfPick;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      lunchSelfPick = !lunchSelfPick;
      document.getElementById('lunchSelfPickToggle').checked = lunchSelfPick;
      showToast('网络错误', 'error');
    });
  });

  document.getElementById('dinnerSelfPickToggle').addEventListener('change', function() {
    dinnerSelfPick = this.checked;
    updateSetting('settings_dinner_selfpick', dinnerSelfPick).then(function(result) {
      if (result.success) {
        refreshDataNow();
        showToast('晚餐自取减免已更新', 'success');
      } else {
        dinnerSelfPick = !dinnerSelfPick;
        document.getElementById('dinnerSelfPickToggle').checked = dinnerSelfPick;
        showToast(result.message || '操作失败', 'error');
      }
    }).catch(function() {
      dinnerSelfPick = !dinnerSelfPick;
      document.getElementById('dinnerSelfPickToggle').checked = dinnerSelfPick;
      showToast('网络错误', 'error');
    });
  });

  // ========== 菜品选择价格回显 ==========
  document.getElementById('singleDishItem').addEventListener('change', function() {
    updateDishPriceHint('singleDishItem', 'singleDishPrice');
  });
  document.getElementById('singleQtyMinus').addEventListener('click', function() {
    var qty = parseInt(document.getElementById('singleQty').value) || 1;
    document.getElementById('singleQty').value = Math.max(1, qty - 1);
    updateDishPriceHint('singleDishItem', 'singleDishPrice');
  });
  document.getElementById('singleQtyPlus').addEventListener('click', function() {
    var qty = parseInt(document.getElementById('singleQty').value) || 1;
    document.getElementById('singleQty').value = qty + 1;
    updateDishPriceHint('singleDishItem', 'singleDishPrice');
  });
  document.getElementById('singleQty').addEventListener('change', function() {
    var qty = parseInt(this.value) || 1;
    if (qty < 1) qty = 1;
    this.value = qty;
    updateDishPriceHint('singleDishItem', 'singleDishPrice');
  });
  document.getElementById('editDishItem').addEventListener('change', function() {
    updateDishPriceHint('editDishItem', 'editDishPrice');
  });

  // ========== 启动 ==========
  tryAutoLogin();

  var urlParams = new URLSearchParams(window.location.search);
  var urlToken = urlParams.get('token');
  if (urlToken) {
    token = urlToken;
    apiRequest('POST', 'me', {}).then(function(result) {
      if (result.success) {
        currentUser = result.data.user;
        showMainPage();
      } else {
        token = null;
      }
    });
  }

})();
