# BeFat — 增重/减重双模式体重管理小程序

一个微信小程序，帮助用户管理体重目标：通过 AI 估算食物营养、生成每日食谱或减脂建议，追踪体重变化进度。支持**增重（gain）**与**减重（lose）**双目标模式，全链路按目标方向分流。

## 功能

- **双目标模式** — 建档时选择「增重 / 减重」，目标方向 `goal_type` 贯穿计算、食谱、周边检索、达标统计与 UI 文案
- **视觉吃记 / 饮食记录** — 文字描述（DeepSeek 解析）或拍照识菜（智谱 GLM 视觉单次直接出营养 JSON），输出食物名称、份量、热量和蛋白质；减重模式额外输出红绿灯评级（green/yellow/red），识别结果可编辑修正后保存
- **每日食谱 / 减脂教练** — 增重模式生成 4 餐食谱（懒加载、换一换、点击按需生成食材步骤、快照收藏）；减重模式由「减脂教练」聚合当日行为数据生成 3 条个性化动态建议
- **附近推荐** — 增重搜餐饮（约饭吧，首页入口）；减重搜运动场所（每日步数页内，关键词「健身房/体育馆/运动场/公园/游泳馆」），支持关键词/标签搜索、导航、电话，后端腾讯/百度/高德多服务商切换
- **每日步数 + 运动场所** — 减重模式每日步数页：微信运动步数授权同步（可手动输入）、消耗换算、附近运动场所推荐
- **16:8 轻断食计时** — 减重模式断食/进食周期可视化计时 + 16:8 用法指南卡片（断食目的、8h 进食期 / 16h 断食期规则、偏移调整），本地记录无云端依赖
- **每日概览** — 首页双圆环仪表盘（增重：热量+蛋白；减重：热量缺口环 + 步数环）+ 减重单行断食状态条、分餐次摄入明细、目标进度卡（含 BMI 状态标签）
- **目标进度追踪** — 目标详情页展示当前/目标体重、进度%、预计达成日期、体重趋势图，卡片内嵌「称体重」与「修改目标」按钮
- **体重追踪** — 记录每日体重，生成趋势折线图（全端体重值保留 2 位小数）
- **达标统计** — 增重按「达标率」、减重按「热量控制成功率」统计周长/月度数据，体重曲线叠加达标/超标色点
- **目标设定 / 修改** — 引导式 onboarding 计算每日目标，支持重算或手动微调，并按目标方向做合法性校验
- **健康提示** — BMI 计算 + 健康警告 + 范围条可视化，个人中心常驻展示

## 技术栈

| 层 | 技术 |
|--|------|
| 前端 | 微信小程序原生 (WXML + WXSS + JS) |
| 后端 | 微信云开发 (Node.js 16) |
| AI | 微信内容安全检测（msgSecCheck/imgSecCheck）+ 智谱 GLM（视觉识菜 + 食谱/锦囊生成）+ DeepSeek 文本营养解析 |
| 测试 | Jest |

## 项目结构

