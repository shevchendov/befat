# CHANGELOG / 迭代升级记录

## [2026-07-30] 6902efb

**﻿docs: 更新 commit 规范模板并新增配套自动化工具**

- AGENTS.md: 替换旧 commit 规范为强制模板（DEPLOY/VERIFIED/DATA IMPACT 字段）
- .githooks/post-commit: 新增 DEPLOY 字段解析，DEPLOY 非 none 时自动追加 ⚠️ 待确认标记到 CHANGELOG
- scripts/check-deploy-status.js: 新建脚本，扫描 CHANGELOG 中所有 ⚠️ 待确认标记并汇总输出
- package.json: 新增 check-deploy script 命令
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.githooks/post-commit`
- `AGENTS.md`
- `CHANGELOG.md`
- `package.json`
- `scripts/check-deploy-status.js`

## [2026-07-30] bf485a7

**﻿docs: 更新 commit 规范模板并新增配套自动化工具**

- AGENTS.md: 替换旧 commit 规范为强制模板（DEPLOY/VERIFIED/DATA IMPACT 字段）
- .githooks/post-commit: 新增 DEPLOY 字段解析，DEPLOY 非 none 时自动追加 ⚠️ 待确认标记到 CHANGELOG
- scripts/check-deploy-status.js: 新建脚本，扫描 CHANGELOG 中所有 ⚠️ 待确认标记并汇总输出
- package.json: 新增 check-deploy script 命令
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.githooks/post-commit`
- `AGENTS.md`
- `package.json`
- `scripts/check-deploy-status.js`

每条提交自动记录于此（通过 `.githooks/post-commit`）。

## [2026-07-30] e57936c

**docs: add auto-changelog hook (post-commit -> CHANGELOG.md), AGENTS.md with conventions**

- 创建 `.githooks/post-commit`：每次 git commit 自动将提交信息（标题 + 正文 + 涉及文件列表）追加到 CHANGELOG.md 顶部
- hook 自动遮蔽提交信息中的敏感内容（API key、密码、token、密钥、连接串等），遮蔽后才写入 CHANGELOG.md
- 创建 `AGENTS.md`：项目 AI 编码规范，包含 git hooks 配置说明、commit 规范、敏感信息保护说明
- 创建 `CHANGELOG.md`：迭代升级记录，所有历史提交已背填
- 后续每次提交只需编写规范的 commit message（标题 + 正文写明改动内容和原因），hook 自动记录

注意事项：
- 新克隆仓库后需执行 `git config core.hooksPath .githooks` 激活 hook
- `migrateRecipesNutrition` 云函数（一次性迁移任务）已完成，可删除目录 `cloudfunctions/migrateRecipesNutrition/`
- 小程序前端文件修改后无需重新上传云函数，刷新即生效

**涉及文件:**
- `.githooks/post-commit`
- `AGENTS.md`
- `CHANGELOG.md`

## [2026-07-30] 2dbafdc

**feat: weight values now keep 2 decimal places, history list reversed (newest first)**

- 云函数 `saveWeightLog` 四舍五入改为 `Math.round(* 100) / 100`，保留 2 位小数
- 前端输入框限 2 位小数 + maxlength 6，实时过滤多余小数位
- weightChange 计算精度改为 2 位小数
- 图表 Y 轴标签改为 `toFixed(2)`
- 历史记录列表新增 `recordsReversed`（倒序），最新记录在上
- 展示字段统一使用 `*Display` 格式（`latestWeightDisplay`、`weightChangeDisplay`、`weight_kg_display`）
- 测试用例适配断言 `65.7` → `65.67`、`65.4` → `65.44`

注意：需重新上传云函数 `saveWeightLog`

**涉及文件:**
- `cloudfunctions/saveWeightLog/index.js`
- `miniprogram/pages/weight-track/weight-track.js`
- `miniprogram/pages/weight-track/weight-track.wxml`
- `tests/integration/weight-tracking-flow.test.js`
- `tests/saveWeightLog.test.js`

## [2026-07-30] 8c90e09

**feat: skip onboarding if user profile already exists**

- `onboarding.js` 新增 `onShow` 生命周期：每次进入页面时检查 `users` 集合是否有当前用户数据
- 已有数据则自动 `wx.reLaunch` 跳转首页，不再重复填写资料

**涉及文件:**
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/onboarding/onboarding.wxml`

## [2026-07-29] b5b5864

**fix: remove aggressive real-time low-end clamp that broke normal input like 170**

- 删除实时校验中的低端数值钳制条件 `num < 50 && value.length >= 2`
- 此条件导致输入 170 时被误截断为 250（触发 `clampNumber` 回退）
- 现在实时校验只做字符过滤和 maxlength 截断，边界值回退到提交按钮做兜底

**涉及文件:**
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/weight-track/weight-track.js`

