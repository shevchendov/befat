# BeFat — 增肥记录小程序

一个微信小程序，帮助偏瘦人群记录饮食和体重，通过 AI 估算食物营养、生成每日增肥食谱，追踪增重进度。

## 功能

- **AI 食物识别** — 两种方式：文字描述（DeepSeek 解析）或拍照识菜（智谱 GLM 视觉单次直接出营养 JSON），输出食物名称、份量、热量和蛋白质（含内容安全检测）
- **饮食记录** — 按餐次（早餐/午餐/晚餐/加餐）记录每日摄入，识别结果可编辑修正后保存
- **每日增肥食谱** — AI 按天生成 4 餐（懒加载约 3 秒、换一换、点击卡片按需生成食材步骤），支持快照收藏到「我的菜库」抽屉
- **每日概览** — 首页展示当日热量/蛋白质达成环、分餐次摄入明细、目标进度卡
- **目标进度追踪** — 目标详情页展示当前体重、进度%、预计达成日期、计划周期与节奏对比
- **体重追踪** — 记录每日体重，生成趋势折线图
- **达标统计** — 7/30 天热量与蛋白达标率概览、体重曲线叠加达标/未达标色点
- **目标设定 / 修改** — 引导式 onboarding 计算每日目标，支持重算或手动微调
- **健康提示** — BMI 计算 + 健康警告 + 范围条可视化
- **数据自主权** — 导出全部数据（JSON）、重置为新用户、彻底删除所有数据

## 技术栈

| 层 | 技术 |
|--|------|
| 前端 | 微信小程序原生 (WXML + WXSS + JS) |
| 后端 | 微信云开发 (Node.js 16) |
| AI | 微信内容安全检测（msgSecCheck/imgSecCheck）+ 智谱 GLM（视觉识菜 + 每日食谱生成）+ DeepSeek 文本营养解析 |
| 测试 | Jest |

## 项目结构

```
befat/
├── cloudfunctions/          # 云函数（19 个 + common 共享代码）
│   ├── calcTarget/          # 计算每日目标（TDEE/BMI，onboarding 用）
│   ├── checkMealReminder/   # 吃饭提醒检查
│   ├── deleteUserData/      # 彻底删除用户数据
│   ├── exportUserData/      # 导出用户全部数据
│   ├── getDailyMenu/        # 每日食谱概要生成（阶段一，懒加载 + 换一换）
│   ├── getDailySummary/     # 获取每日摄入汇总
│   ├── getFavorites/        # 获取快照收藏列表（我的菜库）
│   ├── getGoalProgress/     # 目标进度（当前体重/进度%/预计达成/计划节奏）
│   ├── getMealDetail/       # 每日食谱单餐详情按需生成（阶段二）
│   ├── getStats/            # 达标率统计聚合
│   ├── parseFoodLog/        # AI 解析食物（文字 DeepSeek / 拍照 GLM 双模式）
│   ├── recalcTarget/        # 修改目标时精简重算
│   ├── reportError/         # 前端错误上报
│   ├── resetUserData/       # 重置为新用户
│   ├── saveFoodLog/         # 保存饮食记录
│   ├── saveWeightLog/       # 保存体重记录
│   ├── toggleFavoriteRecipe/ # 快照收藏/取消（每日菜单单菜品）
│   ├── updateFavoriteDetail/ # 补全收藏快照的食材/步骤详情
│   ├── updateTargetManual/  # 手动微调每日目标
│   └── common/              # 共享代码源（logger/targetCalc/deleteHelper/config，npm run sync-common 分发）
├── miniprogram/
│   ├── pages/               # 9 个页面
│   │   ├── onboarding/      # 首次引导设置（3 步问卷）
│   │   ├── index/           # 首页（每日概览 + 目标进度卡 + 入口导航）
│   │   ├── log-food/        # 记录饮食（文字/拍照识别 → 编辑 → 保存）
│   │   ├── weight-track/    # 体重打卡 + 趋势图
│   │   ├── daily-menu/      # 每日增肥食谱（换一换 + 收藏 + 我的菜库抽屉）
│   │   ├── stats/           # 达标统计页
│   │   ├── goal-detail/     # 目标详情（进度/预计达成/节奏）
│   │   ├── target-edit/     # 修改目标
│   │   └── profile/         # 我的档案/个人中心
│   └── utils/
│       ├── logger.js        # 前端日志（错误自动上报 reportError）
│       ├── util.js          # 工具函数（格式化/BMI/提示文案）
│       ├── dateFormat.js    # 日期格式化
│       ├── validators.js    # 数字输入清洗
│       ├── targetGuard.js   # 目标输入合规校验（BMI/速率拦截）
│       └── canvasChart.js   # 画布图表组件（趋势图）
├── tests/                   # Jest 测试
├── __mocks__/               # Jest 手动 mock
├── db_init_menu_ai_config.json  # system_config 集合初始种子（食谱 AI 配置）
└── package.json
```

## 数据库集合

