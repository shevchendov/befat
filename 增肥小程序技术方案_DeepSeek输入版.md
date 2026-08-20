# 增肥小程序 —— MVP 技术方案（DeepSeek 编码输入版）

> 本文档定位：不是给人看的产品PPT，是直接喂给 DeepSeek 做代码生成的规格说明。每个模块可以单独截取一段作为一次 DeepSeek 会话的 prompt。

---

## 0. 一句话定义

面向"吃不胖/没食欲/懒得吃"人群的微信小程序，核心是反向的热量记录 + 吃饭提醒 + 增重打卡激励，不做减肥app的克制逻辑，做的是"怎么让用户愿意多吃、按时吃"。

---

## 1. MVP 功能范围（第一版只做这些，其他全部砍掉）

### 必须做（P0）
1. **用户基础信息与目标设定**：身高、体重、目标体重、性别、活动水平 → 计算每日目标热量（TDEE + 增重盈余，一般 TDEE+300~500kcal）和蛋白质目标（1.6~2.2g/kg体重）
2. **饮食记录（文字 + 拍照识菜双模式）**：文字描述走 DeepSeek 解析；拍照识菜走「智谱 GLM 视觉识菜 → DeepSeek 营养计算」双模型接力，输出食物名称+估算份量+热量+蛋白质，结构化存库
3. **每日进度页**：当日已摄入热量/蛋白质 vs 目标，环形进度条
4. **体重打卡**：每日/每周记录体重，生成体重趋势折线图
5. **吃饭提醒**：定时提醒（微信订阅消息），核心是"两餐间隔过长"提醒，而不是固定时间闹钟
6. **高热量食谱库**：动态食谱系统，管理员通过 `manageRecipe` 云函数走审核发布流程（DRAFT→VALIDATING→APPROVED→PUBLISHED），用户通过 `getPublishedRecipes`/`getRecipeDetail` 浏览已发布食谱，支持标签筛选、收藏；已废弃 MVP 阶段的 32 条硬编码静态食谱

### 值得做但不阻塞上线（P1，MVP之后再排期）
- 打卡连续天数/成就系统
- 社区/晒餐（涉及内容审核成本，先不碰）

> 注：拍照识别食物热量原列 P1，现已实现（见第 5 节）。

### 明确不做（避免范围蔓延）
- 运动记录（这是减肥app的逻辑，增肥app的运动模块只做"力量训练建议"的静态内容，不做详细记录）
- 好友排行榜、社交裂变（等用户量起来再说）

---

## 2. 页面清单（小程序原生分包结构）

```
pages/
  onboarding/        身高体重目标设置引导（首次进入，3步问卷）
  index/             首页：今日热量/蛋白质进度环 + 快速记录入口
  log-food/          记录一餐（文字输入 → LLM解析 → 确认/编辑 → 保存）
  weight-track/      体重打卡 + 趋势图
  recipe-list/       高热量食谱列表（标签筛选 + 收藏排序）
  recipe-detail/     食谱详情
  my-favorites/      我的收藏（独立收藏页）
  stats/             达标统计（7/30天热量蛋白达标率+体重曲线）
  goal-detail/       目标详情（进度/预计达成/节奏）
  target-edit/       修改目标（重算或手动微调）
  profile/           个人中心：目标调整、提醒设置、数据导出/重置/删除
```

---

## 3. 数据模型（云开发数据库 collection 设计）

