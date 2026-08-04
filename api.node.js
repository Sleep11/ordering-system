// api.node.js - 主 API 入口
var auth = require('auth.node.js');
var kv = require('kv-adapter.node.js');

// 获取中国时区日期 (UTC+8)
function getChinaDate() {
  var now = new Date();
  var chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().split('T')[0];
}

// 获取最近七天的日期列表
// 获取当前月份的日期范围
function getMonthDateRange(offsetMonth) {
  offsetMonth = offsetMonth || 0;
  var today = new Date();
  var chinaTime = new Date(today.getTime() + 8 * 60 * 60 * 1000);
  var year = chinaTime.getUTCFullYear();
  var month = chinaTime.getUTCMonth() + offsetMonth;
  var firstDay = new Date(Date.UTC(year, month, 1));
  var lastDay = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: firstDay.toISOString().split('T')[0],
    to: lastDay.toISOString().split('T')[0]
  };
}

// 获取指定周的日期范围（周一到周日）
function getWeekDateRange(offsetWeek) {
  offsetWeek = offsetWeek || 0;
  var now = new Date();
  var chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  var day = chinaTime.getUTCDay();
  var mondayOffset = day === 0 ? -6 : 1 - day;
  var monday = new Date(chinaTime.getTime() + (mondayOffset + offsetWeek * 7) * 24 * 60 * 60 * 1000);
  var sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    from: monday.toISOString().split('T')[0],
    to: sunday.toISOString().split('T')[0]
  };
}

async function readOrderKeysInBatches(keys) {
  var orders = [];
  var BATCH_SIZE = 10;
  for (var i = 0; i < keys.length; i += BATCH_SIZE) {
    var batch = keys.slice(i, i + BATCH_SIZE);
    var results = await Promise.all(batch.map(function(key) {
      return kv.getJSON(key);
    }));
    for (var j = 0; j < results.length; j++) {
      if (results[j]) orders.push(results[j]);
    }
  }
  return orders;
}

var ORDER_SCHEMA_VERSION = 'order_schema_v3';

function getOrderDiscountValue(order, lunchSelfPick, dinnerSelfPick) {
  if (typeof order.discount === 'number') return order.discount;
  var discount = 0;
  if (order.date === getChinaDate() && order.mealType === 'lunch' && lunchSelfPick) discount = 1;
  if (order.date === getChinaDate() && order.mealType === 'dinner' && dinnerSelfPick) discount = 1;
  return discount;
}

function normalizeOrderMoney(order, lunchSelfPick, dinnerSelfPick) {
  var price = parseFloat(order.price) || 0;
  var discount = getOrderDiscountValue(order, lunchSelfPick, dinnerSelfPick);
  if (typeof order.discount !== 'number') order.discount = discount;
  if (typeof order.receivable !== 'number') order.receivable = Math.max(0, price - order.discount);
  order.actual = order.paid ? price : 0;
  if (typeof order.refund !== 'number') order.refund = order.paid ? order.discount : 0;
  if (typeof order.refunded !== 'boolean') order.refunded = false;
  if (!Array.isArray(order.items)) {
    order.items = [{
      menuId: order.menuId || '',
      name: order.itemName || '',
      price: parseFloat(order.price) || 0,
      quantity: 1
    }];
  }
  var quantity = 0;
  for (var i = 0; i < order.items.length; i++) quantity += parseInt(order.items[i].quantity) || 1;
  order.quantity = quantity;
  return order;
}

function normalizeMenuPayload(raw) {
  if (Array.isArray(raw)) {
    if (raw.length === 1 && typeof raw[0] === 'string') {
      try {
        var parsed = JSON.parse(raw[0]);
        return normalizeMenuPayload(parsed);
      } catch (e) {}
    }
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      var parsed = JSON.parse(raw);
      return normalizeMenuPayload(parsed);
    } catch (e) {
      return null;
    }
  }
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.menu)) return normalizeMenuPayload(raw.menu);
    if (typeof raw.menu === 'string') return normalizeMenuPayload(raw.menu);
    var arr = [];
    var i = 0;
    while (raw[i] !== undefined) {
      arr.push(raw[i]);
      i++;
    }
    if (arr.length > 0) return arr;
  }
  return null;
}

async function migrateOrderSchema() {
  try {
    var version = await kv.get('settings_order_schema_version');
    if (version === ORDER_SCHEMA_VERSION) return;

    var lunchSelfPick = await kv.get('settings_lunch_selfpick') === 'true';
    var dinnerSelfPick = await kv.get('settings_dinner_selfpick') === 'true';
    var allKeys = await kv.listKeys();
    var updated = 0;
    for (var i = 0; i < allKeys.length; i++) {
      var key = allKeys[i];
      if (key.indexOf('order_') !== 0) continue;
      var order = await kv.getJSON(key);
      if (!order) continue;
      var before = JSON.stringify(order);
      normalizeOrderMoney(order, lunchSelfPick, dinnerSelfPick);
      if (JSON.stringify(order) !== before) {
        kv.setJSON(key, order);
        updated++;
      }
    }
    kv.set('settings_order_schema_version', ORDER_SCHEMA_VERSION);
  } catch (e) {
    // 迁移失败不阻塞业务，下次请求会重试
  }
}

async function applySelfPickDiscountToToday(key, enabled) {
  var mealType = key === 'settings_lunch_selfpick' ? 'lunch' : 'dinner';
  var date = getChinaDate();
  var allKeys = await kv.listKeys();
  for (var i = 0; i < allKeys.length; i++) {
    var orderKey = allKeys[i];
    if (orderKey.indexOf('order_') !== 0) continue;
    var parts = orderKey.split('_');
    if (parts.length < 3 || parts[1] !== date) continue;
    if (parts[parts.length - 1] !== mealType) continue;
    var order = await kv.getJSON(orderKey);
    if (!order) continue;
    var price = parseFloat(order.price) || 0;
    order.discount = enabled ? 1 : 0;
    order.receivable = Math.max(0, price - order.discount);
    if (typeof order.actual !== 'number') order.actual = order.paid ? price : 0;
    order.refund = order.paid ? order.discount : 0;
    order.updatedAt = new Date().toISOString();
    kv.setJSON(orderKey, order);
  }
}