| 集合名 | 用途 | 权限 |
|--------|------|------|
| `users` | 用户基础信息与目标（含计划周期/期望速率） | 仅创建者可读写 |
| `food_logs` | 每日饮食记录（餐次/解析结果/热量蛋白） | 仅创建者可读写 |
| `weight_logs` | 体重打卡记录 | 仅创建者可读写 |
| `daily_menus` | 每日增肥食谱（两阶段概要+详情，`_id` = 日期） | 所有用户可读 |
| `user_favorites` | 每日菜单快照收藏（`recipe_title + meal_type + recipe_snapshot`） | 仅创建者可读写 |
| `error_logs` | 前端/重置操作错误上报 | 仅创建者可读写 |
| `system_config` | AI 运营配置（`menu_ai_config`：Prompt/白名单/黑名单/兜底菜库） | 仅管理员可写 |

### user_favorites 单条收藏结构

```jsonc
{
  "_openid": "...",
  "recipe_id": null,
  "recipe_title": "溏心水煮蛋配黑胡椒",
  "meal_type": "breakfast",
  "recipe_snapshot": {
    "title": "...", "calorie": 180, "protein_g": 12.5,
    "meal_type": "breakfast", "ingredients": ["..."], "steps": ["..."], "date": "2026-08-24"
  },
  "created_at": "..."
}
```

索引：`idx_openid_meal_title`（唯一，`_openid+recipe_title+meal_type` 去重）、`idx_openid_created`（`_openid+created_at` 排序分页）。

## 配置与部署

### 1. 环境变量

在腾讯云云开发控制台 → 云函数 → 对应函数 → 环境变量中添加：

| 云函数 | Key | 说明 |
|--------|-----|------|
| `parseFoodLog` | `VISION_API_KEY` | 拍照识菜视觉 Key（缺省回退 `ZHIPU_API_KEY`） |
| `parseFoodLog` | `VISION_MODEL` | 视觉模型名（默认 `glm-4v-flash`） |
| `parseFoodLog` | `VISION_API_URL` | 视觉 Base URL（默认智谱） |
| `parseFoodLog` | `NUTRITION_API_KEY` | 文字营养 Key（缺省回退 `DEEPSEEK_API_KEY`） |
| `parseFoodLog` | `NUTRITION_MODEL` | 营养模型名（默认 `deepseek-v4-flash`） |
| `parseFoodLog` | `NUTRITION_API_URL` | 营养 Base URL（默认 DeepSeek） |
| `getDailyMenu` | `MENU_API_KEY` | 食谱生成 Key（缺省回退 `ZHIPU_API_KEY`） |
| `getDailyMenu` | `MENU_MODEL` | 食谱生成模型（默认 `glm-4-flash`） |
| `getDailyMenu` | `MENU_API_URL` | 食谱生成 Base URL（默认智谱） |
| `getMealDetail` | 同上 | 与 getDailyMenu 共用 `MENU_*` 三个变量 |

### 2. 云函数超时配置

- `parseFoodLog`：调外部 AI，执行超时设 **20 秒**。
- `getDailyMenu` / `getMealDetail`：AI 生成峰值可达 30 秒，执行超时设 **≥35 秒**。

### 3. 数据库集合与种子

1. 云开发控制台 → 数据库，新建上述 7 个集合。
2. 新建 `system_config` 集合后，导入 `db_init_menu_ai_config.json` 作为初始 `menu_ai_config` 文档（含 Prompt 模板、51 食材白名单、敏感词黑名单、兜底菜库）；未导入时云函数会静默降级到代码内置兜底配置，不影响可用。

### 4. 同步公共模块

```bash
npm run sync-common
```

将 `cloudfunctions/common/` 下共享代码（logger/targetCalc/deleteHelper/config）同步到各云函数目录。修改共享代码后需重跑并重新部署引用它的函数。

### 5. 替换 AppID 与云环境 ID

- `project.config.json` 中的 `appid` 替换为你的微信小程序 AppID
- `miniprogram/app.js` 中 `wx.cloud.init({ env })` 替换为云开发控制台的真实环境 ID

### 6. 本地测试

```bash
npm test
```

## 注意事项

- 微信云函数运行在 Node.js 16，不支持 `fetch`；HTTP 请求使用 `axios`
- WXML 模板不支持 JS 方法调用（如 `.trim()`），需在 JS 中预处理为 data 字段
- 云函数按目录独立打包，跨函数共享代码必须物理复制（见 `sync-common`），不能用 `../common` 相对路径
- 本地 jest 通过 ≠ 云端能跑，每次改动需真机/云端验证；`cloudfunctions` 下代码改动需重新部署
- 首页数据默认 30 秒 TTL 缓存以减少云函数调用（写操作来源页返回时强制刷新）
- AI 解析结果与每日食谱营养均**基于 AI 估算，仅供参考，不构成医疗建议**
- **每日增肥食谱**：AI 按天懒加载生成（懒加载触发 + 占位锁防并发 + 换一换限流 + code 93 兜底），Prompt/白名单/黑名单/兜底菜库已参数化到 `system_config` 集合，可免部署调优；数值边界校验与总和重算仍保留在代码内（防 AI 幻觉）
- **收藏**：统一为「每日菜单快照收藏」，收藏列表由 `getFavorites` 读取、`我的菜库`抽屉展示