```
users
  _openid
  height_cm, current_weight_kg, target_weight_kg
  gender, activity_level  // sedentary/light/moderate/active
  daily_calorie_target, daily_protein_target_g
  created_at

food_logs
  _openid
  date            // YYYY-MM-DD，用于按天聚合查询
  meal_type       // breakfast/lunch/dinner/snack
  raw_text        // 用户原始输入，比如"两个鸡腿加一碗米饭"
  parsed_items    // [{name, portion, calorie, protein_g}]，LLM解析结果
  total_calorie
  total_protein_g
  created_at

weight_logs
  _openid
  date
  weight_kg
  created_at

recipes
  title             // 食谱标题
  status            // 状态机：DRAFT→VALIDATING→PENDING_REVIEW→APPROVED→PUBLISHED→ARCHIVED
  version           // 当前版本号，单调递增（回滚不降）
  nutrition         // { calorie, protein_g, fat_g, carb_g, fiber_g }
  ingredients       // [{ name, amount, unit, food_id, note }]
  steps             // 烹饪步骤字符串数组
  tags              // 标签数组（如"早餐""高蛋白"）
  image_url         // 食谱图片
  source_id         // 来源标识（如 admin-manual）
  source_version    // 来源版本号
  source_url        // 来源链接
  generation_job_id // 生成任务 ID（Phase 2 预留）
  created_at, updated_at, published_at, archived_at
  nutrition_snapshot  // { source_id, source_version, retrieved_at, calculation_method, reviewer, reviewed_at }
  review_record       // { reviewer, review_type, action, note, at }
  base_nutrition_checked // { calorie_in_range, protein_in_reasonable, missing_nutrition, ingredients_valid, duplicate_of_id }
  versions          // [{ version, nutrition, ingredients, steps, tags, timestamp, reason }]

  // 安全规则：仅管理员可写（manageRecipe 内 ADMIN_OPENID 鉴权），
  // 所有用户可读已发布食谱（getPublishedRecipes/getRecipeDetail 仅返回 status=PUBLISHED）
```

**关键设计点（写给DeepSeek的约束条件）**：
- `food_logs.date` 单独存字符串字段，不要只存 `created_at` 时间戳，否则按天聚合要做时区换算，云函数里容易出错
- LLM解析食物这一步必须允许用户在保存前编辑修正（LLM估算热量误差可能到±30%，不能让用户觉得不可控）
- 食谱系统已改为动态审核发布流程：客户端不可直设 `status=PUBLISHED`，仅管理员通过 `manageRecipe` 走 `DRAFT→VALIDATING→APPROVED→PUBLISHED` 状态流转；DeepSeek 不负责决定营养数据，仅辅助生成食谱创意/食材组合/步骤

---

## 4. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | 微信原生小程序（不用 uni-app） | 团队只有你一人开发，原生框架 DeepSeek 训练数据里覆盖最充分，生成代码质量比小众跨端框架稳定 |
| 后端 | 微信云开发（云函数 + 云数据库 + 云存储） | 免鉴权、免服务器运维，个人开发者/小团队起步成本最低，云函数直接调 DeepSeek API 也很顺 |
| LLM能力 | DeepSeek API（云函数里调用） | 你已经在用，token 成本低，文字解析食物这个任务对模型能力要求不高，不需要上贵的模型 |
| 消息提醒 | 微信订阅消息 | 小程序原生能力，不需要额外接第三方推送 |

---

## 5. 食物识别方案（文字 + 拍照双模式，均已实现）

### MVP 阶段：纯文字解析
用户输入"一碗牛肉面"，云函数调 DeepSeek API，prompt 让它返回结构化 JSON（食物名/份量估计/热量/蛋白质），不接任何图像API。理由：
- 省掉图像识别这块的开发和调用成本，先验证产品逻辑是否有人用
- 国内老牌的<cite index="19-1">阿里云菜品识别API已经停止对新用户开放，2026年4月20日后全面下架</cite>，接了也要迁移，不值得现在投入
- <cite index="21-1">百度AI的菜品识别接口还在，能识别超过9千种菜品并返回热量信息</cite>，如果后续要做拍照识别，优先评估这个，或者直接用支持视觉的大模型做图片转文字描述再复用现有文字解析链路，不用单独接菜品识别专用API

### 拍照识菜（已实现）✅
拍照/选图 → 前端离屏 Canvas 等比压缩（Max 800px）转 base64 → 云函数 `parseFoodLog` 双模型接力：

