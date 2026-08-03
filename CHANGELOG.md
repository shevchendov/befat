# CHANGELOG / 迭代升级记录

## [2026-07-31] 14d4975

**feat: 新增修改目标功能（精简重算 + 手动微调）**

- 抽取目标计算逻辑至 cloudfunctions/common/targetCalc.js，calcTarget 改为复用共享模块（行为不变）
- 新增 recalcTarget：复用已有身高/性别/年龄/活动档案重算目标，保留 BMI<16 与每周增重>1kg 安全拦截
- 新增 updateTargetManual：手动微调热量/蛋白质/目标体重，校验热量不低于基础代谢率等边界值
- 新建 pages/target-edit 双模式页面（重算/手动微调 Tab），首页目标卡片新增修改目标入口
- 为两个新云函数补充 24 个 jest 测试
DEPLOY: cloudfunctions/recalcTarget, cloudfunctions/updateTargetManual, cloudfunctions/calcTarget
VERIFIED: 仅本地jest测试通过（415项），未做真机/云端验证
DATA IMPACT: 更新 users 集合 target_weight_kg、daily_calorie_target、daily_protein_target_g、bmi、updated_at；不覆盖 initial_weight/current_weight_kg，无结构变化

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/calcTarget/common/targetCalc.js`
- `cloudfunctions/calcTarget/index.js`
- `cloudfunctions/checkMealReminder/common/targetCalc.js`
- `cloudfunctions/common/targetCalc.js`
- `cloudfunctions/deleteUserData/common/targetCalc.js`
- `cloudfunctions/exportUserData/common/targetCalc.js`
- `cloudfunctions/generateRecipeInit/common/targetCalc.js`
- `cloudfunctions/getDailySummary/common/targetCalc.js`
- `cloudfunctions/getFavorites/common/targetCalc.js`
- `cloudfunctions/getShareCard/common/targetCalc.js`
- `cloudfunctions/getWxacode/common/targetCalc.js`
- `cloudfunctions/manageRecipe/common/targetCalc.js`
- `cloudfunctions/parseFoodLog/common/targetCalc.js`
- `cloudfunctions/recalcTarget/common/logger.js`
- `cloudfunctions/recalcTarget/common/targetCalc.js`
- `cloudfunctions/recalcTarget/index.js`
- `cloudfunctions/recalcTarget/package.json`
- `cloudfunctions/saveWeightLog/common/targetCalc.js`
- `cloudfunctions/sync-common.js`
- `cloudfunctions/toggleFavorite/common/targetCalc.js`
- `cloudfunctions/updateTargetManual/common/logger.js`
- `cloudfunctions/updateTargetManual/common/targetCalc.js`
- `cloudfunctions/updateTargetManual/index.js`
- `cloudfunctions/updateTargetManual/package.json`
- `miniprogram/app.json`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.wxss`
- `miniprogram/pages/target-edit/target-edit.js`
- `miniprogram/pages/target-edit/target-edit.json`
- `miniprogram/pages/target-edit/target-edit.wxml`
- `miniprogram/pages/target-edit/target-edit.wxss`
- `tests/recalcTarget.test.js`
- `tests/updateTargetManual.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/recalcTarget, cloudfunctions/updateTargetManual, cloudfunctions/calcTarget

## [2026-07-31] 31b1c90

**chore: 更新 CHANGELOG 记录 e3ebb15**

DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`

## [2026-07-31] e3ebb15

**fix: 修复 goal-detail 折线图排版与目标标签配色，清理废弃 API**

- 修复 canvas 尺寸为 0 时网格线/Y轴刻度越界与上方卡片重叠的问题，增加尺寸守卫与延时重试
- 目标标签位置移至虚线右端，改为亮黄底 #FFD23F + 2px 黑描边 + 深棕文字，提升对比度
- share-card、goal-detail 的 wx.getSystemInfoSync 统一替换为 wx.getWindowInfo
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/goal-detail/goal-detail.js`
- `miniprogram/pages/goal-detail/goal-detail.wxss`
- `miniprogram/pages/share-card/share-card.js`

## [2026-07-31] 03cbef5

**feat: goal-detail 页面体重趋势改为 Canvas 折线图**

- 用原生 Canvas 2D 绘制体重折线图，替换原有文字列表
- 实际折线暖橙 #FF6B35 + 黑色粗描边，目标线黄色虚线并标注目标值
- Y 轴范围按数据动态计算并外扩 10%，X 轴日期标签超 7 点自动间隔抽样
- 空数据/单数据点边界处理，高清屏 dpr 适配
- 纯前端改动，不涉及云函数
DEPLOY: none
VERIFIED: 未测试

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/goal-detail/goal-detail.js`
- `miniprogram/pages/goal-detail/goal-detail.wxml`
- `miniprogram/pages/goal-detail/goal-detail.wxss`