async function readUsersWithRetry(maxAttempts) {
  maxAttempts = maxAttempts || 3;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    var users = await kv.getJSON('users');
    if (Array.isArray(users)) {
      return users;
    }
  }
  return null;
}

// 清理过期订单
// 已禁用：不再自动删除历史订单
async function cleanupExpiredOrders() {
  return;
}

// 初始化默认用户
async function initDefaultUsers() {
  var users = await readUsersWithRetry(3);
  if (users && users.length > 0) {
    return users;
  }

  var keys = await kv.listKeys();
  if (keys && keys.indexOf('users') !== -1) {
    // users key 存在但数据可能损坏（空数组或 JSON 解析失败），
    // 尝试最后一次直接读取；仍然无效则删除损坏数据并重建默认用户
    try {
      var raw = await kv.get('users');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      // 确认数据损坏，继续重建
    }
    // 删除损坏的 users key 以允许重建
    kv.deleteKey('users');
  }

  var defaultUsers = [
    { id: 'admin_chenli', name: '陈立昊', role: 'admin', passwordHash: '', passwordSalt: '' },
    { id: 'admin_wangyux', name: '王宇翔', role: 'admin', passwordHash: '', passwordSalt: '' },
    { id: 'user_wanglig', name: '王里庚', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_wangchen', name: '王晨强', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_kangzi', name: '康子阔', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_liuyan', name: '刘彦宏', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_weijia', name: '卫佳旺', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_zhangxi', name: '张晓旭', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_hanzhi', name: '韩志芳', role: 'user', passwordHash: '', passwordSalt: '' },
    { id: 'user_huchan', name: '胡昌雨', role: 'user', passwordHash: '', passwordSalt: '' }
  ];
  // 生成正确的哈希
  for (var i = 0; i < defaultUsers.length; i++) {
    var salt = auth.generateSalt();
    defaultUsers[i].passwordSalt = salt;
    defaultUsers[i].passwordHash = auth.hashPassword('123456', salt);
  }
  kv.setJSON('users', defaultUsers);
  return defaultUsers;
}

// 发送 JSON 响应
function sendJSON(data, statusCode, code) {
  if (res.__rth_sent) return;
  res.__rth_sent = true;
  statusCode = statusCode || 200;
  if (code && data && typeof data === 'object' && !Array.isArray(data)) {
    data.code = code;
  }
  res.status(statusCode);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.write(JSON.stringify(data));
  res.end();
}

// 处理 OPTIONS 预检请求
function handleOptions() {
  if (res.__rth_sent) return;
  res.__rth_sent = true;
  res.status(200);
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.end();
}

// 主路由处理
async function handleRequest() {
  // 初始化
  await initDefaultUsers();
  await migrateOrderSchema();
  
  var method = req.method;
  
  // 处理 CORS 预检
  if (method === 'OPTIONS') {
    return handleOptions();
  }
  
  // 获取请求参数
  var body = req.body || {};
  var action = body.action;
  
  // 路由分发
  if (action === 'login' && method === 'POST') {
    return handleLogin();
  } else if (action === 'logout' && method === 'POST') {
    return handleLogout();
  } else if (action === 'me') {
    return handleMe();
  } else if (action === 'change-password' && method === 'POST') {
    return handleChangePassword();
  } else if (action === 'get-users') {
    return handleGetUsers();
  } else if (action === 'create-user' && method === 'POST') {
    return handleCreateUser();
  } else if (action === 'delete-user' && method === 'POST') {
    return handleDeleteUser();
  } else if (action === 'reset-password' && method === 'POST') {
    return handleResetPassword();
  } else if (action === 'get-orders') {
    return handleGetOrders();
  } else if (action === 'create-order' && method === 'POST') {
    return handleCreateOrder();
  } else if (action === 'delete-order' && method === 'POST') {
    return handleDeleteOrder();
  } else if (action === 'delete-orders-by-date' && method === 'POST') {
    return handleDeleteOrdersByDate();
  } else if (action === 'update-payment' && method === 'POST') {
    return handleUpdatePayment();
  } else if (action === 'refund-order' && method === 'POST') {
    return handleRefundOrder();
  } else if (action === 'get-settings') {
    return handleGetSettings();
  } else if (action === 'update-settings' && method === 'POST') {
    return handleUpdateSettings();
  } else if (action === 'get-report') {
    return handleGetReport();
  } else if (action === 'get-menu') {
    return handleGetMenu();
  } else if (action === 'update-menu' && method === 'POST') {
    return handleUpdateMenu();
  } else if (action === 'clear-all-orders' && method === 'POST') {
    return handleClearAllOrders();
} else if (action === 'restore-kv' && method === 'POST') {
    return handleRestoreKV();
  } else {
    return sendJSON({ success: false, message: '未知操作: ' + action, code: 'SYS-0001' }, 400);
  }
}

// 获取系统设置
async function handleGetSettings() {
  try {
    var orderLocked = await kv.get('settings_order_locked');
    var lunchLocked = await kv.get('settings_lunch_locked');
    var dinnerLocked = await kv.get('settings_dinner_locked');
    var blindLunchPrice = await kv.get('settings_blind_lunch_price');
    var blindDinnerPrice = await kv.get('settings_blind_dinner_price');
    var lunchSelfPick = await kv.get('settings_lunch_selfpick');
    var dinnerSelfPick = await kv.get('settings_dinner_selfpick');
    return sendJSON({
      success: true, code: 'AUTH-0000',
      data: {
        settings: {
          orderLocked: orderLocked === 'true',
          lunchLocked: lunchLocked === 'true',
          dinnerLocked: dinnerLocked === 'true',
          blindLunchPrice: blindLunchPrice ? parseFloat(blindLunchPrice) : 11,
          blindDinnerPrice: blindDinnerPrice ? parseFloat(blindDinnerPrice) : 12,
          lunchSelfPick: lunchSelfPick === 'true',
          dinnerSelfPick: dinnerSelfPick === 'true'
        }
      }
    });
  } catch (e) {
    return sendJSON({ success: false, message: '获取设置失败: ' + e.message, code: 'SYS-0002' }, 500);
  }
}

