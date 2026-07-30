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
function getLastSevenDays() {
  var today = new Date();
  var chinaTime = new Date(today.getTime() + 8 * 60 * 60 * 1000);
  var dates = [];
  for (var i = 0; i < 7; i++) {
    var date = new Date(chinaTime.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
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
async function cleanupExpiredOrders() {
  var validDates = getLastSevenDays();
  var allKeys = await kv.listKeys();
  for (var i = 0; i < allKeys.length; i++) {
    var key = allKeys[i];
    if (key.indexOf('order_') === 0) {
      var parts = key.split('_');
      if (parts.length >= 2) {
        var date = parts[1];
        if (validDates.indexOf(date) === -1) {
          kv.deleteKey(key);
        }
      }
    }
  }
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
function sendJSON(data, statusCode) {
  if (res.__rth_sent) return;
  res.__rth_sent = true;
  statusCode = statusCode || 200;
  res.status(statusCode);
  res.set('Content-Type', 'application/json; charset=utf-8');
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
  } else if (action === 'get-settings') {
    return handleGetSettings();
  } else if (action === 'update-settings' && method === 'POST') {
    return handleUpdateSettings();
  } else {
    return sendJSON({ success: false, message: '未知操作: ' + action }, 400);
  }
}

// 获取系统设置
async function handleGetSettings() {
  try {
    var orderLocked = await kv.get('settings_order_locked');
    var lunchLocked = await kv.get('settings_lunch_locked');
    var dinnerLocked = await kv.get('settings_dinner_locked');
    return sendJSON({
      success: true,
      data: {
        settings: {
          orderLocked: orderLocked === 'true',
          lunchLocked: lunchLocked === 'true',
          dinnerLocked: dinnerLocked === 'true'
        }
      }
    });
  } catch (e) {
    return sendJSON({ success: false, message: '获取设置失败: ' + e.message }, 500);
  }
}

// 更新系统设置（管理员）
async function handleUpdateSettings() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限' }, 403);
    }

    var body = req.body || {};
    var key = body.key;
    var value = body.value;

    if (!key) {
      return sendJSON({ success: false, message: '设置 key 不能为空' }, 400);
    }

    kv.set(key, String(value));

    return sendJSON({ success: true, message: '设置更新成功' });
  } catch (e) {
    return sendJSON({ success: false, message: '更新设置失败: ' + e.message }, 500);
  }
}

// 登录
async function handleLogin() {
  try {
    var body = req.body || {};
    var username = body.username;
    var password = body.password;
    
    if (!username || !password) {
      return sendJSON({ success: false, message: '用户名和密码不能为空' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试' }, 503);
    }
    
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].name === username) { user = users[i]; break; }
    }
    
    if (!user) {
      return sendJSON({ success: false, message: '用户名或密码错误' }, 401);
    }
    
    // 检查登录锁定
    var lockCheck = await auth.checkLoginAttempts(user.id);
    if (lockCheck.locked) {
      return sendJSON({ success: false, message: '登录尝试次数过多，请 ' + lockCheck.remainingSeconds + ' 秒后重试' }, 429);
    }
    
    // 验证密码
    if (!auth.verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      // 记录失败（异步，不阻塞响应）
      auth.recordLoginFail(user.id).catch(function(){});
      return sendJSON({ success: false, message: '用户名或密码错误' }, 401);
    }
    
    // 清除失败记录
    auth.clearLoginFails(user.id);
    
    // 创建会话
    var token = auth.createSession(user.id, user.role);
    
    return sendJSON({
      success: true,
      data: {
        token: token,
        user: { id: user.id, name: user.name, role: user.role }
      }
    });
  } catch (e) {
    return sendJSON({ success: false, message: '登录失败: ' + e.message }, 500);
  }
}

// 登出
async function handleLogout() {
  try {
    var token = auth.getTokenFromRequest();
    if (token) {
      auth.deleteSession(token);
    }
    return sendJSON({ success: true, message: '已退出登录' });
  } catch (e) {
    return sendJSON({ success: false, message: '退出失败: ' + e.message }, 500);
  }
}

