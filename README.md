# BeFat — 增肥记录小程序

一个微信小程序，帮助偏瘦人群记录饮食和体重，通过 AI 估算食物营养，追踪增重进度。

## 功能

- **AI 食物识别** — 输入文字描述（如"一碗米饭加一个鸡腿"），DeepSeek API 自动解析食物名称、份量、热量和蛋白质（含内容安全检测）
- **饮食记录** — 按餐次（早餐/午餐/晚餐/加餐）记录每日摄入，识别结果可编辑修正后保存
- **每日概览** — 首页展示当日热量/蛋白质达成环、分餐次摄入明细、目标进度卡
- **目标进度追踪** — 目标详情页展示当前体重、进度%、预计达成日期、计划周期与节奏对比（on-track/ahead/behind）
- **体重追踪** — 记录每日体重，生成趋势折线图
- **达标统计** — 7/30 天热量与蛋白达标率概览、体重曲线叠加达标/未达标色点、每周达标率与体重变化对照
- **增肥食谱** — 浏览增肥食谱，按标签筛选、收藏，收藏优先排序，专属收藏页
- **目标设定** — 引导式 onboarding，根据身高/体重/活动水平/计划周期计算每日热量和蛋白质目标
- **修改目标** — 精简重算或手动微调每日目标，目标变更时更新预计节奏
- **健康提示** — BMI 计算 + 健康警告 + 范围条可视化展示
- **数据自主权** — 导出全部数据（JSON）、重置为新用户、彻底删除所有数据

## 技术栈

| 层 | 技术 |
|--|------|
| 前端 | 微信小程序原生 (WXML + WXSS + JS) |
| 后端 | 微信云开发 (Node.js 16) |
| AI | 微信内容安全检测 msgSecCheck + DeepSeek API（食物营养解析） |
| 测试 | Jest |

## 项目结构

```
befat/
├── cloudfunctions/          # 云函数（19 个 + common 共享代码）
│   ├── calcTarget/          # 计算每日目标（TDEE/BMI，onboarding 用）
│   ├── checkMealReminder/   # 吃饭提醒检查
│   ├── deleteUserData/      # 彻底删除用户数据
│   ├── exportUserData/      # 导出用户全部数据
│   ├── generateRecipeInit/  # 初始食谱生成 / 批量更新营养
│   ├── getDailySummary/     # 获取每日摄入汇总
│   ├── getFavorites/        # 获取用户收藏食谱
│   ├── getGoalProgress/     # 目标进度（当前体重/进度%/预计达成/计划节奏）
│   ├── getStats/            # 达标率统计聚合
│   ├── manageRecipe/        # 管理员增删改查食谱
│   ├── migrateRecipesNutrition/ # 一次性迁移食谱营养数据
│   ├── parseFoodLog/        # AI 解析食物文字（msgSecCheck + DeepSeek）
│   ├── recalcTarget/        # 修改目标时精简重算
│   ├── reportError/         # 前端错误上报
│   ├── resetUserData/       # 重置为新用户
│   ├── saveFoodLog/         # 保存饮食记录
│   ├── saveWeightLog/       # 保存体重记录
│   ├── toggleFavorite/      # 收藏/取消收藏
│   ├── updateTargetManual/  # 手动微调每日目标
│   └── common/              # 共享代码源（logger/targetCalc/deleteHelper，npm run sync-common 分发）
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
├── tests/                   # Jest 测试（40 套件 / 513 断言）
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
| `recipes` | 增肥食谱库 | 所有用户可读，仅管理员可写 |
| `user_favorites` | 用户收藏（recipe_id 列表） | 仅创建者可读写 |
| `error_logs` | 前端/重置操作错误上报 | 仅创建者可读写 |

## 配置与部署

### 1. 环境变量

在腾讯云云开发控制台 → 云函数 → 对应函数 → 环境变量中添加：

| 云函数 | Key | 说明 |
|--------|-----|------|
| `parseFoodLog` | `DEEPSEEK_API_KEY` | DeepSeek API Key（ChatCompletions，模型 deepseek-v4-flash） |
| `manageRecipe` | `ADMIN_OPENID` | 管理员微信 OPENID（食谱增删改权限） |

### 2. 云函数超时配置

`parseFoodLog` 需要调用外部 AI API，请在云开发控制台 → 云函数 → `parseFoodLog` → 版本与配置中，将**执行超时时间**调整到 30 秒左右（与代码内 axios 30s 超时对齐），否则 DeepSeek 响应稍慢就会被平台强制掐断。

### 3. 数据库集合

在云开发控制台 → 数据库按上表新建 6 个集合并设置权限。

### 4. 同步公共模块

```bash
npm run sync-common
```

将 `cloudfunctions/common/` 下共享代码（logger/targetCalc/deleteHelper）同步到各云函数目录。修改共享代码后需重跑并逐一重新部署引用它的函数。

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