1. **第一棒（视觉识菜）**：智谱 GLM 视觉模型（默认 `glm-4v-flash`）识别图中食物，输出食物名称+粗略分量（纯文本）
2. **第二棒（营养计算）**：DeepSeek（默认 `deepseek-v4-flash`）复用文字解析 prompt，输出热量+蛋白质 JSON

两棒模型名、API Key、Base URL 均已抽为环境变量（`VISION_*` / `NUTRITION_*`），支持多厂商无部署切换。详细设计见《拍照识菜功能设计规格书.md》。

---

## 6. 给 DeepSeek 的分工建议

按你现在 DeepSeek/Gemini/Claude 任务路由的习惯，这个项目里：
- **DeepSeek**：按上面模块清单，逐页面生成代码，包括云函数（每个云函数职责单一：`calcTarget`、`parseFoodLog`、`getDailySummary`、`saveWeightLog`），这类重复性强、规格明确的活最适合它
- **需要人工/Claude把关的点**：LLM解析食物的 prompt 设计（返回格式要稳定成JSON，容易出幻觉，需要反复调）、以及热量目标计算公式的准确性（TDEE公式选错会让整个产品失去可信度）

### 可直接复制给 DeepSeek 的启动 prompt 模板

```
你是一个微信小程序开发助手。我要做一个"增肥记录"小程序，技术栈是微信原生小程序 + 微信云开发（云函数+云数据库）。

先帮我实现「记录一餐」这个云函数 parseFoodLog：
输入：用户的原始文字描述（如"两个鸡腿加一碗米饭"）
输出：JSON格式 { items: [{name, portion, calorie, protein_g}], total_calorie, total_protein_g }
要求：
1. 调用 DeepSeek API（chat/completions），system prompt 强制要求只返回JSON，不要任何解释文字
2. 对返回结果做 JSON.parse 容错处理，解析失败要有降级方案（返回空结果+错误提示，不能让云函数直接500）
3. 数据结构要和这个 collection 对齐：[贴第3节 food_logs 结构]

请给出完整的云函数代码。
```

---

## 7. 路线图

1. **Week 1-2**：onboarding + index + log-food（纯文字）+ weight-track，跑通核心闭环 ✅
2. **Week 3**：recipe-list/detail 动态食谱系统 + 订阅消息提醒 ✅（食谱改为动态审核发布流程，废弃 32 条硬编码静态数据）
3. **拍照识菜**：log-food 双模型接力（GLM 视觉识菜 + DeepSeek 营养计算）✅
4. **Phase 2（规划中）**：DeepSeek 自动生成食谱 + 定时任务触发 + foods 营养数据自动同步 + 个性化推荐
5. **上线后看数据**：如果日活留存过得去，再排打卡激励系统

---

## 8. 合规与免责设计（重要，上线前必须过一遍）

### 8.1 健康风险（产品设计层面）

- 用户里可能混着甲亢、糖尿病、消化道疾病、进食障碍（如暴食后催吐）导致的病理性消瘦，这类用户不该被简单地推"多吃高热量食物"，产品需要有拦截机制而不是无脑执行
- LLM 解析食物热量存在±30%左右的误差，不能让用户把这个数字当医学级精确数据使用
- 需要防止另一个极端：用户为了达标疯狂吃高糖高油食物，产品的激励设计不能只鼓励"总量达标"，要引导"吃够蛋白质"而不是"吃够热量就行"

**落地措施**：
- 用户填写身高体重后，如果计算出的 BMI 明显偏低（如 <16）或用户设置的增重速度过快（如每周目标 >1kg），不走正常方案生成流程，改为提示"建议先咨询医生或营养师"，并附上就医建议文案，不要静默通过
- 每一条 AI 生成的热量/食谱建议下方，固定展示"仅供参考，不构成医疗建议"

### 8.2 小程序类目与备案

