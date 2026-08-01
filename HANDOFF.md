# 多人在线点餐系统 — 下个对话交接文档

> v3.0.0.18  |  2026-08-01  |  https://bawei.rth1.xyz

---

## 一句话介绍

基于 Retinbox Web Hosting 的全栈多人在线点餐系统。Vue 3 前端 + Node.js 云函数后端 + KV 数据库，GitHub push 自动部署。

---

## 技术架构

| 层 | 技术 | 关键文件 |
|---|---|---|
| 前端框架 | Vue 3 Composition API + `<script setup>` | `src/` 目录 |
| 状态管理 | Pinia (5 个 store) | `src/stores/` |
| 路由 | Vue Router 4 (hash 模式 `#/`) | `src/router/index.js` |
| 构建工具 | Vite 5 | `vite.config.js` |
| CSS | 全局 main.css + scoped 组件样式 | `src/styles/main.css` |
| 后端 | Node.js 云函数 (`.node.js`) | `api.node.js` + `auth.node.js` |
| 数据库 | Retinbox KV (Database "ordering") | `kv-adapter.node.js` |
| 部署 | GitHub Actions → Retinbox CLI | `.github/workflows/deploy.yml` |

## GitHub 自动部署流程

```
git push main
  → GitHub Actions 触发
    → checkout 代码
    → setup Node.js 20
    → npm ci（精确安装依赖）
    → npm run build（Vite 构建 → dist/）
    → setup Deno 2.8
    → deno CLI deploy（读取 rth-host.json → 上传 dist/ 目录到 Retinbox）
```

### 关键配置

**`rth-host.json`**（部署配置）：
```json
{ "outdir": "dist", "site": "bawei" }
```
- `outdir: "dist"` — Vite 构建输出目录
- `site: "bawei"` — 站点子域名，对应 `https://bawei.rth1.xyz`
- 注意：**没有 `build` 字段**，因为已在 GitHub Actions 中显式执行 `npm run build`

**`vite.config.js`**（构建配置）：
- `closeBundle` 钩子自动复制 `api.node.js` / `auth.node.js` / `kv-adapter.node.js` / `restore.html` 到 `dist/`

**`.github/workflows/deploy.yml`**：
```yaml
steps:
  - checkout
  - setup-node@v4 (node 20)
  - npm ci
  - npm run build
  - setup-deno@v2 (2.8.0)
  - deno deploy (RTH_API_KEY from GitHub Secrets)
```

## 用户的核心要求

### 代码与工程规范
1. **正确性第一** — 数据安全 > 一致性 > 可维护性 > 性能 > 扩展性 > 开发效率 > 代码简洁度
2. **改代码前先查源码、配置、日志**，不允许猜测或虚构，不确定就明确说明
3. **每次改代码必须递增版本号**（四位 `x.y.z.n`），同步到 `Vue TopBar.vue`/`index.html`/`README.md`/`QA.md`
4. **提交信息以版本号开头**，如 `v3.0.0.18: fix order list price`
5. **不提交** `bawei-kv.json`、`.env`、`node_modules`、`dist`、`.reasonix`
6. **所有 API 响应必须有 `code` 唯一错误码**（格式 `CATEGORY-NNNN`），用户可复制排查
7. **Retinbox 兼容性优先** — 不要建议其他平台，有问题先查 Retinbox 官方文档
8. **前端尽量保持已有样式不动**，不做大幅 UI 重设计

### 技术栈与架构
9. **前端**：Vue 3 Composition API + Pinia + Vue Router (hash 模式) + Vite 5（已迁移完成）
10. **后端**：Node.js 云函数 `.node.js`（PHP 不可用，该站点未开通 PHP 支持）
11. **数据库**：Retinbox KV `Database("ordering")`，key 命名保持 `order_`/`user_`/`settings_` 前缀
12. **密码哈希**：FNV-1a 迭代 40000 次 + 32 位 hex salt（`auth.node.js`），不可换算法
13. **会话管理**：随机 token 存入 KV（`session_` 前缀），24h 过期，修改密码后清除所有会话

