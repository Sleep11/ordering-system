// auth.node.js - 认证和权限模块
var crypto = require('crypto');
var kv = require('kv-adapter.node.js');

// 手动实现多轮哈希（FNV-1a 变体，生成 64 字符的十六进制哈希）
function fnv1a(str, seed) {
  var h1 = 0x811c9dc5 ^ (seed || 0), h2 = 0x01000193;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193);
    h2 ^= c; h2 = Math.imul(h2, 0x811c9dc5);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// 迭代哈希函数
function iterativeHash(str, iterations) {
  var result = str;
  for (var i = 0; i < iterations; i++) {
    result = fnv1a(result, i);
  }
  return result;
}

// 密码哈希 - 使用多轮迭代 + 盐，生成 64 字符哈希
function hashPassword(password, salt) {
  var combined = salt + ':' + password;
  // 用 4 个不同种子各迭代 10000 次，拼接成 64 字符
  var parts = [];
  for (var s = 0; s < 4; s++) {
    var r = combined + ':' + s;
    for (var i = 0; i < 10000; i++) {
      r = fnv1a(r, s * 0x12345 + i);
    }
    parts.push(r);
  }
  return parts.join('');
}

// 生成随机 salt
function generateSalt() {
  var arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(n) { return n.toString(16).padStart(8, '0'); }).join('');
}

// 生成随机 token
function generateToken() {
  var arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(n) { return n.toString(16).padStart(8, '0'); }).join('');
}

// 哈希 token（用于 key 存储，缩短长度）
function hashToken(token) {
  return iterativeHash(token, 1000).substring(0, 40);
}

// 验证密码
function verifyPassword(password, salt, hash) {
  return hashPassword(password, salt) === hash;
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

// 创建会话，返回 token
function createSession(userId, role) {
  var token = generateToken();
  var tokenHash = hashToken(token);
  var session = {
    userId: userId,
    role: role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
  kv.setJSON('session_' + tokenHash, session);
  return token;
}

// 验证会话，返回 session 对象或 null
async function validateSession(token) {
  if (!token) return null;
  try {
    var tokenHash = hashToken(token);
    var session = await kv.getJSON('session_' + tokenHash);
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      kv.deleteKey('session_' + tokenHash);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

// 删除会话
function deleteSession(token) {
  if (!token) return;
  var tokenHash = hashToken(token);
  kv.deleteKey('session_' + tokenHash);
}

// 删除用户的所有会话（修改密码/重置密码后调用）
async function deleteUserSessions(userId) {
  if (!userId) return;
  try {
    var keys = await kv.listKeys();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf('session_') === 0) {
        var session = await kv.getJSON(key);
        if (session && session.userId === userId) {
          kv.deleteKey(key);
        }
      }
    }
  } catch (e) {
    // 静默忽略清理错误
  }
}

// 从请求中获取 token
function getTokenFromRequest() {
  var headers = req.headers || {};
  var authHeader = headers['authorization'] || headers['Authorization'] || '';
  if (authHeader.indexOf('Bearer ') === 0) {
    return authHeader.substring(7);
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  // 兜底：检查 POST body
  if (req.body && req.body.token) {
    return req.body.token;
  }
  return null;
}

// 获取当前登录用户
async function getCurrentUser() {
  var token = getTokenFromRequest();
  if (!token) return null;
  var session = await validateSession(token);
  if (!session) return null;
  var users = await readUsersWithRetry(3);
  if (!users) return null;
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === session.userId) { user = users[i]; break; }
  }
  if (!user) return null;
  return { id: user.id, name: user.name, role: user.role, token: token };
}

// 检查登录锁定
async function checkLoginAttempts(userId) {
  try {
    var lockData = await kv.getJSON('login_lock_' + userId);
    if (lockData && lockData.lockUntil && new Date(lockData.lockUntil) > new Date()) {
      var remaining = Math.ceil((new Date(lockData.lockUntil).getTime() - Date.now()) / 1000);
      return { locked: true, remainingSeconds: remaining > 0 ? remaining : 1 };
    }
  } catch (e) {
    // 静默忽略
  }
  return { locked: false };
}

// 记录登录失败
async function recordLoginFail(userId) {
  try {
    var failKey = 'login_fails_' + userId;
    var fails = await kv.get(failKey);
    fails = fails ? parseInt(fails) + 1 : 1;
    kv.set(failKey, String(fails));
    if (fails >= 5) {
      var lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      kv.setJSON('login_lock_' + userId, { lockUntil: lockUntil });
      kv.set(failKey, '0');
    }
  } catch (e) {
    // 静默忽略错误，不影响登录流程
  }
}

// 清除登录失败记录
function clearLoginFails(userId) {
  try {
    kv.deleteKey('login_fails_' + userId);
    kv.deleteKey('login_lock_' + userId);
  } catch (e) {
    // 静默忽略
  }
}

module.exports = {
  hashPassword: hashPassword,
  generateSalt: generateSalt,
  generateToken: generateToken,
  hashToken: hashToken,
  verifyPassword: verifyPassword,
  createSession: createSession,
  validateSession: validateSession,
  deleteSession: deleteSession,
  deleteUserSessions: deleteUserSessions,
  getTokenFromRequest: getTokenFromRequest,
  getCurrentUser: getCurrentUser,
  checkLoginAttempts: checkLoginAttempts,
  recordLoginFail: recordLoginFail,
  clearLoginFails: clearLoginFails
};