// 更新系统设置（管理员）
async function handleUpdateSettings() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }

    var body = req.body || {};
    var key = body.key;
    var value = body.value;

    if (!key) {
      return sendJSON({ success: false, message: '设置 key 不能为空', code: 'SETTING-0001' }, 400);
    }

    // 盲盒价格校验
    if (key === 'settings_blind_lunch_price' || key === 'settings_blind_dinner_price') {
      var priceValue = parseFloat(value);
      if (isNaN(priceValue) || priceValue < 0.5 || priceValue > 200) {
        return sendJSON({ success: false, message: '价格必须在 0.5 ~ 200 之间', code: 'SETTING-0002' }, 400);
      }
      value = String(Math.round(priceValue * 100) / 100);
    }

    kv.set(key, String(value));
    if (key === 'settings_lunch_selfpick' || key === 'settings_dinner_selfpick') {
      await applySelfPickDiscountToToday(key, String(value) === 'true');
    }

    return sendJSON({ success: true, message: '设置更新成功', code: 'SETTING-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '更新设置失败: ' + e.message, code: 'SETTING-0003' }, 500);
  }
}

// 登录
async function handleLogin() {
  try {
    var body = req.body || {};
    var username = body.username;
    var password = body.password;
    
    if (!username || !password) {
      return sendJSON({ success: false, message: '用户名和密码不能为空', code: 'AUTH-0003' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试', code: 'USER-0006' }, 503);
    }
    
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].name === username) { user = users[i]; break; }
    }
    
    if (!user) {
      return sendJSON({ success: false, message: '用户名或密码错误', code: 'AUTH-0004' }, 401);
    }
    
    // 检查登录锁定
    var lockCheck = await auth.checkLoginAttempts(user.id);
    if (lockCheck.locked) {
      return sendJSON({ success: false, message: '登录尝试次数过多，请 ' + lockCheck.remainingSeconds + ' 秒后重试', code: 'AUTH-0005' }, 429);
    }
    
    // 验证密码
    if (!auth.verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      // 记录失败（异步，不阻塞响应）
      auth.recordLoginFail(user.id).catch(function(){});
      return sendJSON({ success: false, message: '用户名或密码错误', code: 'AUTH-0004' }, 401);
    }
    
    // 清除失败记录
    auth.clearLoginFails(user.id);
    
    // 创建会话
    var token = auth.createSession(user.id, user.role);
    
    return sendJSON({
      success: true, code: 'AUTH-0000',
      data: {
        token: token,
        user: { id: user.id, name: user.name, role: user.role }
      }
    });
  } catch (e) {
    return sendJSON({ success: false, message: '登录失败: ' + e.message, code: 'AUTH-0006' }, 500);
  }
}

// 登出
async function handleLogout() {
  try {
    var token = auth.getTokenFromRequest();
    if (token) {
      auth.deleteSession(token);
    }
    return sendJSON({ success: true, message: '已退出登录', code: 'AUTH-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '退出失败: ' + e.message, code: 'AUTH-0007' }, 500);
  }
}

// 获取当前用户信息
async function handleMe() {
  try {
    var user = await auth.getCurrentUser();
    if (!user) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    return sendJSON({ success: true, code: 'AUTH-0000', data: { user: user } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取用户信息失败: ' + e.message, code: 'AUTH-0008' }, 500);
  }
}

// 修改密码
async function handleChangePassword() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    
    var body = req.body || {};
    var oldPassword = body.oldPassword;
    var newPassword = body.newPassword;
    
    if (!oldPassword || !newPassword) {
      return sendJSON({ success: false, message: '旧密码和新密码不能为空', code: 'AUTH-0009' }, 400);
    }
    
    if (newPassword.length < 6) {
      return sendJSON({ success: false, message: '新密码长度不能少于 6 位', code: 'AUTH-0010' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试', code: 'USER-0006' }, 503);
    }
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === currentUser.id) { user = users[i]; break; }
    }
    
    if (!user) {
      return sendJSON({ success: false, message: '用户不存在', code: 'USER-0001' }, 404);
    }
    
    if (!auth.verifyPassword(oldPassword, user.passwordSalt, user.passwordHash)) {
      return sendJSON({ success: false, message: '旧密码错误', code: 'AUTH-0011' }, 400);
    }
    
    // 更新密码
    var newSalt = auth.generateSalt();
    var newHash = auth.hashPassword(newPassword, newSalt);
    user.passwordSalt = newSalt;
    user.passwordHash = newHash;
    kv.setJSON('users', users);
    
    // 删除所有旧会话
    await auth.deleteUserSessions(currentUser.id);
    
    return sendJSON({ success: true, message: '密码修改成功，请重新登录', code: 'AUTH-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '修改密码失败: ' + e.message, code: 'AUTH-0012' }, 500);
  }
}

// 获取用户列表
async function handleGetUsers() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后刷新', code: 'USER-0006' }, 503);
    }
    
    // 过滤敏感信息
    var safeUsers = users.map(function(u) {
      return { id: u.id, name: u.name, role: u.role };
    });
    
    return sendJSON({ success: true, code: 'USER-0000', data: { users: safeUsers } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取用户列表失败: ' + e.message, code: 'USER-0007' }, 500);
  }
}

// 创建用户（管理员）
async function handleCreateUser() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }
    
    var body = req.body || {};
    var username = body.username;
    var role = body.role || 'user';
    
    if (!username) {
      return sendJSON({ success: false, message: '用户名不能为空', code: 'USER-0002' }, 400);
    }
    
    if (role !== 'admin' && role !== 'user') {
      return sendJSON({ success: false, message: '角色无效', code: 'USER-0003' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试', code: 'USER-0006' }, 503);
    }
    
    // 检查用户名是否重复
    for (var i = 0; i < users.length; i++) {
      if (users[i].name === username) {
        return sendJSON({ success: false, message: '用户名已存在', code: 'USER-0004' }, 400);
      }
    }
    
    // 生成用户 ID
    var userId = (role === 'admin' ? 'admin_' : 'user_') + Date.now();
    var salt = auth.generateSalt();
    var hash = auth.hashPassword('123456', salt);
    
    var newUser = {
      id: userId,
      name: username,
      role: role,
      passwordSalt: salt,
      passwordHash: hash
    };
    
    users.push(newUser);
    kv.setJSON('users', users);
    
    return sendJSON({
      success: true, code: 'USER-0000',
      data: { user: { id: userId, name: username, role: role } },
      message: '用户添加成功，默认密码为 123456'
    });
  } catch (e) {
    return sendJSON({ success: false, message: '添加用户失败: ' + e.message, code: 'USER-0008' }, 500);
  }
}

// 删除用户（管理员）
async function handleDeleteUser() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }
    
    var body = req.body || {};
    var userId = body.userId;
    
    if (!userId) {
      return sendJSON({ success: false, message: '用户 ID 不能为空', code: 'USER-0009' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试', code: 'USER-0006' }, 503);
    }
    
    var userIndex = -1;
    var targetUser = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) {
        userIndex = i;
        targetUser = users[i];
        break;
      }
    }
    
    if (userIndex === -1) {
      return sendJSON({ success: false, message: '用户不存在', code: 'USER-0001' }, 404);
    }
    
    // 不能删除自己
    if (currentUser.id === userId) {
      return sendJSON({ success: false, message: '不能删除自己的账号', code: 'USER-0010' }, 400);
    }
    
    // 不能删除管理员（除非自己是管理员）
    if (targetUser.role === 'admin' && currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限删除管理员', code: 'USER-0005' }, 403);
    }
    
    // 确保至少保留一个管理员
    if (targetUser.role === 'admin') {
      var adminCount = 0;
      for (var i = 0; i < users.length; i++) {
        if (users[i].role === 'admin') adminCount++;
      }
      if (adminCount <= 1) {
        return sendJSON({ success: false, message: '必须保留至少一个管理员', code: 'USER-0011' }, 400);
      }
    }
    
    users.splice(userIndex, 1);
    kv.setJSON('users', users);
    
    // 删除该用户的所有会话
    await auth.deleteUserSessions(userId);
    
    return sendJSON({ success: true, message: '用户删除成功', code: 'USER-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '删除用户失败: ' + e.message, code: 'USER-0012' }, 500);
  }
}

// 重置密码（管理员）
async function handleResetPassword() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }
    
    var body = req.body || {};
    var userId = body.userId;
    
    if (!userId) {
      return sendJSON({ success: false, message: '用户 ID 不能为空', code: 'USER-0009' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试', code: 'USER-0006' }, 503);
    }
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) { user = users[i]; break; }
    }
    
    if (!user) {
      return sendJSON({ success: false, message: '用户不存在', code: 'USER-0001' }, 404);
    }
    
    var salt = auth.generateSalt();
    var hash = auth.hashPassword('123456', salt);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    kv.setJSON('users', users);
    
    // 删除该用户的所有会话
    await auth.deleteUserSessions(userId);
    
    return sendJSON({ success: true, message: '密码已重置为 123456', code: 'USER-0013' });
  } catch (e) {
    return sendJSON({ success: false, message: '重置密码失败: ' + e.message, code: 'USER-0014' }, 500);
  }
}

