# hanxuyao-plugin

面向 FPGA 与嵌入式开发者的 VS Code Verilog / SystemVerilog / C / C++ 辅助插件，主要功能包括：

1. 代码格式化：支持 Verilog、SystemVerilog、C 和 C++ 代码整理。
2. 工程浏览：提供 Verilog 文件树与模块层级查看。
3. 代码生成：支持模块一键例化、Testbench 生成和 Snippet 代码片段。
4. 代码阅读：提供语法高亮、符号跳转、悬停定义和代码补全。
5. 代码检查：支持 Verilog 语法检查以及 TODO 标签扫描与管理。

> 版本：v1.3.3　日期：2026/08/21

---

## 功能列表

### C / C++

支持 `.c`、`.cpp`、`.h` 文件，使用 `Ctrl+Alt+F` 或 `Shift+Alt+F` 格式化：

- 对齐连续的变量定义。
- 按类型、变量名、分号和注释多列对齐结构体成员。
- 将结构体、联合体和枚举的 `{` 放到类型声明行末尾。
- 按枚举项名称、赋值表达式、逗号和注释多列对齐枚举定义。
- 将多行函数调用整理为单行。
- 将函数定义的 `{` 放在函数签名最后一行末尾。

### Verilog

#### 🎨 代码格式化

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

#### 💡 代码补全（IntelliSense）

输入时自动弹出补全列表，或按 `Ctrl+Space` 手动触发，支持三层补全：

| 层级 | 内容 | 说明 |
|------|------|------|
| 关键字 | `always`、`assign`、`module` 等 | 内置 50+ Verilog/SV 关键字 |
| 当前文件符号 | 信号、端口、参数 | 来自当前文件，排序靠前 |
| 工作区模块名 | 跨文件模块 | 显示来源文件名 |

每个补全项携带类型图标和声明原文，鼠标悬停可预览完整声明。

---

#### ✂️ Snippet 代码片段

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

#### 🌲 文件树

在侧边栏 **Verilog Files** 面板中以树状结构展示工作区内所有 Verilog/SystemVerilog 文件，并解析模块例化层次关系，方便快速定位和导航。

---

#### ⚡ 一键例化

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

#### 🎨 语法高亮

支持以下文件类型的语法高亮：

| 扩展名 | 语言 |
|--------|------|
| `.v` / `.vh` | Verilog |
| `.sv` / `.svh` | SystemVerilog |
| `.vhd` / `.vhdl` | VHDL |
| `.ucf` | Xilinx UCF 约束 |
| `.xdc` | Xilinx XDC 约束 |
| `.adc` | Anlogic ADC 引脚约束 |
| `.sdc` | SDC 时序约束 |
| `.tcl` | Tcl 脚本 |
| `.do` | ModelSim DO 脚本 |
| `.cst` | 高云 CST 约束 |

Anlogic ADC 文件支持整文档或选区格式化，可自动对齐信号名及 `LOCATION`、`IOSTANDARD`、`DRIVESTRENGTH` 等属性列。

---

#### 🔍 语法跳转 & 定义悬停

- **跳转到定义**：`F4` 或 `F12`，快速跳转到模块、端口、寄存器、wire 的定义位置
- **查看定义**：`Alt+F4`，Peek 弹窗查看定义，无需离开当前文件
- **悬停提示**：鼠标悬停在变量或模块名上，即可查看其声明信息

支持以下声明形式：
- 多名称声明：`reg a, b, c;`
- 带初值声明：`reg [3:0] cnt = 4'd0;`
- 属性前缀：`(* mark_debug = "true" *) reg flag;`

---

#### ✅ 语法检查

集成 `xvlog`（Vivado 自带工具）进行 Verilog/SystemVerilog 语法检查，错误和警告直接显示在编辑器问题面板。

启用方式（`settings.json`）：

```jsonc
{
  "verilogFormatter.lintEnabled": true
}
```

---

#### 🔄 UCF 转 XDC

命令面板搜索 `Convert UCF to XDC`，自动将 Xilinx UCF 约束文件转换为 XDC 格式。

---

#### 🔢 数字递增 / 递减

- `Ctrl+Alt+↑`：递增选中数字
- `Ctrl+Alt+↓`：递减选中数字

---

### TODO

#### 📋 TODO 树视图

侧边栏 **TODO** 面板扫描整个工作区（使用 ripgrep），在树视图中展示所有 TODO/FIXME 等注释标签，点击条目直接跳转到对应文件行。

支持三种视图模式（工具栏切换）：

