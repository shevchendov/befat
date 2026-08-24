# CHANGELOG / 迭代升级记录

## [2026-08-24] bc025c9

**feat: 每日食谱 AI 安全防护 + 前端换一换体验优化**

- getDailyMenu：Prompt 沙盒化（白名单食材池+强约束）、正则黑名单 blockingChecks 拦截生肉/刺身/野生等、forceRefresh 覆盖更新 + refresh_count 限流(code 94)
- daily-menu 前端：换一换 CTA 升级主色渐变饱满按钮、Typography Scale（菜名36/营养数字30/正文28）、骨架屏微光+弹跳动画
- 修复换一换不刷新 Bug：isGenerating/refreshing 分离、完整替换数组引用、code 94 明确 toast
- 营养数值加约字前缀、免责声明更新
- 新增测试 7 例（正则拦截/forceRefresh/限流），全量 633 通过
DEPLOY: cloudfunctions/getDailyMenu
VERIFIED: 仅本地jest测试通过（633/633），未做真机/云端验证
DATA IMPACT: daily_menus 新增 refresh_count/refreshed_at 字段（可选、向后兼容），首次生成会自动补齐

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/getDailyMenu/index.js`
- `miniprogram/pages/daily-menu/daily-menu.js`
- `miniprogram/pages/daily-menu/daily-menu.wxml`
- `miniprogram/pages/daily-menu/daily-menu.wxss`
- `tests/getDailyMenu.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getDailyMenu

## [2026-08-24] fdeca85

**fix: 清理用户可见文案中的 AI/智能等敏感字眼**

- log-food：拍照识菜→拍照记录、智能估算热量→估算热量、识别失败→分析失败
- daily-menu：智能食谱→食谱、AI 生成→自动生成
- getDailyMenu/parseFoodLog message：智能食谱→今日食谱、图片识别失败→图片分析失败、AI 解析失败→解析失败
- 同步更新测试断言文案，全量 626 通过
DEPLOY: cloudfunctions/getDailyMenu,cloudfunctions/parseFoodLog
VERIFIED: 仅本地jest测试通过（626/626），未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/getDailyMenu/index.js`
- `cloudfunctions/parseFoodLog/index.js`
- `miniprogram/pages/daily-menu/daily-menu.wxml`
- `miniprogram/pages/log-food/log-food.js`
- `miniprogram/pages/log-food/log-food.wxml`
- `tests/frontend/log-food.test.js`
- `tests/interface/cloud-function-contracts.test.js`
- `tests/parseFoodLog.test.js`
- `tests/security/api-key.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getDailyMenu,cloudfunctions/parseFoodLog

## [2026-08-21] 76c7781

**feat: 每日增肥食谱推荐——懒加载生成 + 快照收藏**

- 新增 getDailyMenu 云函数：占位锁防并发 + GLM-4-Flash 生成 + 后端重算总和 + code 93 兜底 + 时区修正
- 新增 toggleFavoriteRecipe 云函数：快照收藏/取消原子切换（_openid + recipe_title + meal_type 去重）
- 新增 daily-menu 前端页面（骨架屏/Pill汇总/四餐卡片/爱心乐观更新）
- 首页增肥食谱入口替换为今日增肥食谱
- sync-common 加入两个新函数；__mocks__ 补 daily_menus 集合与 recipe_title 过滤
- 新增测试 16 例，全量 626 通过
DEPLOY: cloudfunctions/getDailyMenu,cloudfunctions/toggleFavoriteRecipe
VERIFIED: 仅本地jest测试通过（626/626），未做真机/云端验证
DATA IMPACT: 新增 daily_menus 集合；user_favorites 新增 recipe_title/meal_type/recipe_snapshot 字段（向后兼容，旧 recipe_id 收藏不受影响），需控制台补建 idx_openid_meal_title 唯一索引