### 业务逻辑
14. **点餐日期默认**：8:00-11:29 午餐 / 11:30-20:29 晚餐 / 20:30-次日 7:59 明天午餐（中国时区 UTC+8）
15. **自取减免**：当天午餐/晚餐减 1 元（管理员在"今日统计"面板切换）
16. **餐别锁定**：管理员可禁止普通用户在特定餐别提交/修改订单
17. **盲盒默认**：批量订餐表格新行自动选中"盲盒"，价格从侧边栏盲盒价格设置读取
18. **订单金额五列**：价格、应收、减免、实收、退款，各列需有颜色区分
19. **自动刷新**：订单 8s / 用户列表 30s，页面隐藏时暂停

### UI/UX
20. **样式蓝色系**：`--primary: #2563eb`，保持现有 CSS 变量体系
21. **移动端断点**：768px / 480px / 360px，交互元素触控区域 ≥44px
22. **侧边栏**：仅管理员可见，宽度 180px，设置项文字不能截断
23. **折叠面板**：菜品管理/用户管理默认展开；**仅订单列表内的午餐/晚餐分组可折叠**
24. **二次确认**：删除订单/删除用户/清除全部订单 → 先显示确认按钮 → 再执行
25. **清除全部订单**：顶部栏管理员专属按钮，需二次点击 + 输入当前管理员密码验证
26. **批量提交订单**：首次点击"提交订单"→ 按钮变"确认提交"（红色）→ 再次点击才执行

### 对话与工具
27. **信息来源优先级**：源码 > 官方文档 > 实际配置 > 完整日志 > 数据库运行状态 > 用户描述
28. **多方案排序**：推荐 / 备选 / 不推荐，并说明依据、优缺点、适用场景
29. **涉及数据修改**：必须先提示风险、验证方式、回滚方案
30. **Bug 排查 6 步**：现象 → 高概率原因排序 → 验证方法 → 确认根因 → 修复方案 → 回归验证
31. **先定位根因**，不在根因未确认前大范围改代码
32. **回答风格**：先结论，再方案/代码/验证，冷静专业直接，默认简体中文

## 触发词规则

| 触发词 | 自动执行的操作 |
|---|---|
| "测试" / "深度测试" | 跑 `node --check` + CSS/HTML 检查 + 版本号校验 → 修复 → 提交部署 |
| "优化" / "优化一下" | 双端样式 + 友好提示 + 性能 → 修复 → 提交部署 |
| "去下个对话" | 更新 README/QA/HANDOFF → 版本号 +1 → 提交推送 main + bugfix |

## AI 行为规则

1. **Plan Mode 时只探索不修改**，最终输出 `<proposed_plan>` 块
2. **Default Mode 时直接实现**，不过度计划
3. **信息来源优先级**：源码 > 官方文档 > 配置 > 日志 > 用户描述
4. **回答风格**：先结论，再方案/代码/验证。冷静、专业、工程化
5. **默认使用简体中文**回复，代码标识符保持英文

## 项目文件清单

```
rth/
├── src/                          # Vue 3 前端源码
│   ├── main.js                   # 入口
│   ├── App.vue                   # 根组件（登录态切换）
│   ├── router/index.js           # 路由（6 个页面）
│   ├── stores/                   # Pinia
│   │   ├── auth.js               # 认证状态
│   │   ├── orders.js             # 订单 + 8s 自动刷新
│   │   ├── dishes.js             # 菜单管理
│   │   ├── settings.js           # 系统设置
│   │   └── users.js              # 用户列表
│   ├── utils/                    # 工具
│   │   ├── api.js                # fetch 封装
│   │   ├── format.js             # 价格/订单格式化
│   │   └── china-date.js         # 中国时区计算
│   ├── components/
│   │   ├── login/LoginPage.vue
│   │   ├── layout/{TopBar,Sidebar,MainLayout,ToastContainer}.vue
│   │   ├── order/OrderPanel.vue
│   │   ├── stats/StatsPanel.vue
│   │   ├── orders/OrdersPanel.vue
│   │   ├── report/ReportPanel.vue
│   │   ├── admin/{DishManager,UserManager}.vue
│   │   └── modals/{PasswordModal,EditOrderModal}.vue
│   └── styles/main.css           # 全局样式（2403 行）
├── api.node.js                   # 后端 API（21 个端点）
├── auth.node.js                  # 认证模块（FNV-1a 密码哈希）
├── kv-adapter.node.js            # KV 数据库适配器
├── public/restore.html           # 数据恢复页
├── index.html                    # Vite HTML 入口
├── vite.config.js                # Vite 构建配置
├── package.json                  # 依赖 (Vue/Pinia/Router/Vite)
├── rth-host.json                 # Retinbox 部署配置
├── .github/workflows/deploy.yml  # CI/CD
├── AGENTS.md                     # AI 行为规则
├── README.md                     # 项目文档 + 错误码表
├── QA.md                         # QA 检测记录
└── HANDOFF.md                    # 本文件
```