| 模式 | 说明 |
|------|------|
| 树视图（默认） | 按文件夹层级展示，可折叠 |
| 平铺列表 | 所有条目扁平展示 |
| 按标签分组 | 一级为 TODO/FIXME/...，二级为具体条目 |

工具栏按钮：折叠全部、树/平铺/标签分组切换、过滤清除、手动刷新。

右键菜单：隐藏此文件/文件夹、重置路径过滤。

---

#### 🎨 行内高亮

打开文件时自动高亮 TODO 标签，各标签颜色可在配置中自定义。

---

#### 🔍 前后导航

命令面板搜索 `TODO: 跳到下一个` / `TODO: 跳到上一个`，在当前文件内的 TODO 条目间快速跳转。

---

#### 🏷️ 标签管理

命令面板搜索 `TODO: 添加标签` / `TODO: 删除标签`，动态管理扫描的标签关键字，无需手动编辑 `settings.json`。

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

### TODO 配置

```jsonc
// TODO 相关配置
{
  // 扫描的标签关键字，默认 ["TODO","FIXME","NOTE","HACK"]
  "verilogFormatter.todo.tags": ["TODO", "FIXME", "NOTE", "HACK"],

  // 排除的 glob 模式
  "verilogFormatter.todo.excludePatterns": ["**/node_modules/**", "**/.git/**", "**/out/**"],

  // 状态栏显示 TODO 计数
  "verilogFormatter.todo.showInStatusBar": true,

  // 是否启用行内高亮
  "verilogFormatter.todo.highlightEnabled": true,

  // 所有标签的默认高亮
  "verilogFormatter.todo.defaultHighlight": {},

  // 各标签的个性化高亮
  "verilogFormatter.todo.customHighlight": {}
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
code --install-extension hanxuyao-plugin-1.0.0.vsix --force
```

---

## 代码结构

```
hanxuyao-plugin/
├── src/
│   ├── extension.ts               # 入口，注册所有 Provider 和命令
│   └── features/
│       └── verilog/
│           ├── formatter.ts       # 格式化核心逻辑
│           ├── completionProvider.ts # 代码补全（关键字/符号/模块）
│           ├── instantiator.ts    # 一键例化 / Testbench 生成
│           ├── fileTree.ts        # 文件树 TreeDataProvider
│           ├── symbolProvider.ts  # 符号索引、跳转、悬停
│           ├── linter.ts          # xvlog 语法检查
│           ├── ucfToXdc.ts        # UCF → XDC 转换
│           └── numberEdit.ts      # 数字递增/递减
├── resources/
│   └── verilog/
│       ├── snippets/
│       │   └── verilog.code-snippets  # Verilog/SV 代码片段
│       ├── syntaxes/                  # 语法高亮 tmLanguage 文件
│       └── language-configurations/
│           ├── language-configuration-verilog.json  # Verilog/SV 注释配置
│           ├── language-configuration-vhdl.json     # VHDL 注释配置
│           └── language-configuration.json          # XDC/TCL/UCF 注释配置
├── icon.png                       # 插件图标
├── package.json                   # 扩展元数据与配置项声明
└── tsconfig.json                  # TypeScript 编译配置
```

---

## 修改记录

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| v1.3.3 | 2026/08/21 | 修复 `static bool` 等单行函数签名的左花括号换行问题 |
| v1.3.2 | 2026/08/21 | 将枚举左花括号放到类型声明末尾 |
| v1.3.1 | 2026/08/21 | 将结构体和联合体左花括号放到类型声明末尾 |
| v1.3.0 | 2026/08/21 | 新增枚举项名称、赋值表达式、逗号和注释多列对齐 |
| v1.2.2 | 2026/08/21 | 在类型定义结束与后续注释或类型声明之间增加一个空行 |
| v1.2.1 | 2026/08/21 | 修复 `Ctrl+Alt+F` 被其他 C/C++ 默认格式化器截获的问题 |
| v1.2.0 | 2026/08/21 | 新增结构体成员的类型、变量名、分号和注释多列对齐 |
| v1.1.1 | 2026/08/21 | 将插件功能介绍调整为有序列表 |
| v1.1.0 | 2026/08/21 | 插件更名为 hanxuyao-plugin；新增 C/C++ 变量定义对齐、函数调用单行化和函数左花括号同行格式化 |
| v0.2.0 | 2026/05/27 | 新增代码补全、Snippet、保存时自动格式化；修复全部语言注释快捷键 |
| v0.2.0 | 2026/05/25 | 新增文件树、例化、语法高亮、跳转、悬停、语法检查、UCF转XDC、数字递增等功能；添加插件图标 |
| v0.1.0 | 2026/05/25 | 创建项目，实现代码格式化核心功能 |