## [2026-07-29] dd923df

**fix: unify number input validation and fix vertical centering across all form pages**

- 创建 `miniprogram/utils/validators.js`：统一 `sanitizeDigit`、`sanitizeNumber`、`clampNumber` 等校验函数
- 全局样式 `app.wxss` 新增 `.input-number` 公共类（height: 80rpx + line-height: 80rpx + padding: 0 30rpx）
- onboarding 页：输入框改用 `.input-number` + maxlength + 实时字符过滤
- weight-track 页：体重输入框改用 `.input-number` + maxlength + 实时字符过滤
- log-food 页：热量/蛋白质输入框加 maxlength + 实时数字过滤；`.item-input` 改用 height + line-height 零上下 padding 样式
- 修复所有数字输入框垂直裁切问题

**涉及文件:**
- `miniprogram/app.wxss`
- `miniprogram/pages/log-food/log-food.js`
- `miniprogram/pages/log-food/log-food.wxml`
- `miniprogram/pages/log-food/log-food.wxss`
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/onboarding/onboarding.wxml`
- `miniprogram/pages/weight-track/weight-track.js`
- `miniprogram/pages/weight-track/weight-track.wxml`
- `miniprogram/utils/validators.js`

## [2026-07-29] 23068d0

**fix: update recipe nutrition data based on China CDC authoritative food composition data**

- 按中国疾病预防控制中心营养与健康所（nlc.chinanutri.cn）及中国营养学会 2024 中国食物成分表权威数据重新计算 32 条食谱营养值
- `generateRecipeInit/index.js` 新增 `event.force` 模式，可批量更新已有食谱文档的 calorie/protein_g
- 创建 `migrateRecipesNutrition` 一次性迁移云函数并成功执行（updated: 32）

注意事项：
- 需重新上传云函数 `generateRecipeInit`
- `migrateRecipesNutrition` 为一次性迁移函数，执行成功后（updated: 32）可删除目录 `cloudfunctions/migrateRecipesNutrition/`

**涉及文件:**
- `cloudfunctions/generateRecipeInit/index.js`
- `cloudfunctions/generateRecipeInit/package-lock.json`
- `cloudfunctions/migrateRecipesNutrition/common/logger.js`
- `cloudfunctions/migrateRecipesNutrition/index.js`
- `cloudfunctions/migrateRecipesNutrition/package-lock.json`
- `cloudfunctions/migrateRecipesNutrition/package.json`

## [2026-07-29] c61278e

**docs: add README with project overview and setup guide**

- 创建 `README.md`：包含项目简介、技术栈、本地开发指南、目录结构说明

**涉及文件:**
- `README.md`

## [2026-07-29] 0dbf1c0

**feat: add logging system, fix fetch bug & WXML trim issue**

- 创建结构化 JSON 日志工具 `cloudfunctions/common/logger.js`
- 添加错误上报云函数 `reportError`
- 添加前端日志工具 `miniprogram/utils/logger.js`，在 `app.js` 注册全局错误处理器
- 通过 `sync-common.js` 将 `common/logger.js` 同步到所有云函数
- 替换 `fetch` 为 `axios`（兼容 Node 16）
- 修复 AI 识别按钮 disabled 状态：将 `rawText.trim()` 替换为 `canParse` 判断
- 更新所有测试 mock 从 `global.fetch` 切换到 `axios`
- 大量新增测试用例覆盖日期格式容错、接口响应契约、安全输入校验等

注意：需重新上传所有云函数

**涉及文件:**
- `__mocks__/axios.js`
- `cloudfunctions/` 各云函数的 logger 及 index 文件
- `miniprogram/pages/log-food/log-food.js`
- `miniprogram/pages/log-food/log-food.wxml`
- `package.json`、`package-lock.json`
- `tests/` 多个测试文件

## [2026-07-29] 1727535

**Initial Commit**

- 首次提交，初始化项目基础框架
- 微信小程序前端：首页、饮食记录、食谱列表/详情、体重打卡、个人资料、引导页
- 云函数：calcTarget、checkMealReminder、deleteUserData、exportUserData、generateRecipeInit、getDailySummary、parseFoodLog、reportError、saveWeightLog
- 工具函数、日志系统、测试框架（Jest）及全套测试用例
- 项目配置文件

**涉及文件:**
- 共 88 个文件，涵盖 `cloudfunctions/`、`miniprogram/`、`tests/`、项目配置