**涉及文件:**
- `CHANGELOG.md`
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/getDailyMenu/common/deleteHelper.js`
- `cloudfunctions/getDailyMenu/common/logger.js`
- `cloudfunctions/getDailyMenu/common/recipeValidation.js`
- `cloudfunctions/getDailyMenu/common/targetCalc.js`
- `cloudfunctions/getDailyMenu/index.js`
- `cloudfunctions/getDailyMenu/package.json`
- `cloudfunctions/sync-common.js`
- `cloudfunctions/toggleFavoriteRecipe/common/deleteHelper.js`
- `cloudfunctions/toggleFavoriteRecipe/common/logger.js`
- `cloudfunctions/toggleFavoriteRecipe/common/recipeValidation.js`
- `cloudfunctions/toggleFavoriteRecipe/common/targetCalc.js`
- `cloudfunctions/toggleFavoriteRecipe/index.js`
- `cloudfunctions/toggleFavoriteRecipe/package.json`
- `miniprogram/app.json`
- `miniprogram/pages/daily-menu/daily-menu.js`
- `miniprogram/pages/daily-menu/daily-menu.json`
- `miniprogram/pages/daily-menu/daily-menu.wxml`
- `miniprogram/pages/daily-menu/daily-menu.wxss`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `tests/getDailyMenu.test.js`
- `tests/toggleFavoriteRecipe.test.js`
- `每日增肥食谱推荐设计说明书.md`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getDailyMenu,cloudfunctions/toggleFavoriteRecipe

## [2026-08-21] 9139859

**docs: 同步文档到单次多模态调用架构**

- 设计规格书：术语/数据流/时序/后端设计/错误码/密钥/兜底全部从两步接力改为按模式单次调用
- README：功能描述、技术栈、超时配置（35s→20s）、环境变量表（第一棒/第二棒→图片/文本模式）
- 技术方案文档：第5节拍照识菜、功能列表、路线图同步单次多模态描述
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `README.md`
- `增肥小程序技术方案_DeepSeek输入版.md`
- `拍照识菜功能设计规格书.md`

## [2026-08-20] c71c415

**feat: log-food 拍照识菜——GLM 视觉识菜 + DeepSeek 营养计算双模型接力**

- parseFoodLog 新增图片模式：大小防御→imgSecCheck→GLM-4.6V-Flash(12s)识菜→DeepSeek-v4-flash(15s)营养计算，错误码 90/91/92，文本模式零回归
- log-food 前端：textarea 右下角相机触点，离屏 Canvas Max 800px 等比压缩转 base64
- 抽取 handleParseResult 复用文本/图片链路结果处理，降低重复
- 新增相机图标 SVG、README 补充 ZHIPU_API_KEY 与超时 35s 说明
- 新增/更新测试：parseFoodLog 图片模式 7 例 + 前端拍照/压缩/解析 7 例，共 609 用例全通过
- 新增设计规格书《拍照识菜功能设计规格书.md》
DEPLOY: cloudfunctions/parseFoodLog
VERIFIED: 仅本地jest测试通过（609/609），未做真机/云端验证
DATA IMPACT: 无

**涉及文件:**
- `CHANGELOG.md`
- `README.md`
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/parseFoodLog/index.js`
- `miniprogram/assets/icons/camera.svg`
- `miniprogram/pages/log-food/log-food.js`
- `miniprogram/pages/log-food/log-food.wxml`
- `miniprogram/pages/log-food/log-food.wxss`
- `tests/frontend/log-food.test.js`
- `tests/frontend/setup.js`
- `tests/parseFoodLog.test.js`
- `拍照识菜功能设计规格书.md`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/parseFoodLog

## [2026-08-19] 2ad9682

**docs: 更新 README 与技术方案文档以匹配 Phase 1 动态食谱系统**

- README 云函数清单 19→23 个，标记 generateRecipeInit/migrateRecipesNutrition 已退役
- README 新增 recipes 新 schema 字段表（nutrition 嵌套/status/version/versions 状态机）
- README 新增 recipeDataCleanup 环境变量说明与双重确认安全机制
- 技术方案文档更新食谱系统为动态审核发布流程、数据模型、页面清单、路线图
- __mocks__/wx-server-sdk.js 补充 orderBy().limit() 链（上次提交遗漏）
- CHANGELOG.md 为 hook 自动追加的 82cecf9 记录
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `README.md`
- `__mocks__/wx-server-sdk.js`
- `增肥小程序技术方案_DeepSeek输入版.md`

## [2026-08-12] 82cecf9

**feat: Phase 1 动态食谱系统——废弃历史食谱，重建新 schema 与安全读取/审核链路**

- 删除 generateRecipeInit 中 32 条硬编码 RECIPES，函数退役为空占位；migrateRecipesNutrition 同步退役
- 新建 recipeDataCleanup 云函数：dry_run 默认统计，execute 需 dry_run=false + confirm=DELETE_ALL_LEGACY_RECIPES 双重确认，仅清理 recipes 与孤儿 user_favorites，执行前后输出计数
- 新建 getPublishedRecipes / getRecipeDetail：仅返回 status=PUBLISHED，DTO 扁平化 calorie/protein_g 兼容 UI，支持分页
- 新建 validateRecipe 云函数 + common/recipeValidation.js 纯函数校验（标题/食材/步骤/标签/营养区间/source/重复检测，非 LLM）
- manageRecipe 重构：新 schema（nutrition 嵌套/status/version/versions/nutrition_snapshot），状态流 add→DRAFT→submit(VALIDATING)→review(approve→APPROVED/reject→REJECTED)→approve→PUBLISHED，archive/rollback，version 永远递增，客户端不可直接设 PUBLISHED
- getFavorites 仅返回 PUBLISHED 食谱并 DTO 扁平化
- recipe-list / recipe-detail 前端由客户端直读 DB 改为云函数；detail wxml 适配结构化 ingredients
- 新增/更新测试：getPublishedRecipes/getRecipeDetail/validateRecipe/recipeDataCleanup/manageRecipe/getFavorites/frontend 共 595 用例全部通过
- common/recipeValidation.js 经 sync-common 同步至各云函数 common/ 目录
DEPLOY: cloudfunctions/manageRecipe,cloudfunctions/getFavorites,cloudfunctions/getPublishedRecipes,cloudfunctions/getRecipeDetail,cloudfunctions/validateRecipe,cloudfunctions/recipeDataCleanup,cloudfunctions/generateRecipeInit,cloudfunctions/migrateRecipesNutrition
VERIFIED: 仅本地jest测试通过（595/595），未做真机/云端验证；线上真实删库需部署 recipeDataCleanup 后手动 dry-run→confirm 执行
DATA IMPACT: recipes 集合从旧顶层 calorie/protein_g 改为嵌套 nutrition+status/version/versions 新结构，历史数据经 recipeDataCleanup 清空重建；user_favorites 结构不变但需清理孤儿记录