- **类目选择**：微信小程序"健康管理"类目对个人主体开放，无需医疗资质；一旦触碰"健康咨询/问诊"这类措辞或功能，会被要求提供《医疗机构执业许可证》和《增值电信业务经营许可备案》，个人开发者基本拿不到，所以产品文案和功能设计上要明确避开"问诊""诊断""处方"这些词
- **小程序备案（强制）**：根据工信部要求，所有境内小程序（含个人主体）自 2024 年起都要求先完成备案才能上线，流程是：微信平台初审 → 工信部短信核验 → 省通信管理局审核，审核周期 1-20 个工作日，这个周期要提前排进上线计划，不要临上线才发现卡在备案

### 8.3 AI 生成内容标识（强制，2025年9月1日已施行）

国家网信办等四部门发布的《人工智能生成合成内容标识办法》要求所有利用 AI 生成的文字/图片等内容必须"亮明身份"。你这个产品用 DeepSeek 解析食物热量、生成建议，这些输出内容都属于监管范围，需要：
- 在展示 AI 解析结果的界面（如 log-food 页面的热量解析结果）固定加上"本内容由AI生成，仅供参考"的显式文字标识
- 不能让用户误以为这是人工营养师给出的专业判断

这一条建议直接写进 DeepSeek 的开发 prompt 里，作为 UI 组件的固定要求，不要漏掉。

### 8.4 个人信息保护（健康数据是敏感个人信息）

- 身高、体重、目标体重这类数据在个人信息保护法框架下大概率被认定为"健康信息"，属于敏感个人信息，处理规则比普通信息严格：
  - 不能和普通用户协议打包默认勾选，需要**单独弹窗、单独同意**
  - 收集目的要明确限定为"计算增重方案"，不能挪作他用（比如后续做广告投放）
  - 存储要加密，且要给用户提供随时导出/删除自己数据的入口
- 如果产品可能被未成年人使用（增肥/长胖诉求在青少年群体里也存在），需要在用户协议里明确年龄要求，涉及不满14周岁未成年人的个人信息按更严格标准处理，建议直接设置"本产品面向18岁以上用户"的声明，避免趟这块的雷

### 8.5 内容安全审核

`food_logs.raw_text` 是用户自由输入的文本，理论上可以输入任何内容。上线前必须接入微信官方的内容安全检测接口（`security.msgSecCheck` 或异步版本），对用户输入做违规内容过滤，这是微信平台的强制要求，不接会有被封号风险。

### 8.6 广告与文案用语

- 不出现"治疗""治愈""科学证实""XX医生推荐"这类用语，除非真的有资质背书，否则涉嫌违反广告法
- 食谱、方案类内容避免暗示"医疗级""临床验证"等措辞

### 8.7 给 DeepSeek 的合规相关 prompt 补充

在第6节的启动 prompt 基础上，补一条通用约束，贴给 DeepSeek：

```
所有涉及AI生成内容展示的页面（食物热量解析结果、增重方案建议），UI上必须固定展示"本内容由AI生成，仅供参考，不构成医疗建议"的文字提示，字号可以小但不能省略，不能通过用户交互（点击关闭等）永久隐藏。
```

---

## 9. 微信云开发排坑清单（从0到能跑，实测踩坑记录）

> 本节记录本项目从建项目到端到端跑通过程中实际遇到的全部问题，按"检查项 + 判断标准 + 修复动作"格式组织，供 opencode/DeepSeek 在新起云开发项目时，或者遇到同类报错时直接对照执行，不需要重新排查一遍。

### 9.1 项目结构类

**检查项：`project.config.json` 是否声明了目录角色**
- 判断标准：文件中必须同时包含以下两个字段，值要和实际目录名一致（注意结尾斜杠）：
  ```json
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/"
  ```
- 报错特征：开发者工具报 `app.json: 在项目根目录未找到 app.json`
- 修复动作：在 `project.config.json` 里补齐这两个字段，改完后重新编译或重新导入项目生效
- 触发场景：opencode/DeepSeek 生成项目骨架时容易只生成文件、漏写这两个路径声明