// 获取当前用户信息
async function handleMe() {
  try {
    var user = await auth.getCurrentUser();
    if (!user) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    return sendJSON({ success: true, data: { user: user } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取用户信息失败: ' + e.message }, 500);
  }
}

// 修改密码
async function handleChangePassword() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    
    var body = req.body || {};
    var oldPassword = body.oldPassword;
    var newPassword = body.newPassword;
    
    if (!oldPassword || !newPassword) {
      return sendJSON({ success: false, message: '旧密码和新密码不能为空' }, 400);
    }
    
    if (newPassword.length < 6) {
      return sendJSON({ success: false, message: '新密码长度不能少于 6 位' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试' }, 503);
    }
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === currentUser.id) { user = users[i]; break; }
    }
    
    if (!user) {
      return sendJSON({ success: false, message: '用户不存在' }, 404);
    }
    
    if (!auth.verifyPassword(oldPassword, user.passwordSalt, user.passwordHash)) {
      return sendJSON({ success: false, message: '旧密码错误' }, 400);
    }
    
    // 更新密码
    var newSalt = auth.generateSalt();
    var newHash = auth.hashPassword(newPassword, newSalt);
    user.passwordSalt = newSalt;
    user.passwordHash = newHash;
    kv.setJSON('users', users);
    
    // 删除所有旧会话
    await auth.deleteUserSessions(currentUser.id);
    
    return sendJSON({ success: true, message: '密码修改成功，请重新登录' });
  } catch (e) {
    return sendJSON({ success: false, message: '修改密码失败: ' + e.message }, 500);
  }
}

// 获取用户列表
async function handleGetUsers() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后刷新' }, 503);
    }
    
    // 过滤敏感信息
    var safeUsers = users.map(function(u) {
      return { id: u.id, name: u.name, role: u.role };
    });
    
    return sendJSON({ success: true, data: { users: safeUsers } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取用户列表失败: ' + e.message }, 500);
  }
}

// 创建用户（管理员）
async function handleCreateUser() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限' }, 403);
    }
    
    var body = req.body || {};
    var username = body.username;
    var role = body.role || 'user';
    
    if (!username) {
      return sendJSON({ success: false, message: '用户名不能为空' }, 400);
    }
    
    if (role !== 'admin' && role !== 'user') {
      return sendJSON({ success: false, message: '角色无效' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试' }, 503);
    }
    
    // 检查用户名是否重复
    for (var i = 0; i < users.length; i++) {
      if (users[i].name === username) {
        return sendJSON({ success: false, message: '用户名已存在' }, 400);
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
      success: true,
      data: { user: { id: userId, name: username, role: role } },
      message: '用户添加成功，默认密码为 123456'
    });
  } catch (e) {
    return sendJSON({ success: false, message: '添加用户失败: ' + e.message }, 500);
  }
}

// 删除用户（管理员）
async function handleDeleteUser() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限' }, 403);
    }
    
    var body = req.body || {};
    var userId = body.userId;
    
    if (!userId) {
      return sendJSON({ success: false, message: '用户 ID 不能为空' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试' }, 503);
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
      return sendJSON({ success: false, message: '用户不存在' }, 404);
    }
    
    // 不能删除自己
    if (currentUser.id === userId) {
      return sendJSON({ success: false, message: '不能删除自己的账号' }, 400);
    }
    
    // 不能删除管理员（除非自己是管理员）
    if (targetUser.role === 'admin' && currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限删除管理员' }, 403);
    }
    
    // 确保至少保留一个管理员
    if (targetUser.role === 'admin') {
      var adminCount = 0;
      for (var i = 0; i < users.length; i++) {
        if (users[i].role === 'admin') adminCount++;
      }
      if (adminCount <= 1) {
        return sendJSON({ success: false, message: '必须保留至少一个管理员' }, 400);
      }
    }
    
    users.splice(userIndex, 1);
    kv.setJSON('users', users);
    
    // 删除该用户的所有会话
    await auth.deleteUserSessions(userId);
    
    return sendJSON({ success: true, message: '用户删除成功' });
  } catch (e) {
    return sendJSON({ success: false, message: '删除用户失败: ' + e.message }, 500);
  }
}