**涉及文件:**
- `cloudfunctions/calcTarget/common/recipeValidation.js`
- `cloudfunctions/checkMealReminder/common/recipeValidation.js`
- `cloudfunctions/common/recipeValidation.js`
- `cloudfunctions/deleteUserData/common/recipeValidation.js`
- `cloudfunctions/exportUserData/common/recipeValidation.js`
- `cloudfunctions/generateRecipeInit/common/recipeValidation.js`
- `cloudfunctions/generateRecipeInit/index.js`
- `cloudfunctions/getDailySummary/common/recipeValidation.js`
- `cloudfunctions/getFavorites/common/recipeValidation.js`
- `cloudfunctions/getFavorites/index.js`
- `cloudfunctions/getPublishedRecipes/common/deleteHelper.js`
- `cloudfunctions/getPublishedRecipes/common/logger.js`
- `cloudfunctions/getPublishedRecipes/common/recipeValidation.js`
- `cloudfunctions/getPublishedRecipes/common/targetCalc.js`
- `cloudfunctions/getPublishedRecipes/index.js`
- `cloudfunctions/getPublishedRecipes/package.json`
- `cloudfunctions/getRecipeDetail/common/deleteHelper.js`
- `cloudfunctions/getRecipeDetail/common/logger.js`
- `cloudfunctions/getRecipeDetail/common/recipeValidation.js`
- `cloudfunctions/getRecipeDetail/common/targetCalc.js`
- `cloudfunctions/getRecipeDetail/index.js`
- `cloudfunctions/getRecipeDetail/package.json`
- `cloudfunctions/getStats/common/recipeValidation.js`
- `cloudfunctions/manageRecipe/common/recipeValidation.js`
- `cloudfunctions/manageRecipe/index.js`
- `cloudfunctions/migrateRecipesNutrition/index.js`
- `cloudfunctions/parseFoodLog/common/recipeValidation.js`
- `cloudfunctions/recalcTarget/common/recipeValidation.js`
- `cloudfunctions/recipeDataCleanup/common/deleteHelper.js`
- `cloudfunctions/recipeDataCleanup/common/logger.js`
- `cloudfunctions/recipeDataCleanup/common/recipeValidation.js`
- `cloudfunctions/recipeDataCleanup/common/targetCalc.js`
- `cloudfunctions/recipeDataCleanup/index.js`
- `cloudfunctions/recipeDataCleanup/package.json`
- `cloudfunctions/resetUserData/common/recipeValidation.js`
- `cloudfunctions/saveWeightLog/common/recipeValidation.js`
- `cloudfunctions/sync-common.js`
- `cloudfunctions/toggleFavorite/common/recipeValidation.js`
- `cloudfunctions/updateTargetManual/common/recipeValidation.js`
- `cloudfunctions/validateRecipe/common/deleteHelper.js`
- `cloudfunctions/validateRecipe/common/logger.js`
- `cloudfunctions/validateRecipe/common/recipeValidation.js`
- `cloudfunctions/validateRecipe/common/targetCalc.js`
- `cloudfunctions/validateRecipe/index.js`
- `cloudfunctions/validateRecipe/package.json`
- `miniprogram/pages/recipe-detail/recipe-detail.js`
- `miniprogram/pages/recipe-detail/recipe-detail.wxml`
- `miniprogram/pages/recipe-list/recipe-list.js`
- `tests/frontend/recipe-detail.test.js`
- `tests/frontend/recipe-list.test.js`
- `tests/generateRecipeInit.test.js`
- `tests/getFavorites.test.js`
- `tests/getPublishedRecipes.test.js`
- `tests/getRecipeDetail.test.js`
- `tests/manageRecipe.test.js`
- `tests/recipeDataCleanup.test.js`
- `tests/validateRecipe.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/manageRecipe,cloudfunctions/getFavorites,cloudfunctions/getPublishedRecipes,cloudfunctions/getRecipeDetail,cloudfunctions/validateRecipe,cloudfunctions/recipeDataCleanup,cloudfunctions/generateRecipeInit,cloudfunctions/migrateRecipesNutrition

## [2026-08-12] 0220ef7

**docs: 优化小程序审核用户可见的 AI 相关文案**

- log-food 输入提示/按钮/结果标题改为功能描述：估算结果、智能估算热量、正在分析请稍候
- 各页面免责声明由『本内容由AI生成』改为功能性描述：以上内容/食谱及营养信息/相关建议/以上健康信息 仅供参考，不构成医疗建议
- profile 热量误差文案弱化为『可能存在一定误差』
- 仅改用户可见文案，AI 能力/云函数/API/数据库/技术架构未动
DEPLOY: none
VERIFIED: 仅本地 jest 测试通过，未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/log-food/log-food.wxml`
- `miniprogram/pages/my-favorites/my-favorites.wxml`
- `miniprogram/pages/onboarding/onboarding.wxml`
- `miniprogram/pages/profile/profile.wxml`
- `miniprogram/pages/recipe-detail/recipe-detail.wxml`
- `miniprogram/pages/recipe-list/recipe-list.wxml`
- `miniprogram/pages/weight-track/weight-track.wxml`

## [2026-08-12] 090d56f

**fix: 首页写操作后强制刷新，修复 TTL 时机与请求竞态**