```
befat/
├── cloudfunctions/          # 云函数（+ common 共享代码）
│   ├── calcTarget/          # 建档计算每日目标（TDEE/BMI，gain/lose 分流）
│   ├── recalcTarget/        # 修改目标时精简重算（同步当前体重到 weight_logs）
│   ├── updateTargetManual/  # 手动微调每日目标
│   ├── getDailyMenu/        # 每日食谱概要（gain）/ 减脂建议 tips（lose），懒加载 + 换一换
│   ├── getMealDetail/       # 食谱单餐详情按需生成
│   ├── getDailySummary/     # 每日摄入汇总
│   ├── getGoalProgress/     # 目标进度（当前/目标体重、进度%、预计达成、节奏）
│   ├── getStats/            # 达标率统计聚合（gain/lose 判定方向分流）
│   ├── getFavorites/        # 快照收藏列表（我的菜库）
│   ├── toggleFavoriteRecipe/ # 每日菜单快照收藏/取消
│   ├── updateFavoriteDetail/ # 补全收藏快照的食材/步骤详情
│   ├── getNearbyPoi/        # 附近推荐（多服务商适配器：腾讯/百度/高德，策略路由+容错降级）
│   ├── parseFoodLog/        # AI 解析食物（文字 DeepSeek / 拍照 GLM 双模式，减重红绿灯）
│   ├── saveFoodLog/         # 保存饮食记录
│   ├── stepsSync/           # 微信运动步数同步（CloudID 解密 + 消耗换算）
│   ├── saveWeightLog/       # 保存体重记录
│   ├── resetUserData/       # 重置为新用户
│   ├── reportError/         # 前端错误上报
│   ├── checkMealReminder/   # 吃饭提醒检查（前端入口已移除，函数保留）
│   ├── deleteUserData/      # 彻底删除用户数据（前端入口已移除，函数保留）
│   ├── exportUserData/      # 导出用户数据（前端入口已移除，函数保留）
│   ├── generateRecipeInit/  # 历史：食谱数据初始化（遗留）
│   ├── manageRecipe/        # 历史：食谱管理（遗留）
│   ├── migrateRecipesNutrition/ # 历史：食谱营养迁移（遗留）
│   ├── toggleFavorite/      # 历史：旧收藏体系（已由 toggleFavoriteRecipe 取代）
│   └── common/              # 共享代码源（logger/targetCalc/deleteHelper/config）
├── miniprogram/
│   ├── pages/               # 12 个页面
│   │   ├── onboarding/      # 首次引导（3 步，含目标方向选择）
│   │   ├── index/           # 首页（双圆环仪表盘 + 目标进度卡 + BMI 标签 + 快捷入口）
│   │   ├── log-food/        # 记录饮食（文字/拍照识别 → 编辑 → 保存；减重红绿灯评级）
│   │   ├── weight-track/    # 体重打卡 + 趋势图（无显式入口，待清理）
│   │   ├── daily-menu/      # 每日食谱（gain）+ 附近推荐视图 + 收藏抽屉
│   │   ├── stats/           # 达标统计（gain）/ 热量与缺口（lose）
│   │   ├── goal-detail/     # 目标详情（进度/预计达成/趋势图）+ 称体重/修改目标入口
│   │   ├── target-edit/     # 修改目标（重算/手动微调）
│   │   ├── steps/           # 每日步数 + 附近运动场所（lose）
│   │   ├── fasting/         # 16:8 轻断食计时（lose）
│   │   ├── coach/           # 减脂教练（lose，聚合行为数据动态建议）
│   │   └── profile/         # 我的档案（BMI 范围条、每日目标、重置、健康提示）
│   ├── common/theme.wxss    # design tokens
│   └── utils/
│       ├── logger.js        # 前端日志（错误自动上报 reportError）
│       ├── util.js          # 工具函数（格式化/BMI/健康提示/normalizeGoalType）
│       ├── dateFormat.js    # 日期格式化
│       ├── validators.js    # 数字输入清洗
│       ├── targetGuard.js   # 目标输入合规校验（BMI/速率/方向拦截）
│       ├── location.js      # 模糊定位 + 授权引导兜底
│       ├── map.js           # 附近推荐（调 getNearbyPoi，含缓存/超时/扩距降级/伪打字机）
│       └── canvasChart.js   # 画布图表组件（趋势图，含 formatWeight 两位小数格式化）
├── tests/                   # Jest 测试（48 套件，669 用例）
├── __mocks__/               # Jest 手动 mock
├── db_init_menu_ai_config.json  # system_config 集合初始种子（食谱 AI 配置）
└── package.json
```

## 数据库集合