### 9.2 云开发环境配置类

**检查项：`wx.cloud.init` 的 `env` 字段是否填的是真实环境ID**
- 判断标准：`env` 的值必须是云开发控制台里"环境ID"这一栏的值，格式类似 `cloud1-xxxxxxxxxxxxx`，**不是小程序的 AppID**（AppID格式类似 `wxbe9206327298533d`，两者完全不同，但都是字符串容易被写错/混淆）
- 报错特征：`errCode: -601034 | errMsg: 没有权限，请先开通云开发或者云托管`
- 修复动作：云开发控制台首页复制真实环境ID，写入 `miniprogram/app.js` 里 `wx.cloud.init({ env: '真实环境ID' })`
- 触发场景：AI生成代码时容易把AppID误当作env值填入，或者留一个占位符没有替换成真实值

**检查项：数据库集合是否已手动创建**
- 判断标准：技术方案里设计的每个 collection（如 `users`、`food_logs` 等）都要在云开发控制台"数据库"页面里手动新建，微信云开发不会根据代码里的 `db.collection('xxx')` 自动建表
- 报错特征：`errCode: -502005 | database collection not exists | Db or Table not exist: xxx`
- 修复动作：云开发控制台 → 数据库 → 新建集合，权限类型按数据隐私程度选择（个人隐私数据选"仅创建者可读写"，公共只读数据如食谱库选"所有用户可读"）
- 触发场景：写完云函数代码但忘记同步在控制台建表

### 9.3 云函数跨目录共享代码类

**检查项：多个云函数共用的公共代码（如日志工具）是否被正确打包**
- 判断标准：微信云函数是**按目录独立打包部署**的架构，每个云函数目录只会把自己目录内的文件打进上传包。如果多个云函数需要引用同一份公共代码（如 `cloudfunctions/common/logger.js`），必须把这份代码**物理复制进每一个需要用到它的函数目录内部**，不能用 `require('../common/xxx')` 这种跨目录相对路径引用
- 报错特征：`Cannot find module '../common/logger'`（云函数运行时找不到模块，本地能跑云端报错）
- 修复动作：
  1. 写一个同步脚本（如 `cloudfunctions/sync-common.js`），把 `common` 目录内容复制进每个需要用到它的函数目录下的 `common` 子目录
  2. 代码里的 `require` 路径改成 `./common/xxx`（子目录写法），不是 `../common/xxx`（同级目录写法）
  3. 每次修改 common 代码后重新跑一遍同步脚本，并对所有引用它的函数重新执行"创建并部署：云端安装依赖"
- 触发场景：项目里存在多个云函数共享工具代码时，几乎必然遇到，属于微信云开发架构的固有特性，不是bug

### 9.4 WXML 模板语法类

**检查项：WXML 的 `{{ }}` 表达式里是否直接调用了 JS 方法**
- 判断标准：微信小程序 WXML 模板表达式只支持基础算术、逻辑判断、三元表达式，**不支持调用 JS 方法**（如 `.trim()`、`.length`、`.toFixed()`、`.includes()` 等）。任何需要方法调用的判断逻辑，必须在对应页面的 `.js` 文件里预先计算好，存成一个简单的 data 字段，再在 WXML 里绑定这个字段
- 报错特征：没有报错弹窗，但表现为按钮永远处于disabled状态、条件渲染永远不生效等"看起来卡死"的现象，且开发者工具Console没有任何相关日志
- 修复动作：
  - 错误写法：`disabled="{{!rawText.trim() || parsing}}"`
  - 正确写法：在 `.js` 的 `data` 里加一个计算好的布尔字段（如 `canParse`），在对应的 `bindinput`/`onInput` 方法里同步更新这个字段，WXML 里改成 `disabled="{{!canParse || parsing}}"`