// 获取订单列表
async function handleGetOrders() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    
    // 获取当前月份的日期范围
    var monthRange = getMonthDateRange();
    var fromParts = monthRange.from.split('-');
    var toParts = monthRange.to.split('-');
    var dateSet = {};
    // UTC 日期迭代，避免时区偏移
    var d = new Date(Date.UTC(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, parseInt(fromParts[2])));
    var endD = new Date(Date.UTC(parseInt(toParts[0]), parseInt(toParts[1]) - 1, parseInt(toParts[2])));
    while (d <= endD) {
      dateSet[d.toISOString().split('T')[0]] = true;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    
    var allKeys = await kv.listKeys();
    var matchedKeys = [];
    
    // 单次遍历：筛选 order_ 前缀且日期在当前月份的 key
    for (var j = 0; j < allKeys.length; j++) {
      var key = allKeys[j];
      if (key.indexOf('order_') === 0) {
        var parts = key.split('_');
        if (parts.length >= 2 && dateSet[parts[1]]) {
          matchedKeys.push(key);
        }
      }
    }

    var orders = await readOrderKeysInBatches(matchedKeys);
    
    return sendJSON({ success: true, code: 'ORDER-0000', data: { orders: orders } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取订单失败: ' + e.message, code: 'ORDER-0001' }, 500);
  }
}

// 创建订单
async function handleCreateOrder() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    
    var body = req.body || {};
    var userId = body.userId || currentUser.id;
    var personName = body.personName;
    var date = body.date;
    var mealType = body.mealType;
    var itemType = body.itemType || 'blind';
    var itemName = body.itemName || '盲盒';
    var note = body.note || '';
    var price = body.price;
    
    // 权限检查
    if (currentUser.role !== 'admin' && userId !== currentUser.id) {
      return sendJSON({ success: false, message: '无权限为他人订餐', code: 'ORDER-0006' }, 403);
    }
    
    if (!date || !mealType) {
      return sendJSON({ success: false, message: '日期和餐别不能为空', code: 'ORDER-0002' }, 400);
    }
    
    if (mealType !== 'lunch' && mealType !== 'dinner') {
      return sendJSON({ success: false, message: '餐别无效', code: 'ORDER-0003' }, 400);
    }
    
    // 不能提交未来日期
    // 确定价格
    if (itemType === 'blind') {
      var blindLunchPriceRaw = await kv.get('settings_blind_lunch_price');
      var blindDinnerPriceRaw = await kv.get('settings_blind_dinner_price');
      var blindLunchPrice = blindLunchPriceRaw ? parseFloat(blindLunchPriceRaw) : 11;
      var blindDinnerPrice = blindDinnerPriceRaw ? parseFloat(blindDinnerPriceRaw) : 12;
      price = mealType === 'lunch' ? blindLunchPrice : blindDinnerPrice;
      itemName = '盲盒';
    } else if (itemType === 'menu') {
      // 菜单项：价格从菜单中读取
      var menuId = body.menuId;
      if (!menuId) {
        return sendJSON({ success: false, message: '请选择餐品', code: 'ORDER-0004' }, 400);
      }
      var menu = await getMenuItem(menuId);
      if (!menu) {
        return sendJSON({ success: false, message: '餐品不存在', code: 'MENU-0001' }, 404);
      }
      price = menu.price;
      itemName = menu.name;
    } else {
      price = parseFloat(price);
      if (isNaN(price) || price < 0) {
        return sendJSON({ success: false, message: '价格无效', code: 'ORDER-0009' }, 400);
      }
      price = Math.round(price * 100) / 100;
      if (!itemName) {
        return sendJSON({ success: false, message: '自定义餐品名称不能为空', code: 'ORDER-0010' }, 400);
      }
    }

    var items = [];
    var rawItems = body.items;
    if (typeof rawItems === 'string') {
      try { rawItems = JSON.parse(rawItems); } catch (e) {}
    }
    if (rawItems !== undefined && rawItems !== null) {
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return sendJSON({ success: false, message: '餐食数据格式错误', code: 'ORDER-0011' }, 400);
      }
      var totalPrice = 0;
      var itemNames = [];
      for (var ii = 0; ii < rawItems.length; ii++) {
        var rawItem = rawItems[ii] || {};
        var qty = parseInt(rawItem.quantity) || 1;
        if (qty < 1) qty = 1;
        var unitPrice = 0;
        var name = '';
        if (rawItem.menuId) {
          var menuItem = await getMenuItem(rawItem.menuId);
          if (!menuItem) {
            return sendJSON({ success: false, message: '餐品不存在', code: 'MENU-0001' }, 404);
          }
          name = menuItem.name;
          unitPrice = menuItem.price;
        } else {
          name = rawItem.name;
          unitPrice = parseFloat(rawItem.price);
          if (!name || isNaN(unitPrice) || unitPrice < 0) {
            return sendJSON({ success: false, message: '自定义餐品信息不完整', code: 'ORDER-0012' }, 400);
          }
          unitPrice = Math.round(unitPrice * 100) / 100;
        }
        items.push({
          menuId: rawItem.menuId || '',
          name: name,
          price: unitPrice,
          quantity: qty
        });
        totalPrice += unitPrice * qty;
        itemNames.push(name + (qty > 1 ? '×' + qty : ''));
      }
      price = Math.round(totalPrice * 100) / 100;
      itemName = itemNames.join('、');
    } else {
      items.push({
        menuId: body.menuId || '',
        name: itemName,
        price: price,
        quantity: 1
      });
    }
    var totalQuantity = 0;
    for (var qi = 0; qi < items.length; qi++) totalQuantity += items[qi].quantity || 1;
    
    // 获取用户信息
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试', code: 'USER-0006' }, 503);
    }
    var targetUser = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) { targetUser = users[i]; break; }
    }
    
    if (!targetUser) {
      return sendJSON({ success: false, message: '用户不存在', code: 'USER-0001' }, 404);
    }
    
    if (!personName) personName = targetUser.name;
    
    // 订单 key
    var orderKey = 'order_' + date + '_' + userId + '_' + mealType;
    
    // 检查是否已有订单（同日期同人同餐别）
    var existingOrder = await kv.getJSON(orderKey);

    // 如果请求中包含旧餐别信息，说明是跨餐别修改，需要找旧订单
    var oldMealType = body.oldMealType;
    var oldOrderKey = oldMealType && oldMealType !== mealType ? ('order_' + date + '_' + userId + '_' + oldMealType) : null;
    var oldOrder = null;
    if (oldOrderKey) {
      oldOrder = await kv.getJSON(oldOrderKey);
      if (oldOrder && !existingOrder) {
        // 旧餐别有订单，新餐别无：迁移
        existingOrder = oldOrder;
        kv.deleteKey(oldOrderKey);
      }
    }

    // 餐别锁定检查：非管理员不能在被锁定的餐别提交/修改
    if (currentUser.role !== 'admin') {
      var lunchLockedSetting = await kv.get('settings_lunch_locked');
      var dinnerLockedSetting = await kv.get('settings_dinner_locked');
      if (mealType === 'lunch' && lunchLockedSetting === 'true') {
        return sendJSON({ success: false, message: '午餐点餐已被管理员锁定', code: 'ORDER-0013' }, 403);
      }
      if (mealType === 'dinner' && dinnerLockedSetting === 'true') {
        return sendJSON({ success: false, message: '晚餐点餐已被管理员锁定', code: 'ORDER-0014' }, 403);
      }
    }

    // 锁定检查：如果系统锁定且非管理员，不能修改已存在的订单
    if (existingOrder && currentUser.role !== 'admin') {
      var lockedSetting = await kv.get('settings_order_locked');
      if (lockedSetting === 'true') {
        return sendJSON({ success: false, message: '系统已锁定，当前不允许修改餐品', code: 'ORDER-0015' }, 403);
      }
    }

    var lunchSelfPickSetting = await kv.get('settings_lunch_selfpick') === 'true';
    var dinnerSelfPickSetting = await kv.get('settings_dinner_selfpick') === 'true';
    var discount = 0;
    if (date === getChinaDate() && mealType === 'lunch' && lunchSelfPickSetting) discount = 1;
    if (date === getChinaDate() && mealType === 'dinner' && dinnerSelfPickSetting) discount = 1;
    var receivable = Math.max(0, price - discount);
    var actual = existingOrder && existingOrder.paid ? price : 0;
    var refund = existingOrder && existingOrder.paid ? discount : 0;
    
    var now = new Date().toISOString();
    var order = {
      id: orderKey,
      date: date,
      userId: userId,
      personName: personName,
      mealType: mealType,
      itemType: itemType,
      itemName: itemName,
      price: price,
      items: items,
      quantity: totalQuantity,
      receivable: receivable,
      discount: discount,
      actual: actual,
      refund: refund,
      refunded: existingOrder ? !!existingOrder.refunded : false,
      refundedAt: existingOrder ? (existingOrder.refundedAt || null) : null,
      paid: existingOrder ? existingOrder.paid : false,
      paidAt: existingOrder ? existingOrder.paidAt : null,
      createdAt: existingOrder ? existingOrder.createdAt : now,
      updatedAt: now,
      note: note || (existingOrder ? existingOrder.note : '') || ''
    };
    
    kv.setJSON(orderKey, order);
    
    return sendJSON({ success: true, data: { order: order }, message: '订单提交成功', code: 'ORDER-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '提交订单失败: ' + e.message, code: 'ORDER-0017' }, 500);
  }
}