| 集合名 | 用途 | 权限 |
|--------|------|------|
| `users` | 用户基础信息与目标（含 `goal_type` 目标方向、`current_weight_kg` 当前体重、计划周期/期望速率） | 仅创建者可读写 |
| `food_logs` | 每日饮食记录（餐次/解析结果/热量蛋白） | 仅创建者可读写 |
| `weight_logs` | 体重打卡记录（修改目标会同步 upsert 当天记录） | 仅创建者可读写 |
| `daily_menus` | 每日食谱/锦囊（`_id` = 日期，按 `goal_type` 分别存 `meals` 或 `tips`） | 所有用户可读 |
| `user_favorites` | 每日菜单快照收藏（`recipe_title + meal_type + recipe_snapshot`） | 仅创建者可读写 |
| `error_logs` | 前端/重置操作错误上报 | 仅创建者可读写 |
| `system_config` | AI 运营配置（`menu_ai_config`：Prompt/白名单/黑名单/兜底菜库） | 仅管理员可写 |

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
| `getDailyMenu` | `MENU_API_KEY` | 食谱/锦囊生成 Key（缺省回退 `ZHIPU_API_KEY`） |
| `getDailyMenu` | `MENU_MODEL` | 生成模型（默认 `glm-4-flash`） |
| `getDailyMenu` | `MENU_API_URL` | 生成 Base URL（默认智谱） |
| `getMealDetail` | 同上 | 与 getDailyMenu 共用 `MENU_*` 三个变量 |
| `getNearbyPoi` | `TENCENT_MAP_KEY` | 腾讯位置服务 Key（缺省内置默认 Key） |
| `getNearbyPoi` | `BAIDU_MAP_AK` | 百度地图 AK（可选，配置后启用百度服务商） |
| `getNearbyPoi` | `AMAP_KEY` | 高德地图 Key（可选，配置后启用高德服务商） |
| `getNearbyPoi` | `MAP_PROVIDER` | 默认服务商（`tencent`/`baidu`/`amap`，缺省 tencent） |

### 2. 云函数超时配置

- `parseFoodLog`：调外部 AI，执行超时设 **20 秒**。
- `getDailyMenu` / `getMealDetail`：AI 生成峰值可达 30 秒，执行超时设 **≥35 秒**。
- `getNearbyPoi`：意图转译 1.5 秒硬超时 + 地图检索 8 秒超时，执行超时设 **15 秒**。

### 3. 数据库集合与种子

1. 云开发控制台 → 数据库，新建上述 7 个集合。
2. 新建 `system_config` 集合后，导入 `db_init_menu_ai_config.json` 作为初始 `menu_ai_config` 文档（含 Prompt 模板、食材白名单、敏感词黑名单、兜底菜库）；未导入时云函数会静默降级到代码内置兜底配置，不影响可用。

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
- 云函数按目录独立打包，跨函数共享代码须物理复制（见 `sync-common`），不能用 `../common` 相对路径
- 本地 jest 通过 ≠ 云端能跑，每次改动需真机/云端验证；`cloudfunctions` 下代码改动需重新部署
- 首页数据默认 30 秒 TTL 缓存以减少云函数调用（写操作来源页返回时强制刷新）
- 所有 `goal_type` 读取统一经 `normalizeGoalType(v)` 兜底（`v === 'lose' ? 'lose' : 'gain'`），老用户缺失字段默认按增重处理
- AI 解析结果与每日食谱/锦囊营养均**基于估算，仅供参考，不构成医疗建议**
- **用户可见文案合规**：小程序面向用户的界面文案不得出现「AI/人工智能/智能/大模型」等词，统一用「推荐/匹配」等中性表述替换
- **每日食谱/减脂建议**：AI 按天懒加载生成（懒加载触发 + 占位锁防并发 + 换一换限流 + code 93 兜底），Prompt/白名单/黑名单/兜底按 `goal_type` 分流，可免部署调优；数值边界校验与总和重算仍保留在代码内（防 AI 幻觉）
- **收藏**：统一为「每日菜单快照收藏」，收藏列表由 `getFavorites` 读取、`我的菜库` 抽屉展示