// 重置密码（管理员）
async function handleResetPassword() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限' }, 403);
    }
    
    var body = req.body || {};
    var userId = body.userId;
    
    if (!userId) {
      return sendJSON({ success: false, message: '用户 ID 不能为空' }, 400);
    }
    
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试' }, 503);
    }
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) { user = users[i]; break; }
    }
    
    if (!user) {
      return sendJSON({ success: false, message: '用户不存在' }, 404);
    }
    
    var salt = auth.generateSalt();
    var hash = auth.hashPassword('123456', salt);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    kv.setJSON('users', users);
    
    // 删除该用户的所有会话
    await auth.deleteUserSessions(userId);
    
    return sendJSON({ success: true, message: '密码已重置为 123456' });
  } catch (e) {
    return sendJSON({ success: false, message: '重置密码失败: ' + e.message }, 500);
  }
}

// 获取订单列表
async function handleGetOrders() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    
    // 清理过期订单（仅在获取订单时执行，避免每次请求都扫描）
    await cleanupExpiredOrders();
    
    var validDates = getLastSevenDays();
    // 构建日期快速查找集合
    var dateSet = {};
    for (var d = 0; d < validDates.length; d++) {
      dateSet[validDates[d]] = true;
    }
    
    var orders = [];
    var allKeys = await kv.listKeys();
    
    // 单次遍历：筛选 order_ 前缀且日期在七天内的 key
    for (var j = 0; j < allKeys.length; j++) {
      var key = allKeys[j];
      if (key.indexOf('order_') === 0) {
        var parts = key.split('_');
        if (parts.length >= 2 && dateSet[parts[1]]) {
          var order = await kv.getJSON(key);
          if (order) orders.push(order);
        }
      }
    }
    
    return sendJSON({ success: true, data: { orders: orders } });
  } catch (e) {
    return sendJSON({ success: false, message: '获取订单失败: ' + e.message }, 500);
  }
}

// 创建订单
async function handleCreateOrder() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    
    var body = req.body || {};
    var userId = body.userId || currentUser.id;
    var personName = body.personName;
    var date = body.date;
    var mealType = body.mealType;
    var itemType = body.itemType || 'blind';
    var itemName = body.itemName || '盲盒';
    var price = body.price;
    
    // 权限检查
    if (currentUser.role !== 'admin' && userId !== currentUser.id) {
      return sendJSON({ success: false, message: '无权限为他人订餐' }, 403);
    }
    
    if (!date || !mealType) {
      return sendJSON({ success: false, message: '日期和餐别不能为空' }, 400);
    }
    
    if (mealType !== 'lunch' && mealType !== 'dinner') {
      return sendJSON({ success: false, message: '餐别无效' }, 400);
    }
    
    // 不能提交未来日期
    var today = getChinaDate();
    if (date > today) {
      return sendJSON({ success: false, message: '不能提交未来日期的订单' }, 400);
    }
    
    // 检查是否在七天内
    var validDates = getLastSevenDays();
    if (validDates.indexOf(date) === -1) {
      return sendJSON({ success: false, message: '只能提交最近七天内的订单' }, 400);
    }
    
    // 确定价格
    if (itemType === 'blind') {
      price = mealType === 'lunch' ? 11 : 12;
      itemName = '盲盒';
    } else {
      price = parseFloat(price);
      if (isNaN(price) || price < 0) {
        return sendJSON({ success: false, message: '价格无效' }, 400);
      }
      price = Math.round(price * 100) / 100;
      if (!itemName) {
        return sendJSON({ success: false, message: '自定义餐品名称不能为空' }, 400);
      }
    }
    
    // 获取用户信息
    var users = await readUsersWithRetry(3);
    if (!users) {
      return sendJSON({ success: false, message: '用户列表暂时读取失败，请稍后重试' }, 503);
    }
    var targetUser = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) { targetUser = users[i]; break; }
    }
    
    if (!targetUser) {
      return sendJSON({ success: false, message: '用户不存在' }, 404);
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
        return sendJSON({ success: false, message: '午餐点餐已被管理员锁定' }, 403);
      }
      if (mealType === 'dinner' && dinnerLockedSetting === 'true') {
        return sendJSON({ success: false, message: '晚餐点餐已被管理员锁定' }, 403);
      }
    }

    // 锁定检查：如果系统锁定且非管理员，不能修改已存在的订单
    if (existingOrder && currentUser.role !== 'admin') {
      var lockedSetting = await kv.get('settings_order_locked');
      if (lockedSetting === 'true') {
        return sendJSON({ success: false, message: '系统已锁定，当前不允许修改餐品' }, 403);
      }
    }
    
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
      paid: existingOrder ? existingOrder.paid : false,
      paidAt: existingOrder ? existingOrder.paidAt : null,
      createdAt: existingOrder ? existingOrder.createdAt : now,
      updatedAt: now
    };
    
    kv.setJSON(orderKey, order);
    
    return sendJSON({ success: true, data: { order: order }, message: '订单提交成功' });
  } catch (e) {
    return sendJSON({ success: false, message: '提交订单失败: ' + e.message }, 500);
  }
}

