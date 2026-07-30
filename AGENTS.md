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

提交信息格式：

```
<type>: <简短标题>

<详细改动描述，说明改了什么、为什么改>
- 具体变更点 1
- 具体变更点 2

注意：需重新上传云函数 xxx
```

- `<type>`: `feat` | `fix` | `refactor` | `docs` | `test` | `chore`
- **标题**：概括改动（50 字以内）
- **正文**：必须写明具体修改内容和原因，逐条列出变更点，方便 CHANGELOG 记录
- 正文中的「注意」行会展示在 CHANGELOG 的注意事项区

示例：

```
fix: 统一数字输入验证和垂直居中样式

- 所有数字输入框改用公共样式类 .input-number
- 实时校验只做字符过滤，边界值回退到提交按钮做兜底
- 修复实时钳制 bug（输入 170 变 250）
```

提交前确认：
1. 所有测试通过：`npx jest`
2. 修改涉及云函数时在正文写明「注意：需重新上传云函数」
3. 修改记录会自动写入 CHANGELOG.md
