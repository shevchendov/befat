# AGENTS.md — AI Conventions for befat

## Git Hooks

每次 `git commit` 后，`.githooks/post-commit` 会自动将提交信息追加到 `CHANGELOG.md`。

首次克隆仓库后需执行：

```bash
git config core.hooksPath .githooks
```

## 敏感信息保护

`post-commit` hook 会自动检测并遮蔽提交信息中的敏感内容（API key、密码、token、密钥、连接串等），遮蔽后的内容才会写入 CHANGELOG.md。

开发者仍需注意：
- 不要在提交信息中写入任何敏感值
- 如果看到 `WARNING: post-commit hook masked sensitive info` 警告，说明提交信息含敏感内容，应修正后重新提交

## Commit 规范

提交信息必须严格按照以下模板（正文中模板行均为必填，缺一不可）：

### 模板

```
<type>: <简述>

- 改了什么（改用现有格式，逐条列出）

DEPLOY: <cloudfunctions/xxx，多个用逗号分隔 | none>
VERIFIED: <真机测试通过（注明测试场景） | 仅本地jest测试通过，未做真机/云端验证 | 未测试>
DATA IMPACT: <涉及数据库字段格式/类型/结构变化时说明影响及迁移方案；无变化则省略此行>
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `<type>` | 是 | `feat` / `fix` / `refactor` / `docs` / `test` / `chore` |
| 标题 | 是 | 概括改动，50字以内 |
| 正文-改动 | 是 | 逐条列出变更点，说明改了什么、为什么改 |
| `DEPLOY:` | **是** | `none` 表示纯前端/纯文档改动；否则列出需重新上传的云函数路径，多个用逗号分隔 |
| `VERIFIED:` | **是** | 如实填写验证方式，禁止仅写"已验证" |
| `DATA IMPACT:` | 按需 | 仅数据结构变化时必填 |

### 示例

```
fix: 统一数字输入验证和垂直居中样式

- 所有数字输入框改用公共样式类 .input-number
- 实时校验只做字符过滤，边界值回退到提交按钮做兜底
- 修复实时钳制 bug（输入 170 变 250）

DEPLOY: none
VERIFIED: 仅本地jest测试通过，未做真机/云端验证
```

```
feat: 更新食谱营养数据并新增批量更新机制

- 按中国 CDC 权威数据重新计算 32 条食谱营养值
- generateRecipeInit 新增 force 模式可批量更新已有文档

DEPLOY: cloudfunctions/generateRecipeInit
VERIFIED: 真机测试通过，验证了食谱列表页、详情页营养值显示正常
```

### 提交前确认

1. 所有测试通过：`npx jest`
2. `DEPLOY:` 必填，即使是纯前端改动也要写 `DEPLOY: none`
3. `VERIFIED:` 如实填写，禁止写笼统的"已验证"
4. 修改记录会自动写入 CHANGELOG.md，post-commit hook 会解析 DEPLOY 字段并在非 none 时追加 ⚠️ 待确认标记

## 前端样式规范

每次修改前端（WXML/WXSS/涉及 UI 的 JS）时，必须：

1. **风格一致性**：新样式必须与现有页面风格一致，优先沿用项目 design tokens（`var(--primary)`、`var(--primary-bg)`、`var(--card-bg)`、`var(--radius-sm/md/lg)`、`var(--shadow-card)`、`--color-border` 粗描边等），不擅自引入新的配色/圆角/阴影体系。
2. **字体大小**：可读性元素字号不能太小，遵循现有页面的字号层级——正文/列表文字 ≥ 26rpx、标签 ≥ 24rpx、重要标题 ≥ 32rpx，避免大量 22rpx 以下的小字堆积。
3. **点击热区**：可点击元素留足热区（建议 ≥ 60rpx），避免图标过小难以点击。