## [2026-07-31] 475c67c

**feat: 新增目标进度追踪功能**

- 新建 getGoalProgress 云函数：并行查询 users + weight_logs，增/减重双向进度计算
- 首页进度环下方新增目标进度卡片：已达成显示庆祝态，未达成显示进度条+剩余差距+预计达成日期
- 新增 goal-detail 页面骨架，展示目标数据与体重趋势列表
- 编写 10 个单元测试覆盖边界情况（除零保护/方向不符/字段回退等）
DEPLOY: cloudfunctions/getGoalProgress
VERIFIED: 仅本地jest测试通过，未做真机/云端验证
DATA IMPACT: 未修改数据结构，仅新增查询；需确认 weight_logs 的 _openid + date 复合索引

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/getGoalProgress/common/logger.js`
- `cloudfunctions/getGoalProgress/index.js`
- `cloudfunctions/getGoalProgress/package.json`
- `miniprogram/app.json`
- `miniprogram/pages/goal-detail/goal-detail.js`
- `miniprogram/pages/goal-detail/goal-detail.json`
- `miniprogram/pages/goal-detail/goal-detail.wxml`
- `miniprogram/pages/goal-detail/goal-detail.wxss`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.wxss`
- `tests/getGoalProgress.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getGoalProgress

## [2026-07-31] 72cec89

**chore: .gitignore 忽略微信开发者工具临时目录和本地编辑器配置**

- 忽略 .tmp.driveupload/、.tmp.drivedownload/（DevTools 上传下载缓存，9857 个临时文件）
- 忽略 .vscode/（本地编辑器配置）
- 避免 git status 持续出现无关脏文件
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.gitignore`
- `CHANGELOG.md`

## [2026-07-31] 29aab6d

**perf: 云函数查询并行化 + countConsecutive 加 365 天回溯过滤**

- getDailySummary: food_logs 和 users 查询改用 Promise.all 并行
- getShareCard: 主函数 4 个查询 + countConsecutive 内 2 个查询全部并行化
- countConsecutive 增加 date: _.gte(startDate) 365 天过滤，避免全表扫描随用户数据线性增长
- 需在云开发控制台 food_logs 集合建复合索引 _openid(1)+date(1)+created_at(1)
DEPLOY: cloudfunctions/getDailySummary,cloudfunctions/getShareCard
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/getDailySummary/index.js`
- `cloudfunctions/getShareCard/index.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getDailySummary,cloudfunctions/getShareCard

## [2026-07-30] fe23795

**chore: 自动追加本次提交记录到 CHANGELOG.md**

DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`

## [2026-07-30] 720d472

**fix: onboarding step.active 改为 solid primary 色**

DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/onboarding/onboarding.wxss`

## [2026-07-30] a98cffa

**fix: theme.wxss CSS 变量包裹在 page {} 选择器中**

- 修复 WXSS 编译错误 unexpected token
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `miniprogram/common/theme.wxss`

## [2026-07-30] e881ec5

**feat: 全站视觉统一 - recipe-list/recipe-detail/my-favorites/weight-track/profile/log-food**

- recipe-list: 食谱卡片黑边暖底，标签用 theme 变量
- recipe-detail(高强度): 详情卡黑边，统计区倾斜 -2deg，mini-tag 更新
- my-favorites(高强度): 收藏卡片黑边暖底，统一变量
- profile: BMI 显示区用 card-bg-light
- log-food(低强度): confetti 配色改为新强调色
- index: confetti 配色更新
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/log-food/log-food.wxml`
- `miniprogram/pages/my-favorites/my-favorites.wxss`
- `miniprogram/pages/profile/profile.wxss`
- `miniprogram/pages/recipe-detail/recipe-detail.wxss`
- `miniprogram/pages/recipe-list/recipe-list.wxss`

## [2026-07-30] 17d9719

**refactor: 改用统一 SCALE=2 系数缩放 canvas 绘制**

- 新增 SCALE=2 常量，canvas.width/height 乘以 SCALE 提高物理分辨率
- ctx.scale 改为 dpr * SCALE，所有绘制坐标/字号/线宽自动放大
- CSS 显示尺寸不变（690rpx × 1104rpx），画布空间不变
- 导出图片清晰度翻倍（saveToAlbum 以 2x 分辨率输出）
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`

