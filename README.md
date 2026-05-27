# my-verilog-formatter

面向 FPGA 开发者的 VS Code Verilog / SystemVerilog 全功能辅助插件，提供代码格式化、文件树、一键例化、语法高亮、跳转悬停、语法检查、代码补全、Snippet 等功能。

> 版本：v0.2.0　日期：2026/05/25

---

## 功能列表

### 🎨 代码格式化

快捷键 `Ctrl+Alt+F` 或 `Shift+Alt+F`（格式化文档）。

| 规则 | 说明 |
|------|------|
| `begin` 另起一行 | `always/if/else/for ... begin` 自动拆为两行 |
| 缩进重算 | 基于 `begin/end` 嵌套栈，统一缩进为 2 个空格 |
| 信号声明对齐 | `reg/wire/logic` 按 类型/位宽/名称/分号 四列对齐 |
| 端口声明对齐 | `input/output/inout` 按 方向/类型/位宽/名称/逗号 五列对齐 |
| localparam 对齐 | 多行 `localparam` 按名称/值/注释三列对齐 |
| 行尾注释对齐 | 连续代码块的 `//` 注释对齐到同一列 |
| 属性前缀支持 | `(* mark_debug = "true" *)` 声明单独分组对齐 |
| 行尾空格清除 | 格式化后自动去除每行末尾多余空格 |

启用保存时自动格式化（`settings.json`）：

```jsonc
{
  "verilogFormatter.formatOnSave": true
}
```

---

### 💡 代码补全（IntelliSense）

输入时自动弹出补全列表，或按 `Ctrl+Space` 手动触发，支持三层补全：

| 层级 | 内容 | 说明 |
|------|------|------|
| 关键字 | `always`、`assign`、`module` 等 | 内置 50+ Verilog/SV 关键字 |
| 当前文件符号 | 信号、端口、参数 | 来自当前文件，排序靠前 |
| 工作区模块名 | 跨文件模块 | 显示来源文件名 |

每个补全项携带类型图标和声明原文，鼠标悬停可预览完整声明。

---

### ✂️ Snippet 代码片段

输入前缀后按 `Tab` 展开，支持 `Tab` 键在各占位符间跳转：

| 前缀 | 展开内容 |
|------|---------|
| `module` | 完整 module 模板（含文件头注释） |
| `always_ff` | 带复位的时序逻辑 always 块 |
| `always_comb` | 组合逻辑 always 块 |
| `alwaysclk` | 时钟上升沿 always 块 |
| `initial` | initial 仿真块 |
| `case` | case 语句（含 default） |
| `ifelse` | if-else 语句 |
| `for` | for 循环 |
| `assign` | assign 连续赋值 |
| `parameter` | parameter 声明 |
| `localparam` | localparam 声明 |
| `reg` | reg 信号声明（对齐格式） |
| `wire` | wire 信号声明（对齐格式） |
| `timescale` | \`timescale 指令 |
| `fileheader` | Verilog 文件头注释模板 |
| `fsm` | 两段式状态机完整模板 |

---

### 🌲 文件树

在侧边栏 **Verilog Files** 面板中以树状结构展示工作区内所有 Verilog/SystemVerilog 文件，并解析模块例化层次关系，方便快速定位和导航。

---

### ⚡ 一键例化

快捷键 `Ctrl+Alt+I`，自动生成当前模块的例化代码并复制到剪贴板，格式如下：

```verilog
module_name u_module_name (
    .port_a  ( port_a  ),  // i
    .port_b  ( port_b  ),  // o
    .port_c  ( port_c  )   // o
);
```

端口名、信号名、注释列自动对齐。同时支持生成 Testbench 框架（命令：`Generate Testbench`）。

---

### 🎨 语法高亮

支持以下文件类型的语法高亮：

| 扩展名 | 语言 |
|--------|------|
| `.v` / `.vh` | Verilog |
| `.sv` / `.svh` | SystemVerilog |
| `.vhd` / `.vhdl` | VHDL |
| `.ucf` | Xilinx UCF 约束 |
| `.xdc` | Xilinx XDC 约束 |
| `.tcl` | Tcl 脚本 |
| `.do` | ModelSim DO 脚本 |
| `.cst` | 高云 CST 约束 |

---

### 🔍 语法跳转 & 定义悬停

- **跳转到定义**：`F4` 或 `F12`，快速跳转到模块、端口、寄存器、wire 的定义位置
- **查看定义**：`Alt+F4`，Peek 弹窗查看定义，无需离开当前文件
- **悬停提示**：鼠标悬停在变量或模块名上，即可查看其声明信息

支持以下声明形式：
- 多名称声明：`reg a, b, c;`
- 带初值声明：`reg [3:0] cnt = 4'd0;`
- 属性前缀：`(* mark_debug = "true" *) reg flag;`

