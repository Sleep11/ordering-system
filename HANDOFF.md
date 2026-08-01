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

1. **正确性第一** — 数据安全 > 可维护性 > 性能 > 扩展性 > 开发效率
2. **每次改代码必须递增版本号**（四位 `x.y.z.n`），同步到 `app.js`/`index.html`/`README.md`/`QA.md`
3. **提交信息以版本号开头**，如 `v3.0.0.18: fix order list price`
4. **不提交 `bawei-kv.json`、`.env`、`node_modules`、`dist`**
5. **所有 API 响应必须有 `code` 错误码**（格式 `CATEGORY-NNNN`），用户可复制排查
6. **前端使用 Vue 3**（已迁移完成），后端保留 Node.js 云函数（PHP 不可用）
7. **样式体系保持蓝色系**（CSS 变量 `--primary: #2563eb`），移动端 768/480/360 断点
8. **侧边栏仅管理员可见**，菜品管理和用户管理默认展开
9. **批量订餐表格默认选中盲盒**
10. **密码哈希使用 FNV-1a 迭代 40000 次**（`auth.node.js`），不可换算法

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