## [2026-07-30] 1dd7f1f

**﻿style: 放大 Canvas 关键视觉元素**

- 品牌"BE FAT"42→50px/"做大只"24→28px，描边加粗
- 环形进度半径76→82，主数字32→40px bold，圆环线宽12→14
- 本周体重/距目标数值30→38px bold
- 连续打卡标签150×56→175×66，字号24→27px
- 爆炸射线数量7→12条，长度1.5-2x，三角基底5→8px，分布更扩散
- 各元素位置微调防重叠
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`

## [2026-07-30] 41f7484

**﻿style: 放大 Canvas 关键视觉元素**

- 品牌"BE FAT"42→50px/"做大只"24→28px，描边加粗
- 环形进度半径76→82，主数字32→40px bold，圆环线宽12→14
- 本周体重/距目标数值30→38px bold
- 连续打卡标签150×56→175×66，字号24→27px
- 爆炸射线数量7→12条，长度1.5-2x，三角基底5→8px，分布更扩散
- 各元素位置微调防重叠
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.commit_msg.tmp`
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`

## [2026-07-30] ce8c108

**﻿fix: 修复 Canvas roundRect 兼容性和按钮样式**

- roundRect 在低版本 WeChat 不支持导致绘制链断裂，改用 arcTo 手动实现兼容
- 每步绘制加 try-catch 隔离，单步失败不影响其余内容
- 环形进度半径 80->76，避免视觉拥挤
- action-btn 从 button 改为 view，去掉默认样式冲突
- 增加 data logger 方便真机调试
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`
- `miniprogram/pages/share-card/share-card.wxml`
- `miniprogram/pages/share-card/share-card.wxss`

## [2026-07-30] a455206

**﻿fix: 修复 Canvas roundRect 兼容性和按钮样式**

- roundRect 在低版本 WeChat 不支持导致绘制链断裂，改用 arcTo 手动实现兼容
- 每步绘制加 try-catch 隔离，单步失败不影响其余内容
- 环形进度半径 80->76，避免视觉拥挤
- action-btn 从 button 改为 view，去掉默认样式冲突
- 增加 data logger 方便真机调试
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.commit_msg.tmp`
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`
- `miniprogram/pages/share-card/share-card.wxml`
- `miniprogram/pages/share-card/share-card.wxss`

## [2026-07-30] 42c9141

**﻿fix: 达标庆祝弹窗一天只弹一次**

- 使用 wx.setStorageSync/wx.getStorageSync 以日期为 key 记录弹窗状态
- onShow 中先检查 celebrate_shown_YYYY-MM-DD，已存在则跳过
- 更新测试 setup 增加 storage mock 和重置逻辑
- 新增 index 首页测试：5 个用例覆盖达标弹、未达标、无餐、同天重复、跨天重置
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/index/index.js`
- `tests/frontend/index.test.js`
- `tests/frontend/setup.js`

## [2026-07-30] 4945a21

**﻿fix: 达标庆祝弹窗一天只弹一次**

- 使用 wx.setStorageSync/wx.getStorageSync 以日期为 key 记录弹窗状态
- onShow 中先检查 celebrate_shown_YYYY-MM-DD，已存在则跳过
- 更新测试 setup 增加 storage mock 和重置逻辑
- 新增 index 首页测试：5 个用例覆盖达标弹、未达标、无餐、同天重复、跨天重置
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.commit_msg.tmp`
- `CHANGELOG.md`
- `miniprogram/pages/index/index.js`
- `tests/frontend/index.test.js`
- `tests/frontend/setup.js`

## [2026-07-30] 1b46585

**﻿fix: 修复分享卡片页面 Canvas 节点查询时序导致的崩溃**

- canvas 被 wx:else 条件渲染控制，数据加载完成前 loading=true 导致 canvas 未渲染
- 改为先 setData({loading:false}) 再 wx.nextTick 查询 canvas，确保节点已渲染
- 改用 .fields({node:true,size:true}).exec() 标准模式替代 .node() 方法
- 增加 res[0]/node 空值判断和 3 次有限重试，避免直接崩溃
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`

## [2026-07-30] ae61fe6

**﻿fix: 修复分享卡片页面 Canvas 节点查询时序导致的崩溃**

- canvas 被 wx:else 条件渲染控制，数据加载完成前 loading=true 导致 canvas 未渲染
- 改为先 setData({loading:false}) 再 wx.nextTick 查询 canvas，确保节点已渲染
- 改用 .fields({node:true,size:true}).exec() 标准模式替代 .node() 方法
- 增加 res[0]/node 空值判断和 3 次有限重试，避免直接崩溃
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.commit_msg.tmp`
- `CHANGELOG.md`
- `miniprogram/pages/share-card/share-card.js`