// 删除订单
async function handleDeleteOrder() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    
    var body = req.body || {};
    var orderId = body.orderId;
    
    if (!orderId) {
      return sendJSON({ success: false, message: '订单 ID 不能为空', code: 'ORDER-0018' }, 400);
    }
    
    var order = await kv.getJSON(orderId);
    if (!order) {
      return sendJSON({ success: false, message: '订单不存在', code: 'ORDER-0019' }, 404);
    }
    
    // 权限检查
    if (currentUser.role !== 'admin' && order.userId !== currentUser.id) {
      return sendJSON({ success: false, message: '无权限删除此订单', code: 'ORDER-0005' }, 403);
    }
    
    // 锁定检查：如果系统锁定且非管理员，不能删除订单
    if (currentUser.role !== 'admin') {
      var lockedSetting = await kv.get('settings_order_locked');
      if (lockedSetting === 'true') {
        return sendJSON({ success: false, message: '系统已锁定，当前不允许删除餐品', code: 'ORDER-0016' }, 403);
      }
    }
    
    kv.deleteKey(orderId);
    
    return sendJSON({ success: true, message: '订单删除成功', code: 'ORDER-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '删除订单失败: ' + e.message, code: 'ORDER-0020' }, 500);
  }
}

// 删除某天所有订单（管理员）
async function handleDeleteOrdersByDate() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }
    
    var body = req.body || {};
    var date = body.date;
    
    if (!date) {
      return sendJSON({ success: false, message: '日期不能为空', code: 'ORDER-0021' }, 400);
    }
    
    var allKeys = await kv.listKeys();
    var deletedCount = 0;
    for (var i = 0; i < allKeys.length; i++) {
      var key = allKeys[i];
      if (key.indexOf('order_' + date + '_') === 0) {
        kv.deleteKey(key);
        deletedCount++;
      }
    }
    
    return sendJSON({ success: true, code: 'ORDER-0000', message: '已删除 ' + deletedCount + ' 条订单' });
  } catch (e) {
    return sendJSON({ success: false, message: '删除订单失败: ' + e.message, code: 'ORDER-0020' }, 500);
  }
}