- log-food/weight-track/target-edit 写库成功后设置 forceIndexRefresh，返回首页立即刷新，不再依赖 30s TTL 兜底；失败路径不设置
- 首页 _lastLoadTs/_lastLoadDate 改为请求成功且数据落地后再更新，失败不更新以便下次 onShow 重试
- loadData/loadGoalProgress 增加请求序号，旧请求返回不得覆盖新请求结果
- 测试 setup 的 getApp 改为稳定单例，新增 16 个用例覆盖写后刷新/TTL/竞态场景
DEPLOY: none
VERIFIED: 仅本地 jest 测试通过，未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/log-food/log-food.js`
- `miniprogram/pages/target-edit/target-edit.js`
- `miniprogram/pages/weight-track/weight-track.js`
- `tests/frontend/index.test.js`
- `tests/frontend/log-food.test.js`
- `tests/frontend/setup.js`
- `tests/frontend/target-edit.test.js`
- `tests/frontend/weight-track.test.js`

## [2026-08-11] 61584bd

**docs: 更新 README 项目文档与 CHANGELOG**

- README 重构：更新功能/云函数/页面清单、新增数据库集合说明、完善配置部署章节与踩坑记录
- CHANGELOG 追加上一条提交 498e13d 的迭代记录
DEPLOY: none
VERIFIED: 仅本地 jest 测试通过，未做真机/云端验证（纯文档改动）

**涉及文件:**
- `CHANGELOG.md`
- `README.md`

## [2026-08-07] 498e13d

**feat: 云函数配额优化与 getGoalProgress 截断修复**

- 首页 onShow 数据加 30s TTL 缓存：navigateBack 按来源页 route 判断脏/净强制刷新（写数据的 log-food/weight-track/target-edit/profile 走脏），reLaunch 场景（onboarding 提交后）用 globalData.forceIndexRefresh 标记兜底，跨天自动刷新；本地问候语/目标数据缓存命中时照常更新
- 食谱相关三页（recipe-list/my-favorites/recipe-detail）共享 getFavorites 30s 缓存到 globalData.favoritesCache，toggleFavorite 成功后失效
- 我的档案页 getGoalProgress 结果 30s TTL 缓存，只缓存成功结果，失败不缓存避免掩盖瞬时故障
- 修复 getGoalProgress 体重记录超 100 条时被截断成最旧数据导致 current_weight 错位的 bug：改 orderBy desc + limit(100) + reverse，趋势/速率/预估分支逻辑零改动，新增 110 条记录回归测试
- getGoalProgress 测试 mock 模拟云函数单次 get 100 条上限并支持 limit()
DEPLOY: cloudfunctions/getGoalProgress
VERIFIED: 真机测试通过，验证了首页缓存命中与写操作后强制刷新（体重打卡/记录饮食/修改目标返回首页数据即时更新）、onboarding 提交后回首页数据正确、我的档案体重显示、收藏页缓存与取消失效

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/getGoalProgress/index.js`
- `miniprogram/app.js`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/my-favorites/my-favorites.js`
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/recipe-detail/recipe-detail.js`
- `miniprogram/pages/recipe-list/recipe-list.js`
- `tests/frontend/index.test.js`
- `tests/frontend/profile.test.js`
- `tests/getGoalProgress.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getGoalProgress

## [2026-08-07] 594d248

**feat: 新增达标统计入口替换生成战绩**

- 首页第3入口由「生成战绩」改为「📈 达标统计」，跳转新增 pages/stats 页面
- stats 页展示 7/30 天热量/蛋白达标率概览、体重曲线叠加达标/未达标/无记录色点、每周达标率 vs 体重变化对照条，标注"按当前目标计算"
- 新增 getStats 云函数：服务端聚合 food_logs/weight_logs/users，按当前目标回溯计算达标率，返回精简结果（含 100 条分页拉取）
- 彻底删除 share-card 页面、getShareCard/getWxacode 云函数及相关测试，sync-common TARGETS 同步移除
- 清理 __mocks__ 中已无调用方的 wxacode/uploadFile mock
DEPLOY: cloudfunctions/getStats
VERIFIED: 仅本地jest测试通过（512/512，含新增getStats 9项），未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/getShareCard/common/deleteHelper.js`
- `cloudfunctions/getShareCard/common/logger.js`
- `cloudfunctions/getShareCard/common/targetCalc.js`
- `cloudfunctions/getShareCard/index.js`
- `cloudfunctions/getShareCard/package.json`
- `cloudfunctions/getStats/common/deleteHelper.js`
- `cloudfunctions/getStats/common/logger.js`
- `cloudfunctions/getStats/common/targetCalc.js`
- `cloudfunctions/getStats/index.js`
- `cloudfunctions/getStats/package.json`
- `cloudfunctions/getWxacode/common/deleteHelper.js`
- `cloudfunctions/getWxacode/common/logger.js`
- `cloudfunctions/getWxacode/common/targetCalc.js`
- `cloudfunctions/getWxacode/config.json`
- `cloudfunctions/getWxacode/index.js`
- `cloudfunctions/getWxacode/package.json`
- `cloudfunctions/sync-common.js`
- `miniprogram/app.json`
- `miniprogram/common/theme.wxss`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/share-card/share-card.js`
- `miniprogram/pages/share-card/share-card.json`
- `miniprogram/pages/share-card/share-card.wxml`
- `miniprogram/pages/share-card/share-card.wxss`
- `miniprogram/pages/stats/stats.js`
- `miniprogram/pages/stats/stats.json`
- `miniprogram/pages/stats/stats.wxml`
- `miniprogram/pages/stats/stats.wxss`
- `tests/getShareCard.test.js`
- `tests/getStats.test.js`
- `tests/getWxacode.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getStats

## [2026-08-06] 92d85ab

**feat: 放大我的档案卡片字体与间距**