## API 端点（21 个）

全部在 `api.node.js` 中，`action` 参数区分：

- `login/logout/me/change-password`（认证）
- `get-users/create-user/delete-user/reset-password`（用户管理）
- `get-orders/create-order/delete-order/delete-orders-by-date`（订单）
- `update-payment/refund-order`（付款退款）
- `get-settings/update-settings`（设置）
- `get-report`（报表）
- `get-menu/update-menu`（菜单）
- `clear-all-orders`（清除全部订单，需密码二次确认）
- `restore-kv`（KV 数据恢复）

请求格式：`POST` + `Content-Type: application/x-www-form-urlencoded`
响应格式：`{ success, code, data?, message }`

## 错误码速查

| 类别 | 常见码 |
|---|---|
| AUTH | 0001 未登录, 0004 密码错误, 0011 旧密码错误, 0014 二次密码错误 |
| USER | 0001 不存在, 0004 已存在, 0006 读取失败 |
| ORDER | 0002 缺日期餐别, 0004 未选餐品, 0013/0014 餐别锁定, 0019 不存在 |
| MENU | 0001 餐品不存在, 0003 格式错误, 0004 缺字段 |
| SETTING | 0001 key 为空 |
| SYS | 0001 未知操作, 9999 服务器错误 |

详见 README.md § API 错误码表。



## 已知踩坑记录

| 问题 | 原因 | 解决 |
|---|---|---|
| PHP `require_once` 跨文件失败 | Retinbox PHP 云函数路径解析问题 | 合并为单文件 api.php |
| PHP 密码验证永远失败 | FNV-1a 在 PHP 中的 32 位有符号乘法与 JS `Math.imul` 不一致 | 保留 Node.js 后端 |
| PHP `.php` 文件返回 Vue HTML | 该 Retinbox 站点未开通 PHP 云函数支持 | 使用 `.node.js` |
| 部署后只有 HTML 无 JS/CSS | GitHub Actions 缺少 `npm ci` 和 `npm run build` | 在 workflow 中显式添加 Node.js setup + npm ci + build |
| 用户登录失败（密码错误） | PHP 迁移时 `getUsers()` 用错误哈希覆盖了 KV 中的用户数据 | 调用 `reset-users-init` 端点清除用户数据，让 Node.js 重建 |
| dist/ 构建后缺少后端文件 | Vite 默认不复制非 JS/CSS 文件 | `vite.config.js` 添加 `closeBundle` 钩子复制 `.node.js` 文件 |
| `package-lock.json` 缺失导致 CI `npm ci` 失败 | 误加入 `.gitignore` | 从 `.gitignore` 移除 |

## 默认账号

| 用户名 | 密码 | 角色 |
|---|---|---|
| 陈立昊 | 123456 | 管理员 |
| 王宇翔 | 123456 | 管理员 |
| 王里庚 ~ 胡昌雨 | 123456 | 普通用户 |

## 当前状态与下一步

- **状态**：Vue 3 迁移完成，Node.js 后端稳定运行，错误码体系已建立
- **站点**：https://bawei.rth1.xyz/
- **默认下一步**：用浏览器打开站点，管理员登录，测试完整流程（点餐→统计→订单列表→报表→菜品管理→用户管理）
