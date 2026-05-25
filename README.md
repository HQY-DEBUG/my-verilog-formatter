# my-verilog-formatter

个人使用的 VS Code Verilog / SystemVerilog 代码格式化插件。

> 版本：v0.2.0　日期：2026/05/25

---

## 功能

| 规则 | 说明 |
|------|------|
| `begin` 另起一行 | `always/if/else/for ... begin` 自动拆为两行 |
| 缩进重算 | 基于 `begin/end` 嵌套栈，统一缩进为 2 个空格 |
| 信号声明对齐 | `reg/wire/logic` 按 类型/位宽/名称/分号 四列对齐 |
| 端口声明对齐 | `input/output/inout` 按 方向/类型/位宽/名称/逗号 五列对齐 |
| 行尾注释对齐 | 连续代码块的 `//` 注释对齐到同一列 |
| 行尾空格清除 | 格式化后自动去除每行末尾多余空格 |

---

## 支持文件类型

- `.v` / `.vh`（Verilog）
- `.sv` / `.svh`（SystemVerilog）

---

## 配置项

在 VS Code `settings.json` 中可调整以下选项：

```jsonc
{
  // 缩进空格数，默认 2
  "verilogFormatter.indentSize": 2,

  // 是否对齐行尾注释，默认 true
  "verilogFormatter.alignPortComment": true,

  // begin 是否另起一行，默认 true
  "verilogFormatter.newlineBeforeBegin": true
}
```

---

## 开发

### 环境要求

- Node.js ≥ 18
- VS Code ≥ 1.80

### 安装依赖 & 编译

```bash
npm install
npm run compile
```

### 调试

在 VS Code 中按 `F5` 启动扩展开发实例，打开任意 `.v` / `.sv` 文件后执行
`Format Document`（`Shift+Alt+F`）即可触发格式化。

### 打包发布

```bash
npm install -g vsce
vsce package   # 生成 .vsix
vsce publish   # 发布到 VS Code Marketplace
```

---

## 代码结构

```
my-verilog-formatter/
├── src/
│   ├── extension.ts   # 入口，注册 DocumentFormattingEditProvider
│   └── formatter.ts   # 格式化核心逻辑
├── package.json       # 扩展元数据与配置项声明
└── tsconfig.json      # TypeScript 编译配置
```

---

## 修改记录

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| v0.2.0 | 2026/05/25 | 根据代码风格规范实现格式化规则 |
| v0.1.0 | 2026/05/25 | 创建项目，搭建基础框架 |
