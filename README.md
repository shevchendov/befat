# BeFat — 增肥记录小程序

一个微信小程序，帮助偏瘦人群记录饮食和体重，通过 AI 估算食物营养，追踪增重进度。

## 功能

- **AI 食物识别** — 两种方式：文字描述（DeepSeek 解析）或拍照识菜（智谱 GLM 视觉识菜 → DeepSeek 营养计算），输出食物名称、份量、热量和蛋白质（含内容安全检测）
- **饮食记录** — 按餐次（早餐/午餐/晚餐/加餐）记录每日摄入，识别结果可编辑修正后保存
- **每日概览** — 首页展示当日热量/蛋白质达成环、分餐次摄入明细、目标进度卡
- **目标进度追踪** — 目标详情页展示当前体重、进度%、预计达成日期、计划周期与节奏对比（on-track/ahead/behind）
- **体重追踪** — 记录每日体重，生成趋势折线图
- **达标统计** — 7/30 天热量与蛋白达标率概览、体重曲线叠加达标/未达标色点、每周达标率与体重变化对照
- **增肥食谱** — 动态食谱系统，管理员审核发布流程（草稿→审核→发布），按标签筛选、收藏，收藏优先排序，专属收藏页
- **目标设定** — 引导式 onboarding，根据身高/体重/活动水平/计划周期计算每日热量和蛋白质目标
- **修改目标** — 精简重算或手动微调每日目标，目标变更时更新预计节奏
- **健康提示** — BMI 计算 + 健康警告 + 范围条可视化展示
- **数据自主权** — 导出全部数据（JSON）、重置为新用户、彻底删除所有数据

## 技术栈

| 层 | 技术 |
|--|------|
| 前端 | 微信小程序原生 (WXML + WXSS + JS) |
| 后端 | 微信云开发 (Node.js 16) |
| AI | 微信内容安全检测（msgSecCheck/imgSecCheck）+ 智谱 GLM 视觉识菜 + DeepSeek 营养解析 |
| 测试 | Jest |

## 项目结构

```
befat/
├── cloudfunctions/          # 云函数（23 个 + common 共享代码）
│   ├── calcTarget/          # 计算每日目标（TDEE/BMI，onboarding 用）
│   ├── checkMealReminder/   # 吃饭提醒检查
│   ├── deleteUserData/      # 彻底删除用户数据
│   ├── exportUserData/      # 导出用户全部数据
│   ├── generateRecipeInit/  # [已退役] 初始食谱生成（返回弃用提示）
│   ├── getDailySummary/     # 获取每日摄入汇总
│   ├── getFavorites/        # 获取用户收藏食谱（仅返回已发布食谱）
│   ├── getGoalProgress/     # 目标进度（当前体重/进度%/预计达成/计划节奏）
│   ├── getPublishedRecipes/ # 获取已发布食谱列表（分页 + 标签筛选）
│   ├── getRecipeDetail/     # 获取食谱详情（仅已发布状态）
│   ├── getStats/            # 达标率统计聚合
│   ├── manageRecipe/        # 管理员食谱管理（新增/编辑/审核/发布/归档/回滚）
│   ├── migrateRecipesNutrition/ # [已退役] 历史营养数据迁移（返回弃用提示）
│   ├── parseFoodLog/        # AI 解析食物文字（msgSecCheck + DeepSeek）
│   ├── recalcTarget/        # 修改目标时精简重算
│   ├── recipeDataCleanup/   # 管理员清理食谱数据（dry-run + confirm 双重确认）
│   ├── reportError/         # 前端错误上报
│   ├── resetUserData/       # 重置为新用户
│   ├── saveFoodLog/         # 保存饮食记录
│   ├── saveWeightLog/       # 保存体重记录
│   ├── toggleFavorite/      # 收藏/取消收藏
│   ├── updateTargetManual/  # 手动微调每日目标
│   ├── validateRecipe/      # 食谱数据校验（标题/食材/步骤/营养/重复检测）
│   └── common/              # 共享代码源（logger/targetCalc/deleteHelper/recipeValidation，npm run sync-common 分发）
├── miniprogram/
│   ├── pages/               # 11 个页面
│   │   ├── onboarding/      # 首次引导设置（3 步问卷）
│   │   ├── index/           # 首页（每日概览 + 目标进度卡 + 入口导航）
│   │   ├── log-food/        # 记录饮食（文字识别 → 编辑 → 保存）
│   │   ├── weight-track/    # 体重打卡 + 趋势图
│   │   ├── recipe-list/     # 食谱列表（标签筛选 + 收藏优先排序）
│   │   ├── recipe-detail/   # 食谱详情
│   │   ├── my-favorites/    # 我的收藏
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
├── tests/                   # Jest 测试（45 套件 / 595 断言）
├── __mocks__/               # Jest 手动 mock
├── scripts/                 # 工具脚本
└── package.json
```

## 数据库集合

| 集合名 | 用途 | 权限 |
|--------|------|------|
| `users` | 用户基础信息与目标（含计划周期/期望速率） | 仅创建者可读写 |
| `food_logs` | 每日饮食记录（餐次/解析结果/热量蛋白） | 仅创建者可读写 |
| `weight_logs` | 体重打卡记录 | 仅创建者可读写 |
| `recipes` | 增肥食谱库（动态 schema：nutrition 嵌套 + status/version/versions 状态机） | 所有用户可读，仅管理员可写 |
| `user_favorites` | 用户收藏（recipe_id 列表） | 仅创建者可读写 |
| `error_logs` | 前端/重置操作错误上报 | 仅创建者可读写 |