// 删除订单
async function handleDeleteOrder() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    
    var body = req.body || {};
    var orderId = body.orderId;
    
    if (!orderId) {
      return sendJSON({ success: false, message: '订单 ID 不能为空' }, 400);
    }
    
    var order = await kv.getJSON(orderId);
    if (!order) {
      return sendJSON({ success: false, message: '订单不存在' }, 404);
    }
    
    // 权限检查
    if (currentUser.role !== 'admin' && order.userId !== currentUser.id) {
      return sendJSON({ success: false, message: '无权限删除此订单' }, 403);
    }
    
    // 锁定检查：如果系统锁定且非管理员，不能删除订单
    if (currentUser.role !== 'admin') {
      var lockedSetting = await kv.get('settings_order_locked');
      if (lockedSetting === 'true') {
        return sendJSON({ success: false, message: '系统已锁定，当前不允许删除餐品' }, 403);
      }
    }
    
    kv.deleteKey(orderId);
    
    return sendJSON({ success: true, message: '订单删除成功' });
  } catch (e) {
    return sendJSON({ success: false, message: '删除订单失败: ' + e.message }, 500);
  }
}

// 删除某天所有订单（管理员）
async function handleDeleteOrdersByDate() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限' }, 403);
    }
    
    var body = req.body || {};
    var date = body.date;
    
    if (!date) {
      return sendJSON({ success: false, message: '日期不能为空' }, 400);
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
    
    return sendJSON({ success: true, message: '已删除 ' + deletedCount + ' 条订单' });
  } catch (e) {
    return sendJSON({ success: false, message: '删除订单失败: ' + e.message }, 500);
  }
}

// 更新付款状态（管理员）
async function handleUpdatePayment() {
  try {
    var currentUser = await auth.getCurrentUser();
    if (!currentUser) {
      return sendJSON({ success: false, message: '未登录' }, 401);
    }
    if (currentUser.role !== 'admin') {
      return sendJSON({ success: false, message: '无权限修改付款状态' }, 403);
    }
    
    var body = req.body || {};
    var orderId = body.orderId;
    
    if (!orderId) {
      return sendJSON({ success: false, message: '订单 ID 不能为空' }, 400);
    }
    
    var order = await kv.getJSON(orderId);
    if (!order) {
      return sendJSON({ success: false, message: '订单不存在' }, 404);
    }
    
    var paid = body.paid !== undefined ? (body.paid === 'true' || body.paid === true) : !order.paid;
    
    order.paid = paid;
    order.paidAt = paid ? new Date().toISOString() : null;
    order.updatedAt = new Date().toISOString();
    
    kv.setJSON(orderId, order);
    
    return sendJSON({ success: true, data: { order: order }, message: '付款状态更新成功' });
  } catch (e) {
    return sendJSON({ success: false, message: '更新付款状态失败: ' + e.message }, 500);
  }
}

// 启动
handleRequest().catch(function(e) {
  sendJSON({ success: false, message: '服务器错误: ' + e.message }, 500);
});
