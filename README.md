# 多人在线点餐系统 — 项目文档

> 基于 Retinbox (热铁盒) Web Hosting 的全栈点餐系统，支持多用户、盲盒/自定义餐品、午餐/晚餐分时段管理。

---

## 目录

- [系统架构](#系统架构)
- [文件清单](#文件清单)
- [数据存储设计](#数据存储设计)
- [API 接口文档](#api-接口文档)
- [前端架构](#前端架构)
- [认证与安全](#认证与安全)
- [部署](#部署)
- [常见维护操作](#常见维护操作)
- [变更记录](#变更记录)

---

## 系统架构

```
┌─────────────────────────────────┐
│           浏览器 (SPA)           │
│  index.html + styles.css        │
│  app.js (纯前端 MVC)            │
└────────────┬────────────────────┘
             │ HTTP POST
             ▼
┌─────────────────────────────────┐
│         Retinbox 云函数          │
│  api.node.js   (主路由)         │
│  auth.node.js  (认证模块)       │
│  kv-adapter.node.js (数据库层)  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│       Retinbox KV 数据库        │
│          (database: ordering)   │
└─────────────────────────────────┘
```

- **前端**：原生 HTML/CSS/JS 单页应用，无第三方框架
- **后端**：Retinbox Node.js 云函数 (`.node.js` 后缀)
- **数据库**：Retinbox 内置 KV 存储，数据库名 `ordering`
- **平台**：[Retinbox Web Hosting](https://docs.retiehe.com/)

---

## 文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| `index.html` | ~400 | 主页面：登录页、主页面(侧边栏+订单+用户管理+弹窗) |
| `app.js` | ~2100 | 前端核心逻辑：状态管理、API 调用、UI 渲染、事件处理、菜品管理、报表 |
| `styles.css` | ~2000 | 完整样式系统：设计令牌、布局、组件、动效、响应式、移动端适配 |
| `api.node.js` | ~1050 | 后端 API 路由：认证、订单 CRUD、用户管理、设置、菜品管理、周月报 |
| `auth.node.js` | ~205 | 认证模块：密码哈希、会话管理、权限校验 |
| `kv-adapter.node.js` | ~76 | 数据库抽象层：封装 Retinbox KV API |

---

## 数据存储设计

### KV 数据库名：`ordering`

所有 Key 命名规范：仅允许 **字母、数字、下划线 `_`、连字符 `-`**。

### Key 结构

| Key 模式 | 值类型 | 说明 |
|----------|--------|------|
| `users` | JSON 数组 | 所有用户列表，每个用户含 id/name/role/passwordHash/passwordSalt |
| `session_{tokenHash}` | JSON 对象 | 用户会话，含 userId/role/createdAt/expiresAt |
| `order_{date}_{userId}_{mealType}` | JSON 对象 | 单条订单，如 `order_2025-01-15_admin_chenli_lunch` |
| `settings_order_locked` | `"true"/"false"` | 全局锁定开关 |
| `settings_lunch_locked` | `"true"/"false"` | 午餐锁定开关 |
| `settings_dinner_locked` | `"true"/"false"` | 晚餐锁定开关 |
| `settings_blind_lunch_price` | 数字字符串 | 午餐盲盒价格，默认 `"11"` |
| `settings_blind_dinner_price` | 数字字符串 | 晚餐盲盒价格，默认 `"12"` |
| `login_fails_{userId}` | 数字字符串 | 登录失败计数 |
| `login_lock_{userId}` | JSON 对象 | 登录锁定信息，含 lockUntil |

### 用户对象结构

```json
{
  "id": "admin_chenli",
  "name": "陈立昊",
  "role": "admin",
  "passwordHash": "64字符FNV哈希",
  "passwordSalt": "32字符随机盐"
}
```

### 订单对象结构

```json
{
  "id": "order_2025-01-15_admin_chenli_lunch",
  "date": "2025-01-15",
  "userId": "admin_chenli",
  "personName": "陈立昊",
  "mealType": "lunch",
  "itemType": "blind",
  "itemName": "盲盒",
  "price": 11,
  "paid": false,
  "paidAt": null,
  "createdAt": "2025-01-15T04:00:00.000Z",
  "updatedAt": "2025-01-15T04:00:00.000Z"
}
```

### 餐品定价规则

| 餐别 | 盲盒价格（管理员可调） | 自定义价格 |
|------|---------------------|-----------|
| 午餐 (lunch) | 默认 ¥11.00（侧边栏可修改） | 用户自填 |
| 晚餐 (dinner) | 默认 ¥12.00（侧边栏可修改） | 用户自填 |

---

## API 接口文档

- **入口**: `POST /api.node.js`
- **Content-Type**: `application/x-www-form-urlencoded`
- **认证**: Header `Authorization: Bearer <token>` 或 POST 参数 `token`

### 通用响应格式

```json
{ "success": true/false, "message": "...", "data": { ... } }
```

### 接口列表

#### 认证类（无需登录）

| action | 说明 | 参数 | 返回 |
|--------|------|------|------|
| `login` | 用户登录 | username, password | { token, user } |
| `logout` | 退出登录 | (自动从token识别) | — |

#### 用户类（需登录）

| action | 说明 | 权限 | 参数 | 返回 |
|--------|------|------|------|------|
| `me` | 获取当前用户 | 所有 | — | { user } |
| `change-password` | 修改密码 | 所有 | oldPassword, newPassword | — |
| `get-users` | 获取用户列表 | 所有 | — | { users[] } |
| `create-user` | 添加用户 | admin | username, role | — |
| `delete-user` | 删除用户 | admin | userId | — |
| `reset-password` | 重置密码为123456 | admin | userId | — |

#### 订单类（需登录）

| action | 说明 | 权限 | 关键参数 | 备注 |
|--------|------|------|----------|------|
| `get-orders` | 获取最近七天订单 | 所有 | — | 自动清理过期订单 |
| `create-order` | 创建/修改订单 | 所有* | date, mealType, itemType, userId†, itemName‡, price‡, oldMealType‡‡ | *普通用户只能给自己订；†仅admin；‡仅custom类型；‡‡跨餐别修改时传 |
| `delete-order` | 删除单条订单 | 所有* | orderId | *需系统未锁定或本人订单 |
| `delete-orders-by-date` | 删除当天全部订单 | admin | date | — |
| `update-payment` | 切换付款状态 | admin | orderId, paid | — |

#### 设置类

| action | 说明 | 权限 | 参数 | 备注 |
|--------|------|------|------|------|
| `get-settings` | 获取系统设置 | 无需登录 | — | 返回 orderLocked/lunchLocked/dinnerLocked |
| `update-settings` | 更新设置 | admin | key, value | key 为 `settings_order_locked` 等 |

### 错误码

| HTTP | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 401 | 未登录或凭据错误 |
| 403 | 无权限（锁定/非管理员/越权） |
| 404 | 资源不存在 |
| 429 | 登录尝试过多，15分钟后再试 |
| 500 | 服务器错误 |
| 503 | KV 数据库读取失败 |

---

## 前端架构

### 状态变量 (`app.js` 顶部)

```js
var token = null;           // 当前登录令牌
var currentUser = null;     // 当前用户对象 {id, name, role}
var allUsers = [];          // 所有用户列表（管理员可见）
var allOrders = [];         // 当前订单列表
var settings = {            // 系统设置（从后端加载）
  orderLocked: false,
  lunchLocked: false,
  dinnerLocked: false
};
var isBatchSubmitting = false; // 管理员批量提交中
```

### 数据流

```
登录 → showMainPage() → loadAllData()
                          ├── loadSettings()       (首次)
                          ├── get-orders → allOrders
                          └── get-users → allUsers (管理员)
                                    │
                         renderAll() ←────────────┘
                          ├── updateTodayStats()  (统计卡片)
                          └── renderOrders()      (订单列表)
```

### 自动刷新

- **订单**: 每 8 秒自动刷新（`ORDERS_REFRESH_INTERVAL`）
- **窗口聚焦**: 切回页面时立即刷新
- **提交期间**: `isBatchSubmitting=true` 时暂停刷新
- **确认对话框状态**: DOM 重建后自动恢复，不影响数据同步
- **滚动位置**: 刷新时自动保持当前滚动位置

### 页面结构

```
loginPage         — 登录页（用户名+密码+记住密码）
mainPage          — 主页面
├── topbar        — 顶部栏（用户信息+修改密码+退出）
├── sidebar       — 侧边栏（仅管理员）
│   ├── 导航链接   — 点餐/统计/订单/用户管理
│   ├── 全局锁定   — 禁止修改餐品
│   └── 时段控制   — 午餐/晚餐分别锁定
├── section-order — 点餐登记面板
├── section-stats — 今日统计面板
├── section-orders— 最近七天订单面板
└── section-admin — 用户管理面板（仅管理员）
passwordModal    — 修改密码弹窗
editOrderModal   — 编辑订单弹窗
toastContainer   — Toast 通知容器
```

### 关键交互流程

#### 登录 & 记住密码
1. 用户勾选"记住密码" → `saveLoginInfo` 保存 username + password + token + remember=true 到 localStorage
2. 下次打开 → `tryAutoLogin` 自动用密码登录获取新 token
3. 退出 → 保留用户名密码在 localStorage，仅清除 token
4. 修改密码 → `clearLoginInfo` 完全清除

#### 普通用户提交订单
1. 选择日期/餐别/类型 → 填写(自定义) → 点提交
2. 提交按钮禁用 → 显示"提交中..."
3. API 返回 → 恢复按钮 + 清空输入 + toast 反馈

#### 管理员批量提交
1. 勾选用户 → 设餐品类型 → 点"提交订单"
2. 按钮变红色"确认提交"，显示将提交的人数和餐别
3. 再次点击确认 → 串行提交每个用户 → 显示进度
4. 完成 → 统计成功/失败数 → 自动刷新
5. 5 秒内不确认自动取消

#### 编辑订单
1. 点击订单"修改"按钮 → 弹窗
2. 可修改：餐别、餐品类型、餐品名称、价格
3. 跨餐别修改：后端自动迁移 order key

### Toast 通知系统

```js
showToast(message, type)
// type: 'success' | 'error' | 'info'
```
- 右下角浮层，2.5~4秒自动消失
- 入场/出场 CSS 动画
- 最多同时显示 3 个，超出自动移除最早的
- 完全替代 `alert()`

---

## 认证与安全

### 密码处理

- **哈希算法**: 自定义 FNV-1a 变体 × 4轮 × 10000次迭代 = 64字符哈希
- **盐 (Salt)**: `crypto.getRandomValues` 生成 32 字符随机盐
- **验证**: `hashPassword(password, salt) === storedHash`

### 会话管理

- **Token**: `crypto.getRandomValues` 生成 64 字符随机令牌
- **存储**: Token 哈希后 40 字符作为 KV key (`session_{tokenHash}`)
- **过期**: 24 小时自动过期
- **验证**: `validateSession(token)` 检查存在性和过期时间
- **会话清除**: 修改密码或重置密码后，该用户所有旧会话立即失效

### 登录保护

- **失败计数**: 5 次失败 → 锁定 15 分钟
- **锁定降级**: 失败计数失败不影响登录流程（静默忽略）

### 权限矩阵

| 操作 | 管理员 | 普通用户 |
|------|--------|----------|
| 给自己订餐 | ✓ | ✓ |
| 给他人订餐 | ✓ | ✗ |
| 修改自己订单 | ✓ | ✓ (未锁时) |
| 修改他人订单 | ✓ | ✗ |
| 删除自己订单 | ✓ | ✓ (未锁时) |
| 删除他人订单 | ✓ | ✗ |
| 标记付款 | ✓ | ✗ |
| 管理用户 | ✓ | ✗ |
| 系统设置 | ✓ | ✗ |

---

## 部署

### 平台要求

- [Retinbox Web Hosting](https://retiehe.com/)
- 无需额外构建步骤（纯静态 HTML/JS/CSS + Node.js 云函数）

### 部署步骤

1. **获取 API Key**
   - Retinbox 管理页面 → API Key → 新建密钥
   - 存储为环境变量 `RTH_API_KEY` 或项目 `.env` 文件

2. **创建配置文件** `rth-host.json`:
```json
{
  "build": "",
  "outdir": ".",
  "site": "your-site-name"
}
```

3. **添加部署脚本** 到 `package.json`:
```json
{
  "scripts": {
    "deploy": "deno -Ar https://host.retiehe.com/cli deploy"
  }
}
```

4. **执行部署**:
```bash
npm run deploy
```

### 本地开发

云函数 `.node.js` 文件可使用 watch 模式实时同步：
```bash
deno -Ar https://host.retiehe.com/cli watch
```

### 默认用户

首次访问时自动创建，默认密码均为 `123456`：

| 用户名 | 角色 |
|--------|------|
| 陈立昊 | 管理员 |
| 王宇翔 | 管理员 |
| 王里庚 | 普通用户 |
| 王晨强 | 普通用户 |
| 康子阔 | 普通用户 |
| 刘彦宏 | 普通用户 |
| 卫佳旺 | 普通用户 |
| 张晓旭 | 普通用户 |
| 韩志芳 | 普通用户 |
| 胡昌雨 | 普通用户 |

---

## 常见维护操作

### 添加新用户
1. 管理员登录 → 侧边栏"用户管理"
2. 输入用户名、选择角色 → 点"添加用户"
3. 默认密码：`123456`

### 重置用户密码
1. 用户管理 → 目标用户 → 点"重置密码"
2. 确认 → 密码重置为 `123456`

### 暂时禁止点餐
- **全局锁定**: 侧边栏 → "禁止用户修改餐品"（阻止修改/删除，但仍可提交新订单）
- **午餐/晚餐分别锁定**: 侧边栏 → "禁止午餐/晚餐点餐"（阻止提交）

### 修改盲盒价格
管理员登录 → 侧边栏"盲盒价格设置" → 修改午餐或晚餐盲盒价格（0.5~200 元）→ 按 Enter 或失焦生效。价格立即在点餐登记和批量提交中同步。

### 添加新餐品类型
1. `index.html`: 在 `itemType` select 中添加新 `<option>`
2. `app.js`: 在提交逻辑和编辑逻辑中处理新类型
3. `api.node.js`: 在 `handleCreateOrder` 中处理定价

### 调整自动刷新频率
修改 `app.js` 顶部的常量：
```js
var MIN_REFRESH_INTERVAL = 3000;   // 最小刷新间隔 3秒
var ORDERS_REFRESH_INTERVAL = 8000; // 订单刷新间隔 8秒
```

---

## 变更记录

### v2.2 (当前版本)
- 新增：48款菜品管理系统，统一下拉框点餐，选中自动回显价格
- 新增：菜品管理面板（添加/删除/改名/改价/权重排序），¥前缀价格
- 新增：周月报统计（本周/本月/自定义日期，汇总卡片+人均明细+日期导航）
- 新增：午餐/晚餐自取优惠开关（每单自动 ¥1 减免）
- 新增：全局刷新按钮（黑底白字，保持滚动位置）
- 新增：GitHub Actions 自动部署（push main 即部署到 Retinbox）
- 新增：移动端响应式适配（侧边栏抽屉、表格横向滚动、顶栏自适应）
- 优化：登录页流体渐变动画+毛玻璃卡片，日期范围限制±30天
- 优化：订单数据哈希对比跳过无变化渲染，菜品HTML缓存
- 优化：20:00后自动选择明天午餐，价格步进改为个位数
- 优化：本月所有日期均按午餐/晚餐分组显示
- 变更：移除备注字段，用户管理和菜品管理默认折叠
- 变更：周月报仅管理员可见，订单列表7天→当月，取消自动删除
- 变更：不再限制未来日期提交
- 修复：数据损坏自动重建、旧会话即时清除、价格NaN保护等
- 新增：48款菜品管理系统，统一下拉框点餐，选中自动回显价格
- 新增：菜品管理面板（添加/删除/改名/改价/权重排序）
- 新增：周月报统计（本周/本月/自定义日期，汇总卡片+人均明细+日期导航）
- 新增：全局刷新按钮（黑底白字，保持滚动位置）
- 新增：移动端响应式适配（侧边栏抽屉、表格横向滚动、顶栏自适应）
- 优化：登录页流体渐变动画+毛玻璃卡片，日期点击整栏弹出日历
- 优化：订单数据哈希对比跳过无变化渲染，菜品HTML缓存
- 优化：20:00后自动选择明天午餐，价格步进改为个位数
- 变更：移除备注字段，用户管理和菜品管理默认折叠
- 变更：周月报仅管理员可见，订单列表7天→当月，取消自动删除
- 变更：不再限制未来日期提交，日期导航箭头切换周/月
- 修复：数据损坏自动重建、旧会话即时清除、价格NaN保护等

### v2.1 (当前版本)
- ✅ 新增：管理员可自定义盲盒固定价格（侧边栏设置，实时生效）
- ✅ 美化：下拉框统一自定义箭头样式
- ✅ 美化：侧边栏导航图标统一使用主题蓝色
- ✅ 修复：用户数据损坏时自动重建默认用户（不再永久卡死）
- ✅ 修复：修改密码/重置密码后旧会话立即失效（安全加固）
- ✅ 修复：价格显示 NaN 保护
- ✅ 修复：设置开关网络错误时自动回滚 checkbox 状态
- ✅ 性能：过期订单清理仅在获取订单时执行，不再每次 API 请求都扫全量 KV
- ✅ 性能：获取订单从 O(7×N) 双层循环优化为 O(N) 单次遍历
- ✅ 性能：订单刷新时保持滚动位置
- ✅ 交互：确认对话框激活时自动暂停刷新，防止确认状态因 DOM 重建而丢失
- ✅ 交互：确认对话框状态在 DOM 重建时自动保留，不影响实时数据同步
- ✅ 交互：管理员批量提交增加二次确认（红色按钮 + 5 秒超时自动取消）
- ✅ 交互：Toast 通知最多 3 个，超出自动移除最早的
- ✅ 代码质量：清理未使用的变量和死代码

### v2.0 (当前版本)
- ✅ 记住密码 & 自动登录优化（token过期自动用密码重登）
- ✅ 提交订单 loading 状态 & 防重复提交
- ✅ 今日订单区分午餐/晚餐 & 汇总统计 & 一键复制
- ✅ Toast 通知系统替代 alert
- ✅ 确认操作 loading 动效
- ✅ 午餐/晚餐分别禁止点餐
- ✅ 餐别自动选择（上午午餐/下午晚餐）
- ✅ 编辑订单支持修改餐别

### v1.0
- 基础登录/注册
- 盲盒/自定义点餐
- 管理员批量订餐
- 付款状态管理
- 七日订单历史
- 用户管理 CRUD
- 全局锁定开关