- 标题32->40、大数字40->60、标签24->30、BMI数值28->44、状态字26->32、分界值18->24、段名标签20->32
- 连带调整 user-stats/bmi-display padding、bmi-range-wrap padding-bottom、分界值 top、游标高度与位置
- 分界值 top 取36、padding-bottom 取48：游标底边与分界值数字严格不重叠，长文案（danger）单行不破版
DEPLOY: none
VERIFIED: 仅本地jest测试通过（519/519），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/profile/profile.wxss`

## [2026-08-06] 8190680

**fix: 档案页当前体重与BMI改用最新打卡记录**

- profile.js loadUserData 并行调用 getGoalProgress，当前体重优先取最新体重打卡记录（与首页目标进度卡同源），不再用 onboarding 起始快照 users.current_weight_kg
- BMI/健康提示/范围条游标同步改用最新体重计算
- getGoalProgress 返回非0或抛异常时兜底 users.current_weight_kg，不阻断档案加载
- 新增3个测试：最新打卡胜出起始快照、返回非0回退起始值、抛异常不阻断加载
DEPLOY: none
VERIFIED: 仅本地jest测试通过（519/519），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/profile/profile.js`
- `tests/frontend/profile.test.js`

## [2026-08-06] 5b39cc6

**fix: 档案页当前体重与BMI改用最新打卡记录**

- profile.js loadUserData 并行调用 getGoalProgress，当前体重优先取最新体重打卡记录（与首页目标进度卡同源），不再用 onboarding 起始快照 users.current_weight_kg
- BMI/健康提示/范围条游标同步改用最新体重计算
- getGoalProgress 返回非0或抛异常时兜底 users.current_weight_kg，不阻断档案加载
- 新增3个测试：最新打卡胜出起始快照、返回非0回退起始值、抛异常不阻断加载
DEPLOY: none
VERIFIED: 仅本地jest测试通过（519/519），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxss`
- `tests/frontend/profile.test.js`

## [2026-08-06] d7215c5

**feat: profile 页 BMI 展示升级为范围条可视化**

- 将 BMI 展示区由单行参考文字改为三段色条：偏瘦(<18.5)/正常(18.5~24)/偏高(>=24)，配色复用现有 warning/success/accent-orange 变量
- 当前 BMI 值用深色游标标记在条上对应位置，展示域 14~30 将 BMI 映射为百分比位置
- 极端值（BMI<14 或 >30）游标钳制在 [2%,98%] 内不越出可视区域
- 分界值 18.5/24 以绝对定位对齐真实边界，段名标签按段宽对齐
- profile.js 顶部注释说明展示域/钳制等魔法数字的由来，阈值与 util.getHealthWarning 严格一致
- 新增 3 个游标定位测试：正常值计算、左右两端钳制
DEPLOY: none
VERIFIED: 仅本地jest测试通过（516/516），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxml`
- `miniprogram/pages/profile/profile.wxss`
- `tests/frontend/profile.test.js`

## [2026-08-06] 9db1984

**feat: 体重输入统一2位小数并增加目标前端预校验**

- validators.sanitizeDigit 统一限制小数2位，作为输入过滤单一规则源
- 新增 targetGuard.js 前端轻量预校验：目标体重>300 用 toast、BMI<16 与每周增重>1kg 用 modal，文案与云函数 validateWeights 逐字对齐
- onboarding step2 下一步接入预校验，目标体重600此类非法输入在step2即被拦截，不再白填到step3
- target-edit 重算模式接入同一预校验（身高取自用户档案），手动模式保持原设计不变
- onboarding 体重输入 maxlength 3改5，支持输入2位小数；target-edit 删除手动1位小数限制、字符上限放宽到6
- weight-track 删除冗余手动小数切片，统一走 sanitizeDigit
- 展示层体重统一2位小数：首页 goal 卡 fmtW 改 toFixed(2)、profile 页新增展示字段
- 测试：新增 validators/targetGuard/target-edit，扩展 onboarding/weight-track，setup.js 支持点路径 setData
DEPLOY: none
VERIFIED: 仅本地jest测试通过（513/513），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/onboarding/onboarding.wxml`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxml`
- `miniprogram/pages/target-edit/target-edit.js`
- `miniprogram/pages/weight-track/weight-track.js`
- `miniprogram/utils/targetGuard.js`
- `miniprogram/utils/validators.js`
- `tests/frontend/onboarding.test.js`
- `tests/frontend/setup.js`
- `tests/frontend/target-edit.test.js`
- `tests/frontend/targetGuard.test.js`
- `tests/frontend/validators.test.js`
- `tests/frontend/weight-track.test.js`

## [2026-08-06] 94e41e1

**feat: 首页新增"我的"入口跳转 profile 页**