// 更新付款状态（管理员）
async function handleUpdatePayment() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限修改付款状态', code: 'ORDER-0007' }, 403);
    }
    
    var body = req.body || {};
    var orderId = body.orderId;
    
    if (!orderId) {
      return sendJSON({ success: false, message: '订单 ID 不能为空', code: 'ORDER-0018' }, 400);
    }
    
    var order = await kv.getJSON(orderId);
    if (!order) {
      return sendJSON({ success: false, message: '订单不存在', code: 'ORDER-0019' }, 404);
    }
    
    var paid = body.paid !== undefined ? (body.paid === 'true' || body.paid === true) : !order.paid;
    var lunchSelfPickSetting = await kv.get('settings_lunch_selfpick') === 'true';
    var dinnerSelfPickSetting = await kv.get('settings_dinner_selfpick') === 'true';
    normalizeOrderMoney(order, lunchSelfPickSetting, dinnerSelfPickSetting);
    
    order.paid = paid;
    order.paidAt = paid ? new Date().toISOString() : null;
    order.actual = paid ? (parseFloat(order.price) || 0) : 0;
    order.refund = paid ? order.discount : 0;
    if (!paid) {
      order.refunded = false;
      order.refundedAt = null;
    }
    order.updatedAt = new Date().toISOString();
    
    kv.setJSON(orderId, order);
    
    return sendJSON({ success: true, data: { order: order }, message: '付款状态更新成功', code: 'ORDER-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '更新付款状态失败: ' + e.message, code: 'ORDER-0022' }, 500);
  }
}

// 订单退款（管理员）
async function handleRefundOrder() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限退款', code: 'ORDER-0008' }, 403);
    }

    var body = req.body || {};
    var orderId = body.orderId;
    if (!orderId) {
      return sendJSON({ success: false, message: '订单 ID 不能为空', code: 'ORDER-0018' }, 400);
    }

    var order = await kv.getJSON(orderId);
    if (!order) {
      return sendJSON({ success: false, message: '订单不存在', code: 'ORDER-0019' }, 404);
    }
    if (!order.paid) {
      return sendJSON({ success: false, message: '未付款订单不能退款', code: 'ORDER-0023' }, 400);
    }
    if (order.refunded) {
      return sendJSON({ success: false, message: '订单已退款', code: 'ORDER-0024' }, 400);
    }

    order.refunded = true;
    order.refundedAt = new Date().toISOString();
    order.refund = order.discount || 0;
    order.updatedAt = new Date().toISOString();
    kv.setJSON(orderId, order);

    return sendJSON({ success: true, data: { order: order }, message: '退款成功', code: 'ORDER-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '退款失败: ' + e.message, code: 'ORDER-0025' }, 500);
  }
}