---

### ✅ 语法检查

集成 `xvlog`（Vivado 自带工具）进行 Verilog/SystemVerilog 语法检查，错误和警告直接显示在编辑器问题面板。

启用方式（`settings.json`）：

```jsonc
{
  "verilogFormatter.lintEnabled": true
}
```

---

### 🔄 UCF 转 XDC

命令面板搜索 `Convert UCF to XDC`，自动将 Xilinx UCF 约束文件转换为 XDC 格式。

---

### 🔢 数字递增 / 递减

- `Ctrl+Alt+↑`：递增选中数字
- `Ctrl+Alt+↓`：递减选中数字

---

## 配置项

```jsonc
{
  // 缩进空格数，默认 2
  "verilogFormatter.indentSize": 2,

  // 是否对齐行尾注释，默认 true
  "verilogFormatter.alignPortComment": true,

  // begin 是否另起一行，默认 true
  "verilogFormatter.newlineBeforeBegin": true,

  // 保存时自动格式化，默认 false
  "verilogFormatter.formatOnSave": false,

  // 是否启用 xvlog 语法检查，默认 false
  "verilogFormatter.lintEnabled": false,

  // 是否启用悬停查看定义，默认 true
  "verilogFormatter.hoverEnabled": true
}
```

---

## 快捷键汇总

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Alt+F` | 格式化当前文件 |
| `Ctrl+Alt+I` | 一键例化当前模块 |
| `Ctrl+Space` | 触发代码补全 |
| `F4` | 跳转到定义 |
| `Alt+F4` | Peek 查看定义 |
| `Ctrl+/` | 行注释切换 |
| `Ctrl+Alt+↑` | 递增选中数字 |
| `Ctrl+Alt+↓` | 递减选中数字 |

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

按 `F5` 启动扩展开发实例，打开任意 `.v` / `.sv` 文件测试各功能。

### 打包安装

```bash
npx vsce package --no-dependencies
code --install-extension my-verilog-formatter-0.2.0.vsix --force
```

---

## 代码结构

```
my-verilog-formatter/
├── src/
│   ├── extension.ts          # 入口，注册所有 Provider 和命令
│   ├── formatter.ts          # 格式化核心逻辑
│   ├── completionProvider.ts # 代码补全（关键字/符号/模块）
│   ├── instantiator.ts       # 一键例化 / Testbench 生成
│   ├── fileTree.ts           # 文件树 TreeDataProvider
│   ├── symbolProvider.ts     # 符号索引、跳转、悬停
│   ├── linter.ts             # xvlog 语法检查
│   ├── ucfToXdc.ts           # UCF → XDC 转换
│   └── numberEdit.ts         # 数字递增/递减
├── snippets/
│   └── verilog.code-snippets # Verilog/SV 代码片段
├── syntaxes/                 # 语法高亮 tmLanguage 文件
├── language-configuration-verilog.json  # Verilog/SV 注释配置
├── language-configuration-vhdl.json     # VHDL 注释配置
├── language-configuration.json          # XDC/TCL/UCF 注释配置
├── icon.png                  # 插件图标
├── package.json              # 扩展元数据与配置项声明
└── tsconfig.json             # TypeScript 编译配置
```

---

## 修改记录

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| v0.2.0 | 2026/05/27 | 新增代码补全、Snippet、保存时自动格式化；修复全部语言注释快捷键 |
| v0.2.0 | 2026/05/25 | 新增文件树、例化、语法高亮、跳转、悬停、语法检查、UCF转XDC、数字递增等功能；添加插件图标 |
| v0.1.0 | 2026/05/25 | 创建项目，实现代码格式化核心功能 |