- index 页 hero-banner 右上角新增"我的"胶囊按钮（复用 hero-badge 半透明白样式）
- profile 页此前为死页面（无任何跳转入口），现可从首页进入使用导出/重置/删除功能
DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.wxss`

## [2026-08-06] d5f4e89

**feat: 新增"重置为新用户"功能并修复 deleteUserData 漏删收藏**

- 新增 resetUserData 云函数：保留 users 文档(_id/_openid/created_at)，清空全部业务字段与 food_logs/weight_logs/user_favorites，要求 confirm===true 且仅操作自身 openid，操作写入 error_logs(action=reset_user) 审计
- 抽出公共 batchDeleteByOpenid 供 deleteUserData/resetUserData 共用
- 修复 deleteUserData 漏删 user_favorites 的既有 bug
- onboarding/app/profile 三处"是否已初始化"判断改为 target_weight_kg != null，重置后能正确重新走 onboarding
DEPLOY: cloudfunctions/resetUserData,cloudfunctions/deleteUserData
VERIFIED: 仅本地jest测试通过（483/483），未做真机/云端验证
DATA IMPACT: 无数据结构变化；resetUserData 仅清空既有字段值并新增 error_logs 审计记录

**涉及文件:**
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/calcTarget/common/deleteHelper.js`
- `cloudfunctions/checkMealReminder/common/deleteHelper.js`
- `cloudfunctions/common/deleteHelper.js`
- `cloudfunctions/deleteUserData/common/deleteHelper.js`
- `cloudfunctions/deleteUserData/index.js`
- `cloudfunctions/exportUserData/common/deleteHelper.js`
- `cloudfunctions/generateRecipeInit/common/deleteHelper.js`
- `cloudfunctions/getDailySummary/common/deleteHelper.js`
- `cloudfunctions/getFavorites/common/deleteHelper.js`
- `cloudfunctions/getShareCard/common/deleteHelper.js`
- `cloudfunctions/getWxacode/common/deleteHelper.js`
- `cloudfunctions/manageRecipe/common/deleteHelper.js`
- `cloudfunctions/parseFoodLog/common/deleteHelper.js`
- `cloudfunctions/recalcTarget/common/deleteHelper.js`
- `cloudfunctions/resetUserData/common/deleteHelper.js`
- `cloudfunctions/resetUserData/common/logger.js`
- `cloudfunctions/resetUserData/common/targetCalc.js`
- `cloudfunctions/resetUserData/index.js`
- `cloudfunctions/resetUserData/package.json`
- `cloudfunctions/saveWeightLog/common/deleteHelper.js`
- `cloudfunctions/sync-common.js`
- `cloudfunctions/toggleFavorite/common/deleteHelper.js`
- `cloudfunctions/updateTargetManual/common/deleteHelper.js`
- `miniprogram/app.js`
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/profile/profile.js`
- `miniprogram/pages/profile/profile.wxml`
- `tests/deleteUserData.test.js`
- `tests/frontend/app.test.js`
- `tests/frontend/onboarding.test.js`
- `tests/frontend/profile.test.js`
- `tests/resetUserData.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/resetUserData,cloudfunctions/deleteUserData

## [2026-08-06] 3b51898

**fix: 目标预计达成日期改为跟随目标体重变化**

- 修复 target-edit 修改目标后首页预计日期不变：branch C 兜底从固定计划日期改为按冻结期望周速率推算
- 新增 users.expected_weekly_rate 快照（onboarding 写入，recalcTarget 仅在周期变化/首次设置/老用户缺失时重算）
- getGoalProgress 新增 estimate_basis 字段区分实测/计划推算，前端按 basis 切换文案（照这个节奏/按你的计划）
DEPLOY: cloudfunctions/calcTarget,cloudfunctions/recalcTarget,cloudfunctions/getGoalProgress
VERIFIED: 仅本地jest测试通过（463/463），未做真机/云端验证
DATA IMPACT: users 新增可空 expected_weekly_rate(number)，旧文档不迁移，走重算补写

**涉及文件:**
- `cloudfunctions/calcTarget/common/targetCalc.js`
- `cloudfunctions/calcTarget/index.js`
- `cloudfunctions/checkMealReminder/common/targetCalc.js`
- `cloudfunctions/common/targetCalc.js`
- `cloudfunctions/deleteUserData/common/targetCalc.js`
- `cloudfunctions/exportUserData/common/targetCalc.js`
- `cloudfunctions/generateRecipeInit/common/targetCalc.js`
- `cloudfunctions/getDailySummary/common/targetCalc.js`
- `cloudfunctions/getFavorites/common/targetCalc.js`
- `cloudfunctions/getGoalProgress/index.js`
- `cloudfunctions/getShareCard/common/targetCalc.js`
- `cloudfunctions/getWxacode/common/targetCalc.js`
- `cloudfunctions/manageRecipe/common/targetCalc.js`
- `cloudfunctions/parseFoodLog/common/targetCalc.js`
- `cloudfunctions/recalcTarget/common/targetCalc.js`
- `cloudfunctions/recalcTarget/index.js`
- `cloudfunctions/saveWeightLog/common/targetCalc.js`
- `cloudfunctions/toggleFavorite/common/targetCalc.js`
- `cloudfunctions/updateTargetManual/common/targetCalc.js`
- `miniprogram/pages/goal-detail/goal-detail.wxml`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `tests/calcTarget.test.js`
- `tests/getGoalProgress.test.js`
- `tests/recalcTarget.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/calcTarget,cloudfunctions/recalcTarget,cloudfunctions/getGoalProgress

## [2026-08-06] 3adacf4

**feat: 目标周期可配置化，getGoalProgress 新增计划日期与节奏对比**

- validateWeights 新增 targetWeeks 参数，速率校验周期可配置（默认4周不回归）
- calcTarget/recalcTarget 透传并存储 target_weeks + target_weeks_set_at
- recalcTarget 未重新填周期时速率校验回退到库中已存周期
- getGoalProgress 新增 planned_date/pace_status/plan_expired 三字段
- pace_status 采用 14 天容差防临界抖动（on_track/ahead/behind）
- 方向相反时不被计划周期兜底覆盖，保持原有安全降级
- onboarding/target-edit 重算模式新增周期输入，手动模式不变
DEPLOY: cloudfunctions/calcTarget, cloudfunctions/recalcTarget, cloudfunctions/getGoalProgress
VERIFIED: 仅本地jest测试通过，未做真机/云端验证
DATA IMPACT: users 表新增可空字段 target_weeks(整数1-104)与 target_weeks_set_at(YYYY-MM-DD)，旧文档不迁移

**涉及文件:**
- `cloudfunctions/calcTarget/common/targetCalc.js`
- `cloudfunctions/calcTarget/index.js`
- `cloudfunctions/checkMealReminder/common/targetCalc.js`
- `cloudfunctions/common/targetCalc.js`
- `cloudfunctions/deleteUserData/common/targetCalc.js`
- `cloudfunctions/exportUserData/common/targetCalc.js`
- `cloudfunctions/generateRecipeInit/common/targetCalc.js`
- `cloudfunctions/getDailySummary/common/targetCalc.js`
- `cloudfunctions/getFavorites/common/targetCalc.js`
- `cloudfunctions/getGoalProgress/index.js`
- `cloudfunctions/getShareCard/common/targetCalc.js`
- `cloudfunctions/getWxacode/common/targetCalc.js`
- `cloudfunctions/manageRecipe/common/targetCalc.js`
- `cloudfunctions/parseFoodLog/common/targetCalc.js`
- `cloudfunctions/recalcTarget/common/targetCalc.js`
- `cloudfunctions/recalcTarget/index.js`
- `cloudfunctions/saveWeightLog/common/targetCalc.js`
- `cloudfunctions/toggleFavorite/common/targetCalc.js`
- `cloudfunctions/updateTargetManual/common/targetCalc.js`
- `miniprogram/pages/onboarding/onboarding.js`
- `miniprogram/pages/onboarding/onboarding.wxml`
- `miniprogram/pages/target-edit/target-edit.js`
- `miniprogram/pages/target-edit/target-edit.wxml`
- `tests/calcTarget.test.js`
- `tests/getGoalProgress.test.js`
- `tests/recalcTarget.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/calcTarget, cloudfunctions/recalcTarget, cloudfunctions/getGoalProgress

