# BeFat — 增肥记录小程序

一个微信小程序，帮助偏瘦人群记录饮食和体重，通过 AI 估算食物营养，追踪增重进度。

## 功能

- **AI 食物识别** — 输入文字描述（如"一碗米饭加一个鸡腿"），DeepSeek API 自动解析食物名称、份量、热量和蛋白质
- **饮食记录** — 按餐次（早餐/午餐/晚餐/加餐）记录每日摄入
- **体重追踪** — 记录每日体重，生成趋势图
- **增肥食谱** — 浏览 AI 生成的增肥食谱，按标签筛选，收藏喜爱的食谱
- **食谱收藏** — 收藏/取消收藏食谱，列表按收藏优先排序，专属收藏页面
- **目标设定** — 引导式 onboarding，根据身高/体重/活动水平计算每日热量和蛋白质目标
- **健康提示** — BMI 计算 + 健康警告

## 技术栈

| 层 | 技术 |
|--|------|
| 前端 | 微信小程序原生 (WXML + WXSS + JS) |
| 后端 | 微信云开发 (Node.js 16) |
| AI | DeepSeek API（食物营养解析） |
| 测试 | Jest |

## 项目结构

```
befat/
├── cloudfunctions/          # 云函数（13 个）
│   ├── calcTarget/          # 计算每日目标（TDEE/BMI）
│   ├── checkMealReminder/   # 吃饭提醒检查
│   ├── deleteUserData/      # 删除用户数据
│   ├── exportUserData/      # 导出用户数据
│   ├── generateRecipeInit/  # 初始食谱生成
│   ├── getDailySummary/     # 获取每日汇总
│   ├── getFavorites/        # 获取用户收藏食谱
│   ├── manageRecipe/        # 管理员增删改查食谱
│   ├── parseFoodLog/        # AI 解析食物文字
│   ├── reportError/         # 错误上报
│   ├── saveWeightLog/       # 保存体重记录
│   ├── toggleFavorite/      # 收藏/取消收藏
│   └── common/logger.js     # 共享结构化日志工具
├── miniprogram/
│   ├── pages/
│   │   ├── onboarding/      # 首次引导设置
│   │   ├── index/           # 首页（每日概览）
│   │   ├── log-food/        # 记录饮食
│   │   ├── weight-track/    # 体重打卡
│   │   ├── recipe-list/     # 食谱列表（收藏优先排序）
│   │   ├── recipe-detail/   # 食谱详情
│   │   ├── my-favorites/    # 我的收藏
│   │   └── profile/         # 个人设置
│   └── utils/
│       ├── logger.js        # 前端日志工具
│       └── util.js          # 工具函数
├── tests/                   # Jest 测试（360+ 个）
├── __mocks__/               # Jest 手动 mock
└── package.json
```

## 配置与部署

### 1. 环境变量

在腾讯云云开发控制台 → 云函数 → 对应函数 → 环境变量中添加：

| 云函数 | Key | Value |
|--------|-----|-------|
| `parseFoodLog` | `DEEPSEEK_API_KEY` | 你的 DeepSeek API Key |
| `manageRecipe` | `ADMIN_OPENID` | 你的微信 OPENID（管理员权限） |

### 2. 云函数依赖

每个云函数目录下安装依赖（上传时自动打包）：

```bash
cd cloudfunctions/parseFoodLog
npm install
```

### 3. 数据库集合

在云开发控制台 → 数据库新建以下集合：

| 集合名 | 权限 |
|--------|------|
| `recipes` | 所有用户可读，仅创建者可读写 |
| `user_favorites` | 仅创建者可读写 |

### 4. 同步公共模块

```bash
npm run sync-common
```

将 `cloudfunctions/common/logger.js` 同步到各云函数目录。

### 5. 替换 AppID

`project.config.json` 中的 `appid` 需替换为你自己的微信小程序 AppID。

### 6. 本地测试

```bash
npm test
```

## 注意事项

- 微信云函数运行在 Node.js 16，不支持 `fetch`；HTTP 请求使用 `axios`
- WXML 模板不支持 JS 方法调用（如 `.trim()`），需在 JS 中预处理为 data 字段
- 本项目使用微信云开发的数据库和云函数，无需自建服务器