## [2026-07-30] f24c360

**chore: remove temp commit msg file**

**涉及文件:**
- `.commit_msg.tmp`

## [2026-07-30] 2f732ce

**﻿feat: 实现今日战绩分享卡片功能**

- 新建 getShareCard 云函数聚合今日热量/蛋白质 vs 目标、本周体重变化、距目标差距、连续打卡天数
- 新建 getWxacode 云函数生成小程序码并上传云存储
- 更新 shared mock 支持 gte/lte 操作符和 wxacode.getUnlimited
- 更新 sync-common.js 加入两个新目标
- 新增 share-card 页面用 Canvas 2D 绘制贴纸风卡片
- 支持保存到相册（含权限拒绝引导去设置）
- 首页添加生成战绩入口按钮
- 为两个新云函数编写完整测试（连续打卡边界）
DEPLOY: cloudfunctions/getShareCard,cloudfunctions/getWxacode
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `.commit_msg.tmp`
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/getShareCard/common/logger.js`
- `cloudfunctions/getShareCard/index.js`
- `cloudfunctions/getShareCard/package.json`
- `cloudfunctions/getWxacode/common/logger.js`
- `cloudfunctions/getWxacode/config.json`
- `cloudfunctions/getWxacode/index.js`
- `cloudfunctions/getWxacode/package.json`
- `cloudfunctions/sync-common.js`
- `miniprogram/app.json`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/share-card/share-card.js`
- `miniprogram/pages/share-card/share-card.json`
- `miniprogram/pages/share-card/share-card.wxml`
- `miniprogram/pages/share-card/share-card.wxss`
- `tests/getShareCard.test.js`
- `tests/getWxacode.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getShareCard,cloudfunctions/getWxacode

## [2026-07-30] 6d0fb56

**feat: 新增菜单管理云函数和个人收藏功能**

- 新增 manageRecipe 云函数（管理员 CRUD），OPENID 通过 process.env.ADMIN_OPENID 配置
- 新增 toggleFavorite 云函数（收藏/取消收藏切换）
- 新增 getFavorites 云函数（获取用户收藏列表，联表查询 recipes）
- 新增 my-favorites 收藏页面及 profile 入口
- recipe-list/detail 添加收藏红心图标，recipe-list 新增"我的收藏"筛选
- 更新共享 mock 支持 user_favorites、orderBy、command.in
- sync-common.js 添加 3 个新云函数目标
DEPLOY: cloudfunctions/manageRecipe, cloudfunctions/toggleFavorite, cloudfunctions/getFavorites
VERIFIED: 仅本地jest测试通过，未做真机/云端验证
DATA IMPACT: 需手动新建 user_favorites 集合，权限仅创建者可读写

**涉及文件:**
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/getFavorites/common/logger.js`
- `cloudfunctions/getFavorites/index.js`
- `cloudfunctions/getFavorites/package.json`
- `cloudfunctions/manageRecipe/common/logger.js`
- `cloudfunctions/manageRecipe/index.js`
- `cloudfunctions/manageRecipe/package.json`
- `cloudfunctions/sync-common.js`
- `cloudfunctions/toggleFavorite/common/logger.js`
- `cloudfunctions/toggleFavorite/index.js`
- `cloudfunctions/toggleFavorite/package.json`
- `miniprogram/app.json`
- `miniprogram/pages/my-favorites/my-favorites.js`
- `miniprogram/pages/my-favorites/my-favorites.json`
- `miniprogram/pages/my-favorites/my-favorites.wxml`
- `miniprogram/pages/my-favorites/my-favorites.wxss`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxml`
- `miniprogram/pages/recipe-detail/recipe-detail.js`
- `miniprogram/pages/recipe-detail/recipe-detail.wxml`
- `miniprogram/pages/recipe-detail/recipe-detail.wxss`
- `miniprogram/pages/recipe-list/recipe-list.js`
- `miniprogram/pages/recipe-list/recipe-list.wxml`
- `miniprogram/pages/recipe-list/recipe-list.wxss`
- `tests/getFavorites.test.js`
- `tests/interface/response-schema.test.js`
- `tests/manageRecipe.test.js`
- `tests/toggleFavorite.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/manageRecipe, cloudfunctions/toggleFavorite, cloudfunctions/getFavorites

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