## [2026-08-05] e9733c9

**fix: 修复日期时间本地化格式化真机显示为英文**

- 新增 utils/dateFormat.js 统一日期时间中文格式化工具模块
- 首页首屏日期改用 formatDateShortCN（8月4日 周二，无年份，语义不变）
- 用餐记录时间改用 formatTimeShortCN（08:30 时:分，语义不变）
- 修复真机 JSCore/V8 下 toLocaleDateString/toLocaleTimeString 输出英文格式
DEPLOY: none
VERIFIED: 未测试

**涉及文件:**
- `miniprogram/pages/index/index.js`
- `miniprogram/utils/dateFormat.js`

## [2026-08-04] 1d3bef5

**fix: goal-detail 折线图字号统一与目标标签定位调整**

- Y/X轴刻度字号 20→16px，Y轴网格 4格→3格增大行距
- X轴底部padding额外+10px并按完整投影宽预留，修复斜排日期底部裁切
- 目标标签简化为紧贴目标虚线上方、水平居中，移除碰撞检测候选逻辑
DEPLOY: none
VERIFIED: 未测试

**涉及文件:**
- `miniprogram/pages/goal-detail/goal-detail.js`

## [2026-08-04] 27d9428

**fix: 调整体重打卡页标题与图表间距**

- .chart-canvas 设 display:block 消除行内基线间隙
- 绘图区顶部 padding 40→16，标题到图表距离与另两处一致
- 顶部Y轴刻度不贴边，goal-detail 独立padT不受影响
DEPLOY: none
VERIFIED: 未测试

**涉及文件:**
- `miniprogram/pages/weight-track/weight-track.js`
- `miniprogram/pages/weight-track/weight-track.wxss`

## [2026-08-04] d04e0ea

**fix: X轴标签抽样临界抖动加容差**

- computeLabelStep 判定改为 pointSpacing >= projectedW*0.9 才全显
- 消除间距仅比投影宽小几像素时 step 在1/2间跳变
- 新增临界区单测验证（45/46、45.6/46 均返回1）
DEPLOY: none
VERIFIED: 未测试

**涉及文件:**
- `miniprogram/utils/canvasChart.js`
- `tests/frontend/canvasChart.test.js`

## [2026-08-04] 0841175

**fix: weight-track 折线图刻度字号与Y轴行数调整**

- Y轴刻度字号 20→16px，左侧 padding margin 16→14，避免数字视觉拥挤
- X轴日期标签字号同步 16px，与Y轴一致
- Y轴水平网格线 4格(5条)减为 3格(4条)，增大行间距
- 仅 weight-track 单独调整，goal-detail 保持原样不复用相同字号
DEPLOY: none
VERIFIED: 未测试

**涉及文件:**
- `miniprogram/pages/weight-track/weight-track.js`

## [2026-08-04] 346f530

**chore: getShareCard 增加分段耗时埋点便于定位慢查询**

- invoke 后记 t0，批次1（今日/用户/本周/最新体重4条并行查询）完成后记 t1
- countConsecutive（批次2 连续天数2条并行查询）完成后记 t2
- 日志输出 dbBatch1/dbBatch2/postBatch2 分段耗时，区分冷启动 vs 查询耗时
- 实际耗时归因：三次调用 106-262ms，两批查询各 50-165ms，无慢查询；
  此前的 2.13s 大概率是云函数冷启动，索引已确认存在排除查询瓶颈
DEPLOY: cloudfunctions/getShareCard
VERIFIED: 云函数控制台日志确认埋点生效，三次调用分段耗时正常；未做额外真机验证

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/getShareCard/index.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/getShareCard

## [2026-08-04] 57b2a90

**feat: 抽取公共Canvas绘图工具并统一两个折线图排版**

- 新增 miniprogram/utils/canvasChart.js（dpr适配/Y轴padding/X轴45度斜排/通用碰撞检测）
- goal-detail 图表改用公共工具，修复X轴日期重叠与目标标签遮挡数据点
- weight-track 图表改用公共工具，去掉手动*dpr坐标缩放
- 新增 tests/frontend/canvasChart.test.js 单测
- 修复 getShareCard 本周变化测试的日期敏感问题
- 修复 generateRecipeInit 食谱热量上限断言（CDC数据772kcal）
DEPLOY: none
VERIFIED: 仅本地jest测试通过（442/442），未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `miniprogram/pages/goal-detail/goal-detail.js`
- `miniprogram/pages/weight-track/weight-track.js`
- `miniprogram/utils/canvasChart.js`
- `tests/frontend/canvasChart.test.js`
- `tests/generateRecipeInit.test.js`
- `tests/getShareCard.test.js`