// 周月报统计
async function handleGetReport() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }

    var body = req.body || {};
    var type = body.type || 'week'; // week | month
    var offset = parseInt(body.offset) || 0;
    var fromDate = body.from;
    var toDate = body.to;

    var range;
    if (fromDate && toDate) {
      range = { from: fromDate, to: toDate };
      type = 'custom';
    } else if (type === 'month') {
      range = getMonthDateRange(offset);
    } else {
      range = getWeekDateRange(offset);
    }

    var allKeys = await kv.listKeys();
    var matchedKeys = [];
    for (var j = 0; j < allKeys.length; j++) {
      var key = allKeys[j];
      if (key.indexOf('order_') === 0) {
        var parts = key.split('_');
        if (parts.length >= 2) {
          var orderDate = parts[1];
          if (orderDate >= range.from && orderDate <= range.to) {
            matchedKeys.push(key);
          }
        }
      }
    }

    var orders = await readOrderKeysInBatches(matchedKeys);

    // 汇总统计
    var totalOrders = orders.length;
    var totalAmount = 0;
    var paidAmount = 0;
    var paidCount = 0;
    var lunchCount = 0;
    var dinnerCount = 0;
    var perPerson = {};

    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var price = parseFloat(o.price) || 0;
      var discount = typeof o.discount === 'number' ? o.discount : 0;
      var receivable = typeof o.receivable === 'number' ? o.receivable : Math.max(0, price - discount);
      var actual = typeof o.actual === 'number' ? o.actual : (o.paid ? price : 0);
      totalAmount += receivable;
      if (o.paid) {
        paidAmount += actual;
        paidCount++;
      }
      if (o.mealType === 'lunch') lunchCount++;
      else dinnerCount++;

      var name = o.personName || '未知';
      if (!perPerson[name]) {
        perPerson[name] = { count: 0, amount: 0, paid: 0 };
      }
      perPerson[name].count++;
      perPerson[name].amount += receivable;
      if (o.paid) perPerson[name].paid++;
    }

    var personList = Object.keys(perPerson).map(function(k) {
      return { name: k, count: perPerson[k].count, amount: perPerson[k].amount, paid: perPerson[k].paid };
    }).sort(function(a, b) { return b.amount - a.amount; });

    var report = {
      type: type,
      range: range,
      summary: {
        totalOrders: totalOrders,
        totalAmount: Math.round(totalAmount * 100) / 100,
        paidAmount: Math.round(paidAmount * 100) / 100,
        unpaidAmount: Math.round((totalAmount - paidAmount) * 100) / 100,
        paidCount: paidCount,
        unpaidCount: totalOrders - paidCount,
        lunchCount: lunchCount,
        dinnerCount: dinnerCount
      },
      perPerson: personList,
      orders: orders
    };

    return sendJSON({ success: true, code: 'REPORT-0000', data: report });
  } catch (e) {
    return sendJSON({ success: false, message: '获取报表失败: ' + e.message, code: 'REPORT-0001' }, 500);
  }
}

// 获取默认菜单
function getDefaultMenu() {
  return [
    { id: 'm001', name: '炒冷面', price: 14, weight: 100 },
    { id: 'm002', name: '宫瑾爆蛋', price: 13, weight: 99, note: '糖醋/咸辣口味备注' },
    { id: 'm003', name: '咖喱虾仁蛋炒饭', price: 15, weight: 98 },
    { id: 'm004', name: '滑蛋饭全家福', price: 20, weight: 97, note: '培根/鱿鱼/鸡丁/牛肉/虾仁/蟹柳，口味备注' },
    { id: 'm005', name: '招牌火腿滑蛋饭', price: 14, weight: 96 },
    { id: 'm006', name: '滑蛋饭', price: 16, weight: 95, note: '口味可选' },
    { id: 'm007', name: '广式腊肠滑蛋饭', price: 16, weight: 94 },
    { id: 'm008', name: '双椒牛肉', price: 16, weight: 93 },
    { id: 'm009', name: '双椒火腿', price: 16, weight: 92 },
    { id: 'm010', name: '孜然鸡丁', price: 16, weight: 91 },
    { id: 'm011', name: '孜然牛肉', price: 16, weight: 90 },
    { id: 'm012', name: '酱香鸡丁', price: 16, weight: 89 },
    { id: 'm013', name: '麻辣鱿鱼', price: 16, weight: 88 },
    { id: 'm014', name: '香辣培根', price: 16, weight: 87 },
    { id: 'm015', name: '香辣鱿鱼', price: 16, weight: 86 },
    { id: 'm016', name: '香辣蟹柳', price: 16, weight: 85 },
    { id: 'm017', name: '香辣牛肉', price: 16, weight: 84 },
    { id: 'm018', name: '咖喱鸡丁', price: 16, weight: 83 },
    { id: 'm019', name: '咖喱牛肉', price: 16, weight: 82 },
    { id: 'm020', name: '麻辣鸡丁', price: 16, weight: 81 },
    { id: 'm021', name: '黑椒牛肉滑蛋饭', price: 16, weight: 80 },
    { id: 'm022', name: '番茄虾仁滑蛋饭', price: 16, weight: 79 },
    { id: 'm023', name: '鸡腿饭', price: 15, weight: 78 },
    { id: 'm024', name: '猪脚饭', price: 18, weight: 77 },
    { id: 'm025', name: '炒饼', price: 12, weight: 76 },
    { id: 'm026', name: '肉炒饼', price: 15, weight: 75 },
    { id: 'm027', name: '蛋炒饭', price: 12, weight: 74 },
    { id: 'm028', name: '盖饭配菜', price: 14, weight: 73, note: '蒜薹炒肉/鱼香茄子' },
    { id: 'm029', name: '黑椒鸡柳', price: 16, weight: 72 },
    { id: 'm030', name: '干豆角烧肉', price: 16, weight: 71 },
    { id: 'm031', name: '可乐鸡', price: 16, weight: 70 },
    { id: 'm032', name: '鱼香肉丝', price: 16, weight: 69 },
    { id: 'm033', name: '红烧肉', price: 16, weight: 68 },
    { id: 'm034', name: '外婆菜炒腊肉', price: 16, weight: 67 },
    { id: 'm035', name: '梅菜烧肉', price: 16, weight: 66 },
    { id: 'm036', name: '锅包肉', price: 16, weight: 65 },
    { id: 'm037', name: '香辣小炒肉', price: 16, weight: 64 },
    { id: 'm038', name: '菠萝古老肉', price: 16, weight: 63 },
    { id: 'm039', name: '糖醋里脊', price: 16, weight: 62 },
    { id: 'm040', name: '孜然烤肉', price: 16, weight: 61 },
    { id: 'm041', name: '青椒小炒肉', price: 16, weight: 60 },
    { id: 'm042', name: '西红柿鸡蛋盖饭', price: 16, weight: 59 },
    { id: 'm043', name: '土豆红烧肉', price: 16, weight: 58 },
    { id: 'm044', name: '香菇滑鸡', price: 16, weight: 57 },
    { id: 'm045', name: '巴西烤肉', price: 16, weight: 56 },
    { id: 'm046', name: '茄子红烧肉', price: 16, weight: 55 },
    { id: 'm047', name: '盲盒', price: 12, weight: 100 }
  ];
}