- 触发场景：AI生成小程序代码时容易照搬 Vue/React 里"模板可以调用方法"的写法习惯，但WXML不支持
- **新起项目建议**：让 DeepSeek 生成代码后，主动要求扫描一遍所有 `.wxml` 文件里的 `{{ }}` 表达式，检查有无 JS 方法调用，提前排查而不是等运行时才发现

### 9.5 微信开放接口权限类

**检查项：云函数调用微信开放API（如内容安全检测）是否有权限**
- 判断标准：`cloud.openapi.security.msgSecCheck` 这类涉及内容风控/安全的开放接口，需要小程序账号具备相应调用权限，不是有云开发环境就能直接调用
- 报错特征：`errCode: -604101 | function has no permission to call this API`
- 排查方向：
  1. 确认小程序账号完成了必要的认证流程
  2. 该错误也有可能是开发者工具模拟器环境本身对该类API支持不完整导致的假报错，遇到时优先用**真机预览**排除工具环境因素，而不是直接怀疑权限配置
  3. 若真机同样报错，再进一步检查云函数目录下 `config.json` 是否正确声明了对应的云调用权限

### 9.6 敏感配置管理类

**检查项：第三方API Key（如DeepSeek API Key）是否硬编码在代码里**
- 判断标准：API Key 等敏感配置**不应该写死在 `index.js` 源码里**，应通过云开发控制台的"环境变量"功能配置，代码里用 `process.env.变量名` 读取
- 报错特征：`"error": "DeepSeek API key not configured"`
- 修复动作：云开发控制台 → 云函数 → 具体函数 → 配置 → 高级配置 → 环境变量，新增 `Key: DEEPSEEK_API_KEY, Value: 真实key`，保存后无需重新部署代码即可生效
- 顺手检查项：同一个配置面板里的"执行超时"默认值（常见默认3秒）对于需要调用外部AI接口的函数明显不够，建议同步调整到 15~30 秒，避免Key配置对了又卡在超时

### 9.7 Node.js 运行时兼容性类

**检查项：云函数代码是否使用了当前运行时版本不支持的新API**
- 判断标准：微信云函数的 Node.js 运行时版本以云函数详情页"运行环境"栏显示的为准（本项目为 Node.js 16.13），全局 `fetch()` 是 Node.js 18+ 才原生支持的API，Node 16 环境下直接使用会报错
- 报错特征：`"error": "fetch is not defined"`
- 修复动作：涉及网络请求（尤其是调用第三方AI API）的云函数一律改用 `axios` 库而非 `fetch`，`package.json` 的 `dependencies` 里加上 `axios`，改动后需要重新执行"创建并部署：云端安装依赖"（因为新增了依赖，必须走云端装依赖的部署方式，不能只传代码）
- **新起项目建议**：在给 DeepSeek 的启动 prompt 里明确约束"云函数中的网络请求一律使用 axios，不使用 fetch"，从源头规避

### 9.8 通用排查心法

1. **本地测试通过 ≠ 云端能跑**：opencode/jest 本地跑的是mock环境，跟真实微信云开发环境是两套体系，本地全绿不代表部署到云端就没问题，每次改动后都要在真机或云开发控制台测试一次
2. **代码改了要重新部署，环境变量改了不用**：`cloudfunctions` 目录下任何 `.js`/`package.json` 改动，必须右键"创建并部署：云端安装依赖"才会生效；而云开发控制台里改的环境变量、超时时间等配置项，保存后新的调用会自动生效，不需要重新部署代码
3. **报错优先看云函数执行日志，不是前端Toast提示**：前端弹出的提示文字（如"内容安全检测服务暂不可用"）往往是笼统的兜底文案，云开发控制台"云函数 → 日志"里的详细堆栈和错误码才是定位问题的关键信息源
4. **遇到"云端权限类"报错，先用真机排除工具环境因素**：部分微信开放API在开发者工具模拟器里可能有支持不完整的情况，真机预览是更可靠的验证环境