## [2026-08-04] efa7852

**fix: saveFoodLog 新建记录补写 _openid 修复合并失效**

- saveFoodLog 的 add 补 _openid: openid，云函数服务端 add 不会自动注入 _openid
- saveFoodLog 测试改用自有 mock（add 不自动注入 _openid），新增 _openid 回归断言
- 修复前该测试与合并测试均失败，复现线上"晚餐写两条"根因
DEPLOY: cloudfunctions/saveFoodLog
VERIFIED: 仅本地jest测试通过（saveFoodLog 9/9），未做真机/云端验证

**涉及文件:**
- `CHANGELOG.md`
- `cloudfunctions/saveFoodLog/index.js`
- `tests/saveFoodLog.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/saveFoodLog

## [2026-08-04] c62d0ed

**feat: 同一天同一餐次的多次食物记录合并写入一条 food_logs**

- 新增 saveFoodLog 云函数，按 _openid+date+meal_type 查重，存在则 update 合并、不存在则新建
- 合并时 parsed_items 追加、total 重算、raw_text 以换行拼接、created_at 保持最早、新增 updated_at
- log-food 前端改为调用 saveFoodLog 云函数
- checkMealReminder 排序字段改 updated_at 以适配合并记录
DEPLOY: cloudfunctions/saveFoodLog,cloudfunctions/checkMealReminder
VERIFIED: 仅本地jest测试通过（425项），未做真机/云端验证
DATA IMPACT: food_logs 记录由每次一条变为每餐每天一条；新增 updated_at 字段；需在云开发控制台新建复合索引 _openid+date+meal_type

**涉及文件:**
- `__mocks__/wx-server-sdk.js`
- `cloudfunctions/checkMealReminder/index.js`
- `cloudfunctions/saveFoodLog/common/logger.js`
- `cloudfunctions/saveFoodLog/index.js`
- `cloudfunctions/saveFoodLog/package.json`
- `miniprogram/pages/log-food/log-food.js`
- `tests/checkMealReminder.test.js`
- `tests/frontend/log-food.test.js`
- `tests/saveFoodLog.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/saveFoodLog,cloudfunctions/checkMealReminder

## [2026-08-03] 81f8a9e

**feat: 体重趋势图X轴日期标签改为全部显示并倾斜45度**

- 取消间隔抽样，默认全部日期标签按 -45° 旋转显示
- 底部 padding 依据旋转后文字等效半高动态加大，避免标签被画布底部裁切
- 用 measureText+45°投影宽度做相邻标签重叠检测，空间不足才回退抽样兜底
DEPLOY: none
VERIFIED: 仅本地jest测试通过（414项），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/weight-track/weight-track.js`

## [2026-08-03] fe49b03

**fix: 修复体重打卡页面体重趋势图排版问题**

- Y轴：按刻度文字实际宽度动态预留左侧 padding（原固定 60*dpr 导致 toFixed(2) 文本越过画布左缘被截断），绘图区随之缩进
- X轴：改为按标签实际宽度自适应抽样，保证相邻日期标签间距不小于 标签宽+12*dpr，消除 5 个点时的标签重叠
- 保持 weight-track 原有 dpr 方式，未抽取公共绘图函数
DEPLOY: none
VERIFIED: 仅本地jest测试通过（414项），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/weight-track/weight-track.js`

## [2026-08-03] 1afc834

**fix: 新用户首页目标卡片优雅降级为引导空状态**

- loadGoalProgress 收到 code -1（用户未完成 onboarding）时不再静默隐藏，改为展示引导卡片
- 新增目标引导卡：设定目标入口，点击跳转 onboarding
- 正常用户渲染逻辑不变
DEPLOY: none
VERIFIED: 仅本地jest测试通过（414项），未做真机/云端验证

**涉及文件:**
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.wxss`

## [2026-08-03] 0fc8512

**fix: parseFoodLog 切换 DeepSeek model 至 deepseek-v4-flash**

- model 参数从已退休的 deepseek-chat 改为 deepseek-v4-flash
- 同步更新 deepseek-http 接口合约测试断言
- 排查确认全项目仅此一处调用，无共享封装需同步
- 核查错误处理：调用失败返回 code 3 而非静默写入，无 0 值降级路径
DEPLOY: cloudfunctions/parseFoodLog
VERIFIED: 仅本地jest测试通过（59项），未做真机/云端验证
DATA IMPACT: none

**涉及文件:**
- `cloudfunctions/parseFoodLog/index.js`
- `tests/interface/deepseek-http.test.js`
⚠️ 待确认：以下云函数是否已重新部署 → cloudfunctions/parseFoodLog

## [2026-08-03] c07390b

**chore: 确认 CHANGELOG 部署与真机验证状态**

DEPLOY: none
VERIFIED: 真机测试通过

**涉及文件:**
- `CHANGELOG.md`

## [2026-08-03] 0ba0919

**chore: 更新 CHANGELOG 记录 14d4975**

DEPLOY: none
VERIFIED: 真机测试通过

**涉及文件:**
- `CHANGELOG.md`

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
✅ 已部署并真机验证：recalcTarget、updateTargetManual、calcTarget

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