### recipes 核心字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 食谱标题 |
| `status` | string | 状态：DRAFT → VALIDATING → PENDING_REVIEW → APPROVED → PUBLISHED → ARCHIVED |
| `version` | number | 当前版本号（单调递增，回滚不降） |
| `nutrition` | object | 营养数据：`{ calorie, protein_g, fat_g, carb_g, fiber_g }` |
| `ingredients` | array | 食材列表：`[{ name, amount, unit, food_id, note }]` |
| `steps` | array | 烹饪步骤（字符串数组） |
| `tags` | array | 标签（如早餐/高蛋白） |
| `image_url` | string | 食谱图片 URL |
| `source_id` | string | 食谱来源（如 `admin-manual`） |
| `source_version` | string | 来源版本号 |
| `nutrition_snapshot` | object | 营养快照（来源/计算方式/审核人） |
| `review_record` | object | 审核记录（审核人/类型/动作/备注/时间） |
| `versions` | array | 历史版本快照数组 |
| `base_nutrition_checked` | object | 基础营养校验标记 |
| `created_at` / `updated_at` / `published_at` / `archived_at` | date | 各阶段时间戳 |

## 配置与部署

### 1. 环境变量

在腾讯云云开发控制台 → 云函数 → 对应函数 → 环境变量中添加：

| 云函数 | Key | 说明 |
|--------|-----|------|
| `parseFoodLog` | `VISION_API_KEY` | 第一棒视觉识菜 Key（缺省回退 `ZHIPU_API_KEY`） |
| `parseFoodLog` | `VISION_MODEL` | 第一棒视觉模型名（默认 `glm-4v-flash`） |
| `parseFoodLog` | `VISION_API_URL` | 第一棒视觉 Base URL（默认智谱 `open.bigmodel.cn`） |
| `parseFoodLog` | `NUTRITION_API_KEY` | 第二棒营养计算 Key（缺省回退 `DEEPSEEK_API_KEY`） |
| `parseFoodLog` | `NUTRITION_MODEL` | 第二棒营养模型名（默认 `deepseek-v4-flash`） |
| `parseFoodLog` | `NUTRITION_API_URL` | 第二棒营养 Base URL（默认 DeepSeek `api.deepseek.com`） |
| `manageRecipe` | `ADMIN_OPENID` | 管理员微信 OPENID（食谱增删改审核权限） |
| `recipeDataCleanup` | `ADMIN_OPENID` | 管理员微信 OPENID（清理数据权限） |

### 2. 云函数超时配置

`parseFoodLog` 需调用外部 AI API（拍照识菜为 GLM + DeepSeek 双模型串行接力，理论峰值约 12s + 15s = 27s），请在云开发控制台 → 云函数 → `parseFoodLog` → 版本与配置中，将**执行超时时间**调整到 **35 秒**左右（与代码内 axios 12s/15s 超时阶梯对齐），否则模型响应稍慢就会被平台强制掐断。

### 3. 数据库集合

在云开发控制台 → 数据库按上表新建 6 个集合并设置权限。

### 4. 同步公共模块

```bash
npm run sync-common
```

将 `cloudfunctions/common/` 下共享代码（logger/targetCalc/deleteHelper/recipeValidation）同步到各云函数目录。修改共享代码后需重跑并逐一重新部署引用它的函数。

### 5. 替换 AppID 与云环境 ID

- `project.config.json` 中的 `appid` 替换为你的微信小程序 AppID
- `miniprogram/app.js` 中 `wx.cloud.init({ env })` 替换为云开发控制台的真实环境 ID（格式 `cloud1-xxxx`，不是 AppID）

### 6. 本地测试

```bash
npm test
```

## 注意事项

- 微信云函数运行在 Node.js 16，不支持 `fetch`；HTTP 请求使用 `axios`
- WXML 模板不支持 JS 方法调用（如 `.trim()`），需在 JS 中预处理为 data 字段
- 云函数为按目录独立打包，跨函数共享代码必须物理复制（见 `sync-common`），不能用 `../common` 相对路径
- 本地 jest 通过 ≠ 云端能跑，每次改动需真机/云端验证；`cloudfunctions` 下代码改动需重新部署，控制台改环境变量/超时即时生效
- 首页数据默认 30 秒 TTL 缓存以减少云函数调用（写操作来源页返回时强制刷新）
- AI 解析结果仅供参考，不构成医疗建议
- 食谱系统：旧 32 条硬编码食谱已废弃，新食谱走 `manageRecipe` 审核发布流程（DRAFT→VALIDATING→APPROVED→PUBLISHED），前端通过 `getPublishedRecipes`/`getRecipeDetail` 获取，客户端不可直设 PUBLISHED 状态
- `recipeDataCleanup` 用于清空历史数据：dry_run 默认 true（仅统计），切换 false 时需附 `confirm: "DELETE_ALL_LEGACY_RECIPES"` 硬确认令牌，仅清理 recipes 与孤儿 user_favorites，不动其他集合