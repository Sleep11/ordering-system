# 多人在线点餐系统 — 项目文档

> 基于 Retinbox (热铁盒) Web Hosting 的全栈点餐系统。
> 支持多用户、48 款菜品菜单（当前默认数据 47 款，待确认补齐）、午餐/晚餐分时段管理、自取减免、周月报统计。
> GitHub push 自动部署，零运维。

---

## 目录

- [快速开始](#快速开始)
- [系统架构](#系统架构)
- [文件清单](#文件清单)
- [数据存储设计](#数据存储设计)
- [API 接口文档](#api-接口文档)
- [前端架构](#前端架构)
- [功能详解](#功能详解)
- [认证与安全](#认证与安全)
- [部署](#部署)
- [自动部署 (GitHub Actions)](#自动部署-github-actions)
- [数据恢复](#数据恢复)
- [常见维护操作](#常见维护操作)
- [性能与移动端 QA](#性能与移动端-qa)
- [已知限制](#已知限制)
- [下个对话交接](HANDOFF.md)
- [开发规范](#开发规范)
- [常见问题](#常见问题)
- [变更记录](#变更记录)

---

## 快速开始

### 访问地址
`https://bawei.rth1.xyz`

### 默认账号
| 用户名 | 密码 | 角色 |
|--------|------|------|
| 陈立昊 | 123456 | 管理员 |
| 王宇翔 | 123456 | 管理员 |
| 王里庚 | 123456 | 普通用户 |
| 王晨强 | 123456 | 普通用户 |
| 康子阔 | 123456 | 普通用户 |
| 刘彦宏 | 123456 | 普通用户 |
| 卫佳旺 | 123456 | 普通用户 |
| 张晓旭 | 123456 | 普通用户 |
| 韩志芳 | 123456 | 普通用户 |
| 胡昌雨 | 123456 | 普通用户 |

### 餐别自动选择规则
| 时间段 | 日期 | 餐别 |
|--------|------|------|
| 08:00 - 11:30 | 今天 | 午餐 |
| 11:30 - 20:30 | 今天 | 晚餐 |
| 20:30 - 08:00 | 明天 | 午餐 |

---

## 系统架构

```
浏览器 (SPA)
  index.html + styles.css + app.js
    |
    | HTTP POST /api.node.js
    v
Retinbox Node.js 云函数
  api.node.js    — 主路由 (15 个 action)
  auth.node.js   — 认证模块 (密码哈希/会话)
  kv-adapter.node.js — KV 数据库适配层
    |
    v
Retinbox KV 数据库 (database: ordering)
```

- **前端**：原生 HTML/CSS/JS，零框架依赖，~2186 行
- **后端**：Retinbox Node.js 云函数，~1050 行
- **数据库**：Retinbox KV 存储，key-value 结构
- **部署**：GitHub Actions → Deno CLI → Retinbox，全自动

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `index.html` | 主页面：登录页 + 主页面 (侧边栏/点餐/统计/订单/报表/菜品管理/用户管理) |
| `app.js` | 前端核心 (~2186 行)：状态管理、API 调用、UI 渲染、事件处理 |
| `styles.css` | 完整样式系统 (~2000 行)：设计令牌、布局、组件、动效、响应式、移动端 |
| `api.node.js` | 后端 API (~1050 行)：15 个 action 路由 + 认证/订单/用户/菜单/报表 |
| `auth.node.js` | 认证模块：FNV-1a 密码哈希 + Salt + 24h Token 会话 |
| `kv-adapter.node.js` | 数据库抽象层：封装 Retinbox KV API |
| `rth-host.json` | Retinbox 部署配置：site/outdir/build |
| `package.json` | npm 脚本：`npm run deploy` |
| `.github/workflows/deploy.yml` | GitHub Actions：push main 自动部署 |
| `restore.html` | 数据恢复工具：粘贴 KV 备份 JSON 一键恢复 |
| `QA.md` | 深度检测、性能优化和桌面/移动端布局验证记录 |

---

## 数据存储设计

### KV 数据库名：`ordering`

### Key 结构

| Key | 类型 | 说明 |
|-----|------|------|
| `users` | JSON 数组 | 所有用户 (id/name/role/passwordHash/passwordSalt) |
| `session_{hash}` | JSON 对象 | 登录会话 (userId/role/expiresAt)，24h 过期 |
| `order_{date}_{userId}_{mealType}` | JSON 对象 | 单条订单 |
| `settings_order_locked` | Bool 字符串 | 全局修改锁定 |
| `settings_lunch_locked` | Bool 字符串 | 午餐提交锁定 |
| `settings_dinner_locked` | Bool 字符串 | 晚餐提交锁定 |
| `settings_blind_lunch_price` | 数字字符串 | 午餐盲盒价格 (管理员可调) |
| `settings_blind_dinner_price` | 数字字符串 | 晚餐盲盒价格 |
| `settings_lunch_selfpick` | Bool 字符串 | 午餐自取减免开关 |
| `settings_dinner_selfpick` | Bool 字符串 | 晚餐自取减免开关 |
| `settings_menu` | JSON 数组 | 菜品列表 (id/name/price/weight) |
| `settings_order_schema_version` | 字符串 | 订单金额字段自动迁移版本号 |
| `login_fails_{userId}` | 数字 | 登录失败计数 (5 次锁定 15 分钟) |
| `login_lock_{userId}` | JSON | 登录锁定信息 (lockUntil) |

### 订单对象

```json
{
  "id": "order_2026-07-31_user_wangchen_lunch",
  "date": "2026-07-31",
  "userId": "user_wangchen",
  "personName": "王晨强",
  "mealType": "lunch",
  "itemType": "menu",
  "itemName": "炒冷面",
  "price": 14,
  "receivable": 14,
  "discount": 0,
  "actual": 0,
  "refund": 0,
  "refunded": false,
  "refundedAt": null,
  "paid": false,
  "paidAt": null,
  "createdAt": "2026-07-31T04:00:00.000Z",
  "updatedAt": "2026-07-31T04:00:00.000Z",
  "note": ""
}
```

### 菜品对象

```json
{
  "id": "m001",
  "name": "炒冷面",
  "price": 14,
  "weight": 100
}
```

权重越高排序越靠前，管理员可在菜品管理面板中调整。

当前 `getDefaultMenu()` 实际返回 `m001` 至 `m047` 共 47 款，需求为 48 款；缺第 48 款菜名、价格和权重，需确认后补充，未擅自新增菜品。

### 订单金额字段

| 字段 | 含义 |
|---|---|
| `price` | 餐品原价 |
| `items` | 餐食明细数组，每项包含 menuId/name/price/quantity |
| `quantity` | 订单总份数 |
| `receivable` | 应收金额，默认等于原价，自取减免开启后减 1 |
| `discount` | 减免金额，午餐/晚餐自取减免为 1，否则为 0 |
| `actual` | 实收金额，已付款时保持原价，不随减免变化；未付款时为 0 |
| `refund` | 退款金额，已付款且享受减免时为 1，否则为 0 |
| `refunded` | 是否已退款，管理员点击退款后变为 true |
| `refundedAt` | 退款时间 |

部署新版本后，后端会在首次请求时自动执行一次订单字段迁移；之后管理员切换当日午餐/晚餐自取减免时，也会自动重算当天对应餐别的订单金额。

### 提示码

所有右下角 Toast 都会生成唯一提示码，格式为 `MSG-XXXX`，并带“复制”按钮。用户反馈问题时复制提示码即可快速定位对应提示来源。

---

## API 接口文档

- **入口**: `POST /api.node.js`
- **Content-Type**: `application/x-www-form-urlencoded`
- **认证**: Header `Authorization: Bearer <token>` 或 POST 参数 `token`
- **缓存**: 所有响应带 `Cache-Control: no-store`，浏览器不缓存

### 通用响应格式

```json
{ "success": true/false, "message": "...", "data": { ... } }
```

### 接口列表

#### 认证类

| action | 说明 | 权限 | 关键参数 |
|--------|------|------|----------|
| `login` | 登录 | - | username, password |
| `logout` | 登出 | - | (token) |
| `me` | 当前用户 | 登录 | - |
| `change-password` | 修改密码 | 登录 | oldPassword, newPassword |

#### 用户类

| action | 说明 | 权限 | 关键参数 |
|--------|------|------|----------|
| `get-users` | 用户列表 | 登录 | - |
| `create-user` | 添加用户 | admin | username, role |
| `delete-user` | 删除用户 | admin | userId |
| `reset-password` | 重置密码为 123456 | admin | userId |

#### 订单类

| action | 说明 | 权限 | 关键参数 |
|--------|------|------|----------|
| `get-orders` | 当月订单 | 登录 | - |
| `create-order` | 创建/修改 | 登录* | date, mealType, itemType, menuId, userId† |
| `delete-order` | 删除单条 | 登录* | orderId |
| `delete-orders-by-date` | 删除当天全部 | admin | date |
| `update-payment` | 切换付款 | admin | orderId, paid |
| `refund-order` | 标记订单已退款 | admin | orderId |

*普通用户仅可操作自己，系统锁定时受限；†仅 admin 可为他人订餐

#### 菜品类

| action | 说明 | 权限 | 关键参数 |
|--------|------|------|----------|
| `get-menu` | 获取菜品列表 | 登录 | - (返回按权重排序) |
| `update-menu` | 更新菜品 | admin | menu (JSON 数组) |

#### 统计类

| action | 说明 | 权限 | 关键参数 |
|--------|------|------|----------|
| `get-report` | 周月报 | 登录 | type(week/month), from, to |
| `get-settings` | 系统设置 | 登录 | - |
| `update-settings` | 更新设置 | admin | key, value |

#### 恢复类

| action | 说明 | 权限 | 关键参数 |
|--------|------|------|----------|
| `restore-kv` | 批量恢复 KV | admin | records (JSON 数组) |

### 错误码

| HTTP | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 参数错误 / 菜品缺少字段 |
| 401 | 未登录 / 密码错误 |
| 403 | 无权限 / 锁定 |
| 404 | 资源不存在 |
| 429 | 登录锁定 (5 次失败，15 分钟) |
| 500 | 服务器错误 |
| 503 | KV 读取失败 |

---

## 前端架构

### 状态变量

```js
var token = null;              // 登录令牌
var currentUser = null;        // 当前用户 {id, name, role}
var allUsers = [];             // 用户列表
var allOrders = [];            // 订单列表
var dishItems = [];            // 菜品列表
var settings = {};             // 系统设置
var lunchSelfPick = false;     // 午餐自取减免
var dinnerSelfPick = false;    // 晚餐自取减免
var blindLunchPrice = 11;      // 午餐盲盒价
var blindDinnerPrice = 12;     // 晚餐盲盒价
var APP_VERSION = '2.5.1.9';   // 版本号（四位）
```

### 数据流

```
登录 → showMainPage()
  ├── loadSettings()    → settings, 自取状态, 盲盒价格
  ├── loadDishes()      → dishItems, 填充菜单下拉框
  ├── loadAllData()     → get-orders → allOrders → renderAll()
  │     ├── updateTodayStats()  → 今日统计 (含自取减免)
  │     └── renderOrders()     → 本月订单 (午/晚餐分组)
  └── loadReport('week') → 本周报表 (仅管理员)
```

### 自动刷新

| 机制 | 说明 |
|------|------|
| 8 秒定时 | `ORDERS_REFRESH_INTERVAL = 8000` |
| 数据哈希 | `JSON.stringify` 对比，未变化跳过 DOM 渲染 |
| 确认保护 | 确认对话框打开时自动恢复状态 |
| 滚动保持 | `mainContent.scrollTop` 保存/恢复 |
| 提交阻塞 | `isBatchSubmitting=true` 时暂停 |
| 菜单缓存 | `menuOptsCache` 避免重复构建 option HTML |

### 页面结构

```
loginPage          — 流体渐变登录页
mainPage           — 主页面
├── topbar         — 顶栏 (用户/角色/版本号/修改密码/刷新/退出)
├── sidebar        — 侧边栏 (管理员)
│   ├── 导航        — 点餐/统计/订单/周月报/用户管理
│   ├── 系统设置    — 全局锁定 + 午/晚餐锁定
│   ├── 盲盒价格    — 午/晚餐盲盒价格输入
│   └── 菜品管理    — 添加/删除/改名/改价/权重 (默认折叠)
├── section-order  — 点餐登记
├── section-stats  — 今日统计 (含自取减免药丸)
├── section-orders — 本月订单 (午/晚餐分组)
├── section-report — 周月报 (仅管理员)
├── section-dish   — 菜品管理面板
├── section-admin  — 用户管理 (默认折叠)
passwordModal      — 修改密码弹窗
editOrderModal     — 编辑订单弹窗
toastContainer     — Toast 通知 (最多 3 个)
```

### 管理员 vs 普通用户

| 功能 | 管理员 | 普通用户 |
|------|--------|----------|
| 给自己订餐 | ✓ | ✓ |
| 给他人订餐 | ✓ (批量) | ✗ |
| 修改/删除自己订单 | ✓ | ✓ (未锁定时) |
| 修改/删除他人订单 | ✓ | ✗ |
| 标记付款 | ✓ | ✗ |
| 管理用户 | ✓ | ✗ |
| 系统设置 | ✓ | ✗ |
| 菜品管理 | ✓ | ✗ |
| 周月报 | ✓ | ✗ |
| 自取减免开关 | ✓ | ✗ |
| 今日统计 | ✓ | ✓ |
| 本月订单 | ✓ | ✓ |
| 侧边栏 | ✓ | ✗ |

---

## 功能详解

### 点餐登记
- **单人**：日期 + 餐别 + 餐食下拉框 + 数量加减
- **批量 (管理员)**：订餐列表勾选用户 → 可添加多行餐食 → 每行独立选择名称和数量 → 二次确认 → 串行提交
- **日期范围**：±30 天，点击日期栏任意处弹出日历

### 今日统计
- 订单总数、已付/未付数量及金额
- 自取减免药丸按钮 (标题同行，选中蓝底)
- 开启后当天对应餐别每单自动 -¥1

### 本月订单
- 按日期分组，每天内按午餐/晚餐分组
- 餐品汇总 + 一键复制
- 修改餐品/标记付款/删除 (带确认对话框)
- 确认框在 8 秒刷新期间自动保持状态

### 菜品管理 (管理员)
- 添加/删除/改名/改价/调权重
- 菜品下拉框 ¥ 前缀价格显示
- 权重高排前面
- 点击"保存菜品"即时生效

### 周月报 (管理员)
- 本周/本月/自定义日期范围
- 汇总卡片 (订单数、午/晚餐数、总/已付/未付金额)
- 人均明细表 (姓名/订单数/已付/金额)
- 登录自动加载本周数据

### 登录页
- 蓝橙流体渐变背景 (15s 循环动画)
- 毛玻璃卡片 (backdrop-filter blur)
- 青紫渐变图标/按钮/标题
- 记住密码自动登录 (登录中脉冲动画)
- 页面切换 0.65s 淡入淡出

---

## 认证与安全

### 密码处理
- 算法：FNV-1a 变体 × 4 轮 × 10000 次迭代 = 64 字符哈希
- Salt：`crypto.getRandomValues` 生成 32 字符随机盐
- 默认密码：`123456`

### 会话管理
- Token：64 字符随机令牌
- 存储：Token 哈希后 40 字符作为 KV key
- 过期：24 小时自动过期
- 修改密码/重置密码：立即清除所有旧会话

### 登录保护
- 5 次失败 → 锁定 15 分钟
- 失败计数异常不影响登录流程 (静默忽略)

### XSS 防护
- 所有用户输入通过 `escapeHtml()` 转义
- 禁止 Base64 编码

---

## 部署

### 平台要求
- Retinbox Web Hosting 账号
- Deno >= 2.8.0

### 本地部署

```bash
# 安装 Deno
# 首次配置 (交互式，会自动检测项目设置)
deno -Ar https://host.retiehe.com/cli init

# 一键部署
npm run deploy

# 云函数热更新 (文件保存即部署)
deno -Ar https://host.retiehe.com/cli watch
```

### 配置文件

**rth-host.json**:
```json
{
  "build": "",
  "outdir": ".",
  "site": "bawei"
}
```
- `build`: 留空 (纯静态项目无需构建)
- `outdir`: `"."` 部署根目录全部文件
- `site`: Retinbox 站点名 (免费域名仅填子域名)

**package.json**:
```json
{
  "scripts": {
    "deploy": "deno -Ar https://host.retiehe.com/cli deploy"
  }
}
```

---

## 自动部署 (GitHub Actions)

每次 push 到 main 分支，自动部署到 Retinbox。

### 工作流 (`.github/workflows/deploy.yml`)
1. checkout 代码
2. 安装 Deno 2.8.0
3. 读取 `RTH_API_KEY` secret
4. 执行 `deno -Ar https://host.retiehe.com/cli deploy`
5. CLI 读取 `rth-host.json` 配置
6. 打包上传所有文件到 Retinbox

### 配置步骤
1. Retinbox 管理页 → API 密钥 → 新建密钥 → 复制
2. GitHub → Settings → Secrets → Actions → New secret
   - Name: `RTH_API_KEY`
   - Value: 粘贴密钥 (不要有多余换行)
3. 修改 `rth-host.json` 中的 `site` 为实际站点名
4. Push 到 main 即触发

### 版本号管理
- `index.html` 中 CSS/JS 引用带 `?v=版本号` 参数
- `app.js` 中 `APP_VERSION` 常量
- 版本号必须为四位，例如 `2.5.1.1`
- 每次修改代码或文档后必须递增最后一位，并同步更新 `app.js`、`index.html`、README、QA
- 每次提交都必须包含版本更新；大版本更新可以跳号，由维护者决定跳法
- 部署后查看顶部栏徽章确认版本

---

## 数据恢复

### 自动恢复
- 用户数据丢失 → `initDefaultUsers` 自动重建 10 个默认用户
- 菜品数据丢失 → `getMenu` 自动重建 48 款默认菜品

### 手动恢复 (从备份)
1. 先在主页面登录管理员账号
2. 部署完成后访问 `https://你的域名/restore.html`
3. 用记事本打开 `bawei-kv.json`，全选复制
4. 粘贴到恢复工具页面文本框
5. 点击"恢复数据"
6. 等待提示"已恢复 N 条数据"
7. 刷新主页面，数据全部恢复

恢复的数据包括：用户、订单、菜品菜单、系统设置、登录会话。

---

## 常见维护操作

### 添加新用户
管理员 → 侧边栏「用户管理」→ 输入用户名 → 选择角色 → 添加。默认密码 `123456`。

### 重置密码
管理员 → 用户管理 → 目标用户 → 重置密码 → 确认为 `123456`。

### 管理菜品
管理员 → 侧边栏「菜品管理」(默认折叠，点击展开)：
- 添加：点「+ 添加餐品」
- 改名：直接修改名称输入框
- 改价：修改价格输入框 (¥ 前缀)
- 调顺序：修改权重数字 (越大越靠前)
- 删除：点 × 按钮
- 生效：价格失焦自动保存，也可点「保存菜品」

### 锁定点餐
- 全局锁定：侧边栏「禁止用户修改餐品」(阻止修改/删除，仍可提交)
- 午餐/晚餐锁定：阻止对应餐别的新订单提交

### 修改盲盒价格
侧边栏 → 午餐/晚餐盲盒价格输入框 → 失焦或回车生效。

### 自取减免
今日统计标题右侧药丸按钮 → 点击切换 → 当天对应餐别每单自动 -¥1。

### 调整刷新频率
修改 `app.js` 顶部常量：
```js
var ORDERS_REFRESH_INTERVAL = 8000;   // 默认 8 秒
var MIN_REFRESH_INTERVAL = 3000;       // 最小间隔 3 秒
var USERS_REFRESH_INTERVAL = 30000;    // 管理员用户列表刷新间隔
```

---

## 性能与移动端 QA

### 性能优化
- 管理员用户列表改为 30 秒限频，不再随 8 秒订单刷新重复请求。
- 菜品保存增加签名去重，价格失焦自动保存后，再点“保存菜品”不会重复提交。
- 订单和报表的 KV 读取改为每批 10 条并发读取，避免大量订单时逐条串行等待。
- 8 秒订单自动刷新仍保留哈希对比，数据未变化时跳过 DOM 重建。
- 清理了 CSS 中重复的移动端规则和已移除的 `col-note` 样式。

### 桌面与移动端验证
- 桌面：1440×900 无横向溢出，顶栏、侧边栏、面板、批量表格布局正常。
- 移动端：390×844 和 320×568 均无页面横向溢出。
- 320px 下“今日统计”标题与自取按钮自动换行，按钮占满标题栏第二行，避免被面板裁剪。
- 批量表格在移动端使用 `overflow-x: auto`，列宽不足时表格内部横向滚动。
- 移动端表单控件字号调整为 16px，降低 iOS 聚焦时自动放大页面。
- HTML `label for` 已修正，移除缺失 `</head>` 问题。

### 验证命令
```bash
node --check app.js
node --check api.node.js
node --check auth.node.js
node --check kv-adapter.node.js
```
完整 Playwright 回归记录见 [QA.md](QA.md)。

---

## 已知限制
- Retinbox 平台会覆盖 API 的 `Cache-Control` 响应头，线上实测为 `private, max-age=1`，不是代码设置的 `no-store`；若要求严格 no-store 需联系 Retinbox 支持。
- Retinbox 会把静态资源 URL 重写为 CDN 哈希地址，原始 `?v=版本号` 参数不会出现在最终 HTML；版本号仍通过顶部徽章和 CDN URL 变化体现。
- “记住密码”目前把明文密码保存在浏览器 `localStorage`，存在本机泄露风险；如要彻底改善，需要改为服务端可撤销的刷新令牌方案。
- `bawei-kv.json` 含用户密码哈希、会话和订单数据，已加入 `.gitignore`，不应提交到 Git。
- 仓库 `origin` 当前仍嵌入 GitHub token，建议尽快改回普通 HTTPS remote，并撤销该 token。

---

## 开发规范

### Git 提交
- 提交信息必须以当前版本号开头，例如 `v2.5.1.1: fix order list price`。
- 版本号必须为四位，每次变更递增最后一位。
- 每次提交都必须更新版本号；重大更新可以跳号，由维护者决定。
- 修改代码前先同步 `app.js`、`index.html`、README、QA 中的版本号。
- 禁止提交 `.env`、`bawei-kv.json` 等敏感文件。

### 下个对话规则
- 用户说“去下个对话 / 下一个对话 / 去一下个对话”时，自动更新 README、QA、HANDOFF。
- 自动递增版本号最后一位并同步到 `app.js`、`index.html`、README、QA。
- 自动提交、推送 `main`、等待部署成功、同步并推送 `bugfix`。
- 最后给出下个对话的起始问题。

### 前端
- 纯原生 JS，零框架依赖
- 全局状态变量集中顶部声明
- DOM 操作优先事件委托，避免全量 `innerHTML` 重建
- 哈希对比跳过无变化渲染
- Toast 最多 3 个，超出自动移除
- 确认对话框自动状态保持

### 后端
- 云函数使用 Retinbox Node.js 环境
- 无 npm 包支持，仅内置模块
- API 统一 `sendJSON()` 响应
- KV 读写通过 `kv-adapter.node.js` 抽象层
- 权限在 API 层校验，不信任前端

### 数据安全
- 禁止 Base64 编码
- 所有用户输入 `escapeHtml()` 转义
- 密码 SHA 哈希 + Salt 存储
- Token 加密存储，修改密码立即清除
- API 响应 `Cache-Control: no-store`

### 兼容性
- 浏览器：Chrome/Edge/Safari 最新版
- 移动端：≤768px 响应式布局
- 云函数：Retinbox Node.js 环境

---

## 常见问题

### 网站显示旧版本
Ctrl+Shift+R 强制刷新。如果仍不行，检查顶部栏版本号是否最新。版本号没变说明部署未完成。

### 订单提交失败
1. 确认菜品下拉框有选项 (等待菜单加载)
2. 已选择菜品 (menuId 不为空)
3. 日期在 ±30 天范围内

### 保存菜品失败
1. 确认至少有一个菜品
2. 名称不为空，价格为有效数字
3. 检查网络连接，查看 toast 提示

### 数据丢失
1. 检查 Retinbox 管理后台 KV 数据库状态
2. 使用 restore.html 从备份恢复
3. 系统会自动重建默认用户和菜品

### 部署失败
1. 确认 `RTH_API_KEY` secret 设置正确 (无多余换行)
2. 确认 `rth-host.json` site 名称正确
3. 查看 GitHub Actions 日志

### 缓存问题
- 静态文件：`?v=版本号` 参数强制刷新
- API 数据：`Cache-Control: no-store` 禁止缓存
- HTML：`<meta>` no-cache 标签
- 每次更新代码务必同步更新版本号

---

## 变更记录

### v2.5.1.9 (2026-08-01)
- 美化：侧边栏系统设置去除表情符号，标签加粗，单行紧凑排列
- 修复：handleClearAllOrders 密码验证改用 auth.verifyPassword，不再明文比较
- 优化：侧边栏 CSS 精简，移除冗余设置项描述文字

### v2.5.1.8 (2026-08-01)
- 修复：恢复被误删的 .money-item .money-label CSS 桌面端样式，价格列正常显示
- 修复：MSG-VVG2 - handleUpdateMenu 增加兜底解析，兼容多种 body 格式
- 优化：批量订餐表格默认选项改为盲盒，新用户自动选中
- 优化：日期判断改用标准 UTC+8 计算，修正跨日边界问题
- 新增：管理员顶部栏「清除订单」按钮，需二次确认 + 密码验证
- 新增：api.node.js clear-all-orders 端点，删除全部 order_ 数据

### v2.5.1.7 (2026-08-01)
- 规则：新增"优化"触发规则，说"优化"时自动优化双端样式、友好提示、性能
- 文档：AGENTS.md 新增 Optimization Rule 章节

### v2.5.1.6 (2026-07-31)
- 规则：新增"测试"触发规则，说"测试"时自动深度检查并修复，然后提交部署
- 文档：AGENTS.md 新增 Deep Test Rule 章节

### v2.5.1.5 (2026-07-31)
- 规则：收到“去下个对话”触发词
- 文档：README、QA、HANDOFF 自动更新
- 更新：版本号升级到 `v2.5.1.5`

### v2.5.1.3 (2026-07-31)
- 规则：每次提交必须更新版本号
- 规则：大更新可以跳号，由维护者决定
- 文档：README、QA、HANDOFF 同步更新
- 更新：版本号升级到 `v2.5.1.3`

### v2.5.1.2 (2026-07-31)
- 规则：新增“下个对话”自动交接规则
- 文档：README、QA、HANDOFF 同步更新
- 更新：版本号升级到 `v2.5.1.2`

### v2.5.1.1 (2026-07-31)
- 修复：订单列表恢复原价展示，并压缩行高
- 修复：菜品管理增删后立即同步订餐列表下拉框
- 修复：保存菜品增加 `menuJson` 兜底，解决 `MSG-VVG2`
- 优化：侧边栏进一步缩窄到 200px，主内容区加宽到 1280px
- 规则：版本号改为四位 `x.y.z.n`，每次变更递增最后一位
- 更新：版本号升级到 `v2.5.1.1`

### v2.5.1 (2026-07-31)
- 修复：周月报金额改用订单应收/实收，正确反映减免和退款
- 修复：编辑多餐食订单时保留原有餐食明细，不再被单餐食覆盖
- 优化：深度检查后补充多餐食、金额、报表和双端布局回归
- 更新：版本号升级到 `v2.5.1`

### v2.5.0 (2026-07-31)
- 优化：侧边栏宽度调整为 220px，主内容区最大宽度放大到 1120px
- 新增：订餐列表支持同一人添加多份/多种餐食
- 新增：批量订单和单人订单数量加减按钮，默认 1 份
- 新增：订单明细支持多餐食展示，个人汇总按明细份数统计
- 优化：餐品下拉框只显示名称，不再带价格
- 优化：订餐列表价格框加大，数量控件与价格分行展示
- 优化：今日统计卡片压缩为单行横向滚动
- 优化：菜品管理列表支持内部滚动查看全部菜品
- 优化：双端布局和移动端体验
- 约束：Git 提交信息必须以当前版本号开头
- 更新：订单自动迁移升级到 `order_schema_v3`，补充 `items/quantity`
- 更新：版本号升级到 `v2.5.0`

### v2.4.1 (2026-07-31)
- 修复：保存菜品 `MSG-VVG2` 菜单数据格式错误，兼容 Retinbox 多种请求体结构
- 新增：页面发生增删改后立即刷新，不再受 3 秒刷新间隔影响
- 优化：订单应收/实收/减免/退款金额进一步放大加粗并增加间距
- 优化：双端菜品管理和订单金额展示
- 更新：版本号升级到 `v2.4.1`

### v2.4.0 (2026-07-31)
- 新增：订单退款按钮和“已退款”状态
- 新增：订单应收/实收/减免/退款横向展示，金额放大加粗并按语义着色
- 优化：实收金额固定为原价，切换自取减免时不再改变实收
- 新增：所有 Toast 唯一提示码 `MSG-XXXX` 和复制按钮
- 优化：菜品管理名称/价格/权重三栏布局，限制名称输入框宽度
- 修复：保存菜品接口继续兼容 JSON 字符串表单提交
- 更新：订单自动迁移升级到 `order_schema_v2`，补充 `refunded` 字段
- 更新：版本号升级到 `v2.4.0`

### v2.3.9 (2026-07-31)
- 新增：订单金额字段 `receivable`、`discount`、`actual`、`refund`
- 新增：部署后自动执行订单字段数据库迁移
- 新增：切换当日午餐/晚餐自取减免时自动重算当天订单并更新退款
- 新增：今日统计退款金额卡片
- 订单卡片显示应收、减免、实收、退款
- 修复：保存菜品 `菜单数据格式错误`，后端兼容表单提交的 JSON 字符串
- 优化：菜品管理名称输入框不再无限拉伸
- 优化：右下角 Toast 停留时间延长到 4.5 秒，错误提示 6 秒
- 更新：版本号升级到 `v2.3.9`

### v2.3.8 (2026-07-31)
- 性能：管理员用户列表 30 秒限频
- 性能：菜品保存签名去重，避免重复请求
- 性能：订单/报表 KV 读取改为每批 10 条并发
- 修复：保存菜品时保留已有 `note` 字段
- 移动端：320px 下自取按钮自动换行/满宽
- 移动端：表单控件 16px，降低 iOS 聚焦缩放
- 清理：移除 CSS 重复规则和无效 `col-note` 样式
- 修复：HTML `label for` 关联和缺失 `</head>`
- 文档：新增性能、移动端 QA 和已知限制说明
- 更新：版本号升级到 `v2.3.8`

### v2.3.7 (2026-07-31)
- 修复：登录后因已移除的 `singleNoteGroup` 引用导致主页面初始化中断，日期/餐别/菜品/刷新均未加载
- 修复：全局刷新按钮监听器被误放在退出登录回调内
- 修复：版本号只在退出时才刷新、普通用户仍可见版本徽章
- 修复：餐别自动选择改用中国时区分钟，避免受浏览器时区影响
- 修复：自取减免按钮在今日无订单时也保持管理员可见
- 修复：菜品管理默认折叠，价格失焦自动保存
- 优化：移动端批量表格改为横向滚动
- 修复：restore.html 自动携带主页面登录 token，避免恢复接口 403
- 更新：版本号升级到 `v2.3.7`

### v2.3 (2026-07-31)
- 新增：版本号徽章 + 缓存刷新 `?v=` 参数 + HTML no-cache meta
- 新增：API no-store 响应头，杜绝数据缓存
- 新增：GitHub Actions 自动部署
- 新增：午餐/晚餐自取减免药丸按钮 (每单 ¥1，统计标题同行)
- 新增：KV 数据恢复接口 + restore.html 恢复工具
- 新增：本月所有日期午餐/晚餐分组显示
- 优化：餐别按分钟精度 (8:00-11:30/11:30-20:30/20:30-8:00)
- 优化：保存菜品空数据校验 + toast
- 优化：移动端顶栏/自取按钮/表格自适应
- 变更：日期范围 ±30 天
- 变更：自取按钮从下方移到标题行，改为药丸样式

### v2.2
- 48 款菜品管理系统，统一下拉框点餐
- 菜品管理面板 (添加/删除/改名/改价/权重)
- 周月报统计 (汇总卡片 + 人均明细 + 日期导航)
- 全局刷新按钮，登录页流体渐变动画
- 订单数据哈希跳过无变化渲染，菜品 HTML 缓存
- 移除备注字段，用户管理/菜品管理默认折叠
- 周月报仅管理员可见，订单 7 天→当月

### v2.1
- 管理员自定义盲盒价格，下拉框美化
- 确认框状态保留 (不拦截刷新)
- 批量提交二次确认，Toast 数量限制

### v2.0
- 记住密码自动登录，早/晚分时段锁
- 今日订单午餐/晚餐分组 + 汇总 + 复制
- Toast 替代 alert，loading 动效
- 餐别自动选择，编辑支持修改餐别
- 批量提交串行进度

### v1.0
- 基础登录/注册，盲盒/自定义点餐
- 管理员批量订餐，付款状态管理
- 七日订单历史，用户管理 CRUD
- 全局锁定开关
