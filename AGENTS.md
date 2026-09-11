# 仓库规则

本文件适用于整个仓库，补充全局工作规则。

## 版本管理

修改仓库文件前，必须阅读并遵守 [.codex/rules/versioning.md](.codex/rules/versioning.md)。每次完成更新都必须同步版本号和修改记录。

## 验证

- 修改功能代码时，运行 `npm test -- --runInBand` 和 `npm run compile`。
- 仅修改文档、仓库规则或版本元数据时，检查版本一致性和 `git diff --check`。
- 修改打包排除规则时，使用 `vsce ls` 检查实际打包清单。
- `.codex/` 和 `AGENTS.md` 仅用于仓库开发，不得包含在 VSIX 安装包中。
