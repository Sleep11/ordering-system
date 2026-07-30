// kv-adapter.node.js
// KV 数据库适配层 - 热铁盒 (Retinbox) 平台
//
// 所有数据库操作都通过此模块进行。
// 如果平台 KV API 有变化，只需修改此文件。
//
// 平台 KV 文档: https://docs.retiehe.com/
// 数据库名称: ordering
//
// 平台 KV API 说明:
//   const db = new Database("name");     // 创建/打开数据库
//   await db.get("key")                  // 读取 (异步)
//   db.set("key", "value")              // 写入 (同步，值必须为字符串，最大 65535 字符)
//   db.delete("key")                     // 删除 (同步)
//   await db.listKeys()                  // 列出所有 key (异步)
//   await db.searchValue("%pattern%")    // 按值模糊搜索 (异步)
//   Key 命名规则: 仅允许字母、数字、下划线 _、连字符 -

const DB_NAME = 'ordering';
let db = null;

function init() {
  if (!db) {
    db = new Database(DB_NAME);
  }
}

// 读取字符串值 (异步)
async function get(key) {
  init();
  return await db.get(key);
}

// 读取并解析 JSON (异步)，不存在返回 null
async function getJSON(key) {
  const val = await get(key);
  if (val === null || val === undefined) return null;
  try {
    return JSON.parse(val);
  } catch (e) {
    return null;
  }
}

// 写入字符串值 (同步)
function set(key, value) {
  init();
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  db.set(key, str);
}

// 写入 JSON 值 (同步)
function setJSON(key, value) {
  set(key, JSON.stringify(value));
}

// 删除 key (同步)
function deleteKey(key) {
  init();
  db.delete(key);
}

// 列出所有 key (异步)
async function listKeys() {
  init();
  return await db.listKeys();
}

// 按值模糊搜索 (异步)
async function searchValue(pattern) {
  init();
  return await db.searchValue(pattern);
}

module.exports = { init, get, getJSON, set, setJSON, deleteKey, listKeys, searchValue };