// 获取菜单项
async function getMenuItem(menuId) {
  var menu = await getMenu();
  for (var i = 0; i < menu.length; i++) {
    if (menu[i].id === menuId) return menu[i];
  }
  return null;
}

// 获取完整菜单
async function getMenu() {
  try {
    var menu = await kv.getJSON('settings_menu');
    if (Array.isArray(menu) && menu.length > 0) return menu;
  } catch (e) {}
  var defaults = getDefaultMenu();
  kv.setJSON('settings_menu', defaults);
  return defaults;
}

// 获取菜单接口
async function handleGetMenu() {
  try {
    var menu = await getMenu();
    menu.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); });
    return sendJSON({ success: true, code: 'MENU-0000', data: { menu: menu } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取菜单失败: ' + e.message, code: 'MENU-0002' }, 500);
  }
}

// 更新菜单（管理员）
async function handleUpdateMenu() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }

    var body = req.body || {};
    // 兼容多种 body 格式：纯字符串 / URL-encoded 对象 / JSON 字符串
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    // 如果 body 是空对象或 menu 字段缺失，尝试从原始 request body 解析
    var menu = normalizeMenuPayload(body && body.menu);
    if (!Array.isArray(menu) && body && body.menuJson !== undefined) {
      menu = normalizeMenuPayload(body.menuJson);
    }
    // 兜底：如果 body.menu 和 body.menuJson 都解析失败，尝试将整个 body 当作菜单
    if (!Array.isArray(menu) && body && !body.menu && !body.menuJson) {
      menu = normalizeMenuPayload(body);
    }
    if (!Array.isArray(menu)) {
      return sendJSON({ success: false, message: '菜单数据格式错误', code: 'MENU-0003' }, 400);
    }

    for (var i = 0; i < menu.length; i++) {
      if (!menu[i].id || !menu[i].name || menu[i].price === undefined) {
        return sendJSON({ success: false, message: '菜单项缺少必要字段', code: 'MENU-0004' }, 400);
      }
    }

    var currentMenu = await getMenu();
    for (var i = 0; i < menu.length; i++) {
      if (menu[i].note === undefined) {
        for (var j = 0; j < currentMenu.length; j++) {
          if (currentMenu[j].id === menu[i].id && currentMenu[j].note) {
            menu[i].note = currentMenu[j].note;
            break;
          }
        }
      }
    }

    kv.setJSON('settings_menu', menu);
    return sendJSON({ success: true, message: '菜单更新成功', code: 'MENU-0000' });
  } catch (e) {
    return sendJSON({ success: false, message: '更新菜单失败: ' + e.message, code: 'MENU-0005' }, 500);
  }
}

// 启动

// 清除所有订单（管理员专用，需密码验证）
async function handleClearAllOrders() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) return sendJSON({ success: false, message: '未登录', code: 'AUTH-0001' }, 401);
    if (currentUser.role !== 'admin') return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);

    var body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    var password = body.password || '';
    if (!password) return sendJSON({ success: false, message: '请输入管理员密码', code: 'AUTH-0013' }, 400);

    // 验证密码
    var users = await readUsersWithRetry(3);
    if (!users) return sendJSON({ success: false, message: '用户数据读取失败', code: 'USER-0015' }, 500);
    var adminUser = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === currentUser.id) { adminUser = users[i]; break; }
    }
    if (!adminUser) return sendJSON({ success: false, message: '管理员用户不存在', code: 'USER-0001' }, 404);
    if (!auth.verifyPassword(password, adminUser.passwordSalt, adminUser.passwordHash)) {
      return sendJSON({ success: false, message: '密码错误', code: 'AUTH-0014' }, 403);
    }

    // 删除所有 order_ 开头的 key
    var allKeys = await kv.listKeys();
    var deleted = 0;
    for (var i = 0; i < allKeys.length; i++) {
      if (allKeys[i].indexOf('order_') === 0) {
        kv.deleteKey(allKeys[i]);
        deleted++;
      }
    }

    return sendJSON({ success: true, code: 'ORDER-0000', message: '已清除 ' + deleted + ' 条订单', data: { count: deleted } });
  } catch (e) {
    return sendJSON({ success: false, message: '清除订单失败: ' + e.message, code: 'ORDER-0026' }, 500);
  }
}

// 临时：重置用户数据（解决 PHP 迁移导致的数据兼容问题）
async function handleResetUsersInit() {
  try {
    kv.deleteKey('users');
    var users = await readUsersWithRetry(3);
    if (!users || users.length === 0) {
      // initDefaultUsers will be called on next request
    }
    return sendJSON({ success: true, code: 'USER-0000', message: '用户数据已清除，下次请求将自动重建默认用户' });
  } catch (e) {
    return sendJSON({ success: false, message: '重置失败: ' + e.message, code: 'USER-0016' }, 500);
  }
}

// 批量恢复 KV 数据（管理员专用）
async function handleRestoreKV() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限', code: 'AUTH-0002' }, 403);
    }
    var body = req.body || {};
    var records = body.records;
    if (typeof records === 'string') {
      try { records = JSON.parse(records); } catch(e) {}
    }
    if (!Array.isArray(records) || records.length === 0) {
      return sendJSON({ success: false, message: '请提供有效的 records 数组', code: 'SYS-0003' }, 400);
    }
    var count = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.key && r.value !== undefined) {
        kv.set(r.key, String(r.value));
        count++;
      }
    }
    return sendJSON({ success: true, code: 'SYS-0000', message: '已恢复 ' + count + ' 条数据' });
  } catch (e) {
    return sendJSON({ success: false, message: '恢复失败: ' + e.message, code: 'SYS-0004' }, 500);
  }
}

handleRequest().catch(function(e) {
  sendJSON({ success: false, message: '服务器错误: ' + e.message, code: 'SYS-9999' }, 500);
});
