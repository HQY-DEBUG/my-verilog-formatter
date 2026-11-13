# hanxuyao-plugin

面向 FPGA 与嵌入式开发的 VS Code 工具集，支持 Verilog / SystemVerilog、C / C++、MATLAB 和 Tcl。

> 版本：v2.7.1　日期：2026/11/13

[快速开始](#快速开始) · [功能总览](#功能总览) · [详细功能](#详细功能) · [配置与开发](#配置与开发)

## 快速开始

1. 代码格式化：打开支持的文件，按 `Ctrl+Alt+F`；也可使用 VS Code 的格式化文档命令。
2. 工程浏览：在资源管理器的 **Verilog 文件树** 查看模块层级；在文件列表或编辑器中右键查看 Git 历史。
3. 代码生成：在 Verilog 模块中按 `Ctrl+Alt+I` 生成例化，或从命令面板生成 Testbench。

## 功能总览

| 开发场景 | 主要功能 |
| --- | --- |
| Verilog / SystemVerilog | 格式化、补全、语法高亮、定义跳转、文件树和一键例化 |
| C / C++ | 内置语义服务、类型与函数跳转、成员补全和格式化 |
| MATLAB | 智能编辑、运行调试、工作区、工程与测试工具 |
| Tcl 与约束文件 | Tcl 导航和折叠；ADC 格式化，以及 UCF、XDC、SDC 等语法支持 |
| 通用工具 | 文件 Git 历史与对比、代码折叠、TODO 树、词语高亮、彩虹缩进、CSV / TSV |

## 常用设置

在 VS Code 设置中搜索设置名，或在 `settings.json` 中修改。以下保存时格式化开关均默认关闭，互相独立。

| 设置 | 作用 |
| --- | --- |
| `verilogFormatter.formatOnSave` | Verilog / SystemVerilog 保存时格式化 |
| `verilogFormatter.c.formatOnSave` | C / C++ 保存时格式化 |
| `verilogFormatter.matlab.formatOnSave` | MATLAB 保存时格式化 |
| `verilogFormatter.adc.formatOnSave` | Anlogic ADC 保存时格式化 |
| `verilogFormatter.c.columnLimit` | C / C++ 行宽，默认 `999999` |

## 常用快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+Alt+F` | 使用本插件格式化当前文件 |
| `Ctrl+Alt+I` | 生成 Verilog / SystemVerilog 模块例化 |
| `F12` | 跳转到定义 |
| `F4` | C / C++ 查找定义，普通 C 函数优先查找实现 |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | 递增 / 递减选中数字 |

## 环境与使用提示

- 当前安装包面向 Windows x64，已包含 C / C++ 语义服务和格式化工具。
- C / C++ 的类型解析依赖工程头文件和编译选项；建议配置 `compile_commands.json`、`.clangd` 或 `compile_flags.txt`。
- MATLAB 运行、调试和智能编辑需要已安装的 MATLAB R2021b 或更新版本。
- C / C++ 语义服务与文件 Git 历史需要受信任的工作区；Git 历史还需要安装 Git。

## 详细功能

展开对应项目查看完整功能、配置示例和使用限制。

<details>
<summary>Verilog / SystemVerilog：格式化、导航与代码生成</summary>

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
| 例化参数展开 | 将单行例化头中的具名 `#(.参数(值), …)` 拆为独立参数行，并与端口列表分别对齐；模块声明、位置参数、宏体及夹有注释的紧凑参数列表保持原有布局 |

启用 Verilog/SystemVerilog 保存时自动格式化（`settings.json`）：

```jsonc
{
  "verilogFormatter.formatOnSave": true
}
```

#### 💡 代码补全（IntelliSense）

输入时自动弹出补全列表，或按 `Ctrl+Space` 手动触发，支持三层补全：

| 层级 | 内容 | 说明 |
|------|------|------|
| 关键字 | `always`、`assign`、`module` 等 | 内置 50+ Verilog/SV 关键字 |
| 当前文件符号 | 信号、端口、参数 | 来自当前文件，排序靠前 |
| 工作区模块名 | 跨文件模块 | 显示来源文件名 |

每个补全项携带类型图标和声明原文，鼠标悬停可预览完整声明。

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

#### 🌲 文件树

资源管理器的 **Verilog 文件树** 扫描工作区中的 Verilog/SystemVerilog 文件，按模块例化关系展示层级并支持导航；扫描时会排除配置的目录。

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

#### 🔍 语法跳转 & 定义悬停

- **跳转到定义**：`F4` 或 `F12`，快速跳转到模块、端口、寄存器、wire 的定义位置
- **查看定义**：`Alt+F4`，Peek 弹窗查看定义，无需离开当前文件
- **悬停提示**：鼠标悬停在变量或模块名上，即可查看其声明信息

支持以下声明形式：
- 多名称声明：`reg a, b, c;`
- 带初值声明：`reg [3:0] cnt = 4'd0;`
- 属性前缀：`(* mark_debug = "true" *) reg flag;`

#### ✅ 语法检查

集成 `xvlog`（Vivado 自带工具）进行 Verilog/SystemVerilog 语法检查，错误和警告直接显示在编辑器问题面板。

启用方式（`settings.json`）：

```jsonc
{
  "verilogFormatter.lintEnabled": true
}
```

#### 🔄 UCF 转 XDC

命令面板搜索 `Convert UCF to XDC`，自动将 Xilinx UCF 约束文件转换为 XDC 格式。

#### 🔢 数字递增 / 递减

- `Ctrl+Alt+↑`：递增选中数字
- `Ctrl+Alt+↓`：递减选中数字

</details>

<details>
<summary>C / C++：语义服务、跳转与格式化</summary>

### C / C++

**自动建议：** 输入字母、数字或下划线后，以自动模式请求语言服务候选；无候选时不弹出 `No suggestions.` 空框，有候选时仍正常显示。输入 `(` 仍触发参数提示，手动请求补全的行为保持不变。该模式已核对最低支持版本 [VS Code 1.95.0 的命令实现](https://github.com/microsoft/vscode/blob/1.95.0/src/vs/editor/contrib/suggest/browser/suggestController.ts#L827-L835)和[空候选处理](https://github.com/microsoft/vscode/blob/1.95.0/src/vs/editor/contrib/suggest/browser/suggestWidget.ts#L552-L559)，无需提高版本要求。

**C/C++ 语义服务：** Windows x64 安装包内置 clangd 23.1.0，受信任工作区打开 C/C++ 文件时提供类型和符号定义、结构体成员补全等功能，不需要其他 C/C++ 扩展。启用 Microsoft C/C++ 或 clangd 扩展时，本插件不重复启动内置服务；更改外部扩展启用状态后自动切换。

clangd 使用工程中的 `compile_commands.json`、`.clangd` 或 `compile_flags.txt` 解析头文件和编译选项；缺少配置时使用回退选项，嵌入式 SDK 的类型和宏可能解析不完整。未受信任工作区不启动语言服务，工作区获信任后自动启动。C/C++ 默认关闭基于词语的建议，避免成员补全混入无关全局词语；可在语言设置中将 `editor.wordBasedSuggestions` 改回 `matchingDocuments`。

**C/C++ 定义跳转：** 在函数、类型或其他符号上按 `F4`，或从命令面板执行 **C/C++：转到定义**；也可使用 `F12` / `Ctrl+单击`。F4 优先查找普通 C 函数的实现，找不到时使用语言服务的定义结果。若用户已有 `F4` 快捷键配置，其优先级高于插件默认绑定，需将 C/C++ 文件的 `F4` 绑定到 `verilogFormatter.c.goToFunction`。

优先使用当前未保存缓冲区中的实现，再查找同目录同名 `.c`，最后搜索当前文件所属工作区的 `.c` / `.h`。无需编译数据库或 SDK 头文件配置，支持 `_Noreturn`、多行参数、指针返回值及常见函数属性；忽略原型、调用、注释、字符串及宏定义，避免跳到其他 `.c` 的 `static` 函数。工作区搜索跳过常见构建目录及值为 `true` 的 `files.exclude` / `search.exclude`；已打开文件和同名 `.c` 仍可直接查找。

普通 C 函数的文本查找不判断 `#if` 分支是否启用，也不解析宏生成的函数名、函数指针目标或 C++ 重载；其他类型和符号使用 clangd 语义服务。可通过 `verilogFormatter.c.functionNavigation` 关闭 F4 和独立 C 函数查找，不会关闭 clangd 的标准定义与补全功能。

支持 `.c`、`.cpp`、`.h` 文件，使用 `Ctrl+Alt+F` 或 `Shift+Alt+F` 格式化。通用空格、缩进、花括号布局和换行实际调用 `clang-format`，继承当前文件所在工程的 `.clang-format`，没有配置时采用 LLVM 风格。在此基础上保留四空格缩进和宏体布局，并应用以下定制对齐：

- 按完整类型、变量名、等号、初始值、分号和行尾注释多列对齐连续变量定义，支持 `uint32_t`、`static bool` 等混合类型。指针及引用符号单独占列并紧贴名称，使 `*payload` 中的 `payload` 与普通变量名首字符对齐，兼容多级指针与指针数组。
- 连续声明均带 `static`、`const` 等修饰符且出现 `struct`、`union`、`enum` 或 `class` 时，进一步拆分修饰符、类型关键字和类型名列；按缩进、空行和注释分组，其他声明组保留既有类型布局。
- 对齐函数内连续赋值的左值、等号、右侧表达式、分号和行尾注释，支持数组元素及成员赋值；空行、其他语句和缩进层级变化会开始新组。
- 按宏名、宏值和行尾注释对齐连续 `#define`，带注释和无注释的宏共同计算列宽。
- 保留多行宏的续行、反斜杠和原有宏体布局；注释中的括号（如 Doxygen `@{`）由 clang-format 按注释解析。
- 保留已分行的 `= { .成员 = … }` 指定成员初始化布局，外层成员逐行排列，内嵌的小数组可继续保持一行；原有单行初始化仍按通用规则处理。
- 结构体数组采用 `AlignArrayOfStructures: Left`：同列数的表格元素每项一行，按字段列左对齐，避免长命令表合并为一行；普通一维数组保持通用规则。
- 修正结构体数组多行指定成员多出一格的缩进：成员相对元素左花括号缩进四格，元素右花括号与其左花括号对齐；宏或复杂条件编译使括号边界无法确认时保留原有布局。
- 完整格式化时，非空 C/C++ 文件末尾保留一个换行，编辑器中显示一个空白行；缺少时补齐，多余空行收为一个，沿用 LF/CRLF。选区未包含文件末尾时不调整文件尾，空文件保持为空。
- 按参数列对齐连续同名函数调用的逗号、右括号和行尾注释，保留嵌套表达式；函数名、参数数量、缩进或分组边界变化时分别对齐。
- 按类型、变量名、分号和注释多列对齐结构体成员。
- 按基础类型、别名、分号和行尾注释对齐连续简单 `typedef`，支持 `/**< … */`、`/* … */`、`//` 注释；不同缩进、空行或其他语句分别分组。
- 枚举成员一行一个（`AllowShortEnumsOnASingleLine: false`），并按枚举项名称、赋值表达式、逗号和注释多列对齐枚举定义。
- `switch` 内的 `case`、`default` 标签缩进一级（`IndentCaseLabels: true`），分支语句再缩进一级；连续 case 保持同级。
- 独立成行的单行 Doxygen 注释 `/** … */`、`/*! … */` 展开为多行，起止标记各占一行、正文使用 ` * ` 前缀；保留正文内容和内部空格。行尾成员说明 `/**< … */`、普通注释、宏续行、原始字符串及 `clang-format off` 区域不参与此展开，已有多行注释的参数和返回值说明按下述规则对齐。
- 多行 Doxygen 注释中，参数和返回值名称与说明按列对齐；代码示例和禁用格式化区域保留原样。

例如 `/** @brief FileSaveParams 命令参数，字段按协议顺序排列。 */` 格式化为：

```c
/**
 * @brief FileSaveParams 命令参数，字段按协议顺序排列。
 */
```

函数体固定保持多行（`AllowShortFunctionsOnASingleLine: None`），已有的单行函数也会展开；调用、控制条件、函数签名、花括号和空行继续遵循 clang-format 的通用规则。行宽设置 `verilogFormatter.c.columnLimit` 默认为 `999999`，优先于工程的 `ColumnLimit`；可在 VS Code 用户或工作区设置中修改，下一次格式化即生效，设为 `0` 时取消行宽限制。其他样式仍可通过工程的 `BreakBeforeBraces` 等选项调整。后处理保留 clang-format 的换行、原始字符串、多行注释和 `clang-format off/on` 区域；定制列对齐可能增加行宽。

需要 `clang-format 18+`。默认优先复用 Microsoft C/C++ 扩展自带的程序，其次使用插件内置的 Windows x64 版本，再从 PATH 查找；也可在用户设置 `verilogFormatter.c.clangFormatPath` 中指定可执行文件的绝对路径。该设置仅作用于当前机器。程序不可用或工程配置错误时报告失败，不应用局部结果。

选区格式化向 clang-format 提供完整文档及所选行范围，保留函数、宏和注释上下文；按 clang-format 规则可能扩展到完整语句。格式化期间继续编辑会使过期结果被丢弃。

开发验证时，可设置环境变量 `CLANG_FORMAT_TEST_EXE` 为本机 clang-format 的绝对路径，然后执行 `npm test -- --runInBand`，启用真实程序集成测试；未设置时只运行独立单元测试并跳过该组集成测试。

</details>

<details>
<summary>MATLAB：编辑、运行与调试</summary>

### MATLAB

已内置 MathWorks MATLAB 扩展 v1.3.13 的客户端、语言服务器、语法资源及 MATLAB 侧支持代码，不需要另行安装官方扩展。

- 基础编辑：识别 `.m` 文件、语法高亮、片段、注释、折叠和代码节显示。
- 智能编辑：自动补全、参数提示、定义跳转、引用、重命名、大纲、代码分析及快速修复。
- 执行与调试：运行文件/代码节/选区、交互终端、中断、断点、单步、调用栈及调试变量。
- 工作区：查看变量名称、值、大小及类型，支持排序、重命名、删除和可支持类型的内联编辑。
- 工程与路径：新建/打开/关闭 MATLAB Project、切换目录、加入搜索路径、在 MATLAB 中打开文件。
- 测试：发现并运行类、函数和脚本测试，包含参数化测试、结果和输出。
- 连接与授权：连接/断开 MATLAB、安装路径设置、可选登录界面及语言服务器日志。

运行、调试和智能编辑需要已安装并可使用的 MATLAB R2021b 或更高版本；工作区面板需要 R2023a 或更高版本。Jupyter 工作流仍需要单独安装 Jupyter 扩展和 MATLAB Kernel，上游仓库本身不包含这两个组件。

配置 `MATLAB.installPath` 为 MATLAB 安装根目录（例如 `D:\tools\matlab\R2025b`）。内置版本默认 `MATLAB.matlabConnectionTiming: "onDemand"`，避免编辑 Verilog/C 时自动启动 MATLAB；可改为 `onStart` 或 `never`。未受信任工作区不会启动 MATLAB 语言服务器。

`F5` 运行文件，`Ctrl+Enter` 运行当前节，`Shift+Enter` 运行选区；从左侧 MATLAB 面板查看工作区，从“测试”面板添加测试文件/文件夹。

如果同时启用官方 `MathWorks.language-matlab` 扩展，将复用官方运行服务以避免重复注册。禁用官方扩展并重新加载窗口即可使用内置实现。内置版本不向 MathWorks 发送扩展遥测。

`MATLAB.formatter` 可选择 `hanxuyao`（默认，保留下述定制规则）或 `mathworks`（使用 MATLAB 语言服务器格式化）。文档、选区以及插件快捷键会跟随此设置切换。

MATLAB 设置说明、下拉选项和工作区设置分组使用中文。设置项标题由 VS Code 根据英文配置键生成，因此在说明开头补充对应中文名称；原有配置键、选项值和默认行为保持不变。

原有格式化支持语言 ID 为 `matlab` 的文件，使用 `Ctrl+Alt+F` 或 `Shift+Alt+F` 格式化：

- 按 `function`、`if`、`for`、`switch` 等块结构统一为四空格缩进。
- 对齐整个 `%%` 配置单元内的变量名、`=`、分号和行尾 `%` 注释列；单 `%` 小标题和空行不打断对齐，下一条 `%%` 单元节标题会开始新区域。
- 函数调用和计算式赋值语句只按块结构缩进，不参与变量表对齐；字符串、数值、纯数字范围、布尔值及空数组/空元胞配置值参与对齐。
- 执行赋值语句会清理旧对齐遗留的等号和分号前空格，但不会与其他执行语句强制对齐。
- 新节内只有一个配置变量时，使用自然单空格布局，不继承前一节的对齐列宽。
- 保留字符串中的 `%`，不将其误判为注释。

</details>

<details>
<summary>Tcl：导航、悬停与折叠</summary>

### Tcl 导航与编辑（tcl-navigate）

内置 [tcl-navigate v1.0.0](https://github.com/lukemt/tcl-navigate) 的四类 Provider 和语言编辑配置，与本插件已有的 Tcl 语言注册、语法高亮配合使用。

- 大纲：查看过程、命名空间、全局变量、命名空间变量及过程中的局部变量、数组；层级符号供 VS Code 粘性滚动使用。
- 定义跳转：使用 `F12` 或 `Ctrl+单击` 跳转到过程、命名空间及变量定义，优先读取当前未保存缓冲区，找不到过程或命名空间时搜索工作区 `.tcl` 文件。
- 悬停：显示过程参数和前置注释、变量在源码中的赋值内容、命名空间说明。
- 折叠与编辑：支持过程、命名空间和控制块折叠，以及括号匹配、`#` 行注释与花括号块缩进。
- 同时启用 `lukemt.tcl-navigate` 时复用原扩展，避免重复注册；禁用原扩展并重新加载窗口后使用本插件内置版本。

Tcl 导航自 **1.5.0** 集成到桌面入口；兼容性修复使用补丁版本，新增功能升级次版本，不兼容变更升级主版本。

</details>

<details>
<summary>文件 Git 历史与版本对比</summary>

### 文件 Git 历史与版本对比

在资源管理器或编辑器中右键选择 **查看文件 Git 历史**，也可点击编辑器标题栏的历史图标，或在命令面板搜索“Git 历史：查看文件 Git 历史”。打开独立的历史页签，采用类似 Git History 的顶部工具栏、提交时间线和下方详情布局，跟随 VS Code 明暗主题。适用于 Git 仓库中所有类型的本地文本文件，不限于 Verilog；同一文件复用已打开的历史页签。

列表沿当前分支的第一父链展示文件历史，侧分支改动通过合并版本呈现，不单独展开侧分支提交。展示提交说明、版本号、作者及日期；支持搜索已加载记录中的提交说明、作者、版本号、日期和路径，按作者筛选、清除筛选与刷新。每次显示 100 条，通过“加载更多提交”继续查看；拖动列表底部分隔边缘可调整列表高度。选中提交后在下方查看详情，使用上下方向键切换提交，双击提交也可查看历史版本：

- **查看历史版本**：在只读编辑器中打开该提交时的文件。
- **与当前文件对比**：历史版本在左、当前文件在右，包含当前编辑器尚未保存的修改。
- **与上一个文件版本对比**：与该提交前的文件快照比较，合并提交采用第一父提交，首次添加前用空文件表示。
- **与其他历史版本对比**：先选中一条提交，点击“选为对比基准”，再选另一条提交并点击“与基准版本对比”。基准在左、当前选中提交在右，可随时清除基准。

历史版本和对比结果在旁边的编辑器组中打开，历史页签继续保留，便于连续浏览。

支持追踪文件重命名前的历史，各版本按当时的文件名读取；删除版本按空文件展示。查询和查看不切换分支，不覆盖工作区或暂存区。

需要安装 Git 并信任工作区；优先使用 VS Code 的 `git.path` 配置（支持路径候选列表），否则从 PATH 查找 Git。历史文本优先识别 UTF-8 / UTF-16 的 BOM，无 BOM 时按当前文件的 `files.encoding` 设置解码，支持 GBK、Big5、Shift JIS 等运行时支持的编码；其他编码需先调整该设置，二进制文件不支持文本查看或对比。未跟踪文件、空仓库和 Git 错误均有明确提示。浏览器版不提供本地 Git 功能。

功能参考 [Git History](https://github.com/DonJayamanne/gitHistoryVSCode)，使用本插件内置实现和 VS Code 原生差异编辑器，不需要安装 Git History 或其他扩展。

</details>

<details>
<summary>代码折叠与展开</summary>

### 代码折叠与展开

在代码编辑区右键，打开 **代码折叠/展开** 子菜单，选择“折叠当前代码块”“展开当前代码块”“全部折叠”或“全部展开”。也可在命令面板搜索“代码折叠”。当前块操作针对光标所在的折叠区域，全部操作针对当前文档。

直接复用 VS Code 内置命令及当前语言的折叠范围，不调用格式化器、不修改源码，不增加快捷键冲突。适用于具备折叠范围的 C/C++、Verilog/SystemVerilog、MATLAB、Tcl 等文本编辑器；折叠范围由语言扩展或 VS Code 的缩进规则决定。本功能不新增语法折叠解析器。

保留 VS Code 原有快捷键：`Ctrl+Shift+[` / `Ctrl+Shift+]` 折叠/展开当前块，`Ctrl+K Ctrl+0` / `Ctrl+K Ctrl+J` 全部折叠/展开。若右键菜单未显示，请确认 `editor.folding` 已开启；没有折叠区域的文本不会产生折叠效果。

</details>

<details>
<summary>TODO 标签与树视图</summary>

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

#### 🎨 行内高亮

打开文件时自动高亮 TODO 标签，各标签颜色可在配置中自定义。

#### 🔍 前后导航

命令面板搜索 `TODO: 跳到下一个` / `TODO: 跳到上一个`，在当前文件内的 TODO 条目间快速跳转。

#### 🏷️ 标签管理

命令面板搜索 `TODO: 添加标签` / `TODO: 删除标签`，动态管理扫描的标签关键字，无需手动编辑 `settings.json`。

</details>

<details>
<summary>词语与正则高亮</summary>

### 词语高亮（highlight-words）

内置 highlight-words v0.1.3 的全部 11 个命令和 4 项设置，不需要另外安装该扩展，适用于所有文本语言。

- 选择文字或将光标放在词语上，执行“词语高亮：切换当前词语高亮”；再次执行可移除该词语。
- 执行“高亮正则表达式”输入表达式，支持 `/expression/i`；普通选区按字面量匹配。
- 支持普通、全词、忽略大小写及全词且忽略大小写四种模式，可对单个词语修改匹配选项。
- 多个可见编辑器同步高亮；浅色和深色主题可分别配置颜色、边框或背景填充，并显示概览标尺标记。
- “词语高亮”侧栏支持逐项删除、修改选项、上一个/下一个匹配与回绕导航，也可一次清除全部标记。
- 保留 `highlightwords.colors`、`highlightwords.box`、`highlightwords.defaultMode`、`highlightwords.showSidebar` 设置和原始命令 ID，可继续使用已有快捷键。

</details>

<details>
<summary>彩虹缩进（Indent Rainbow）</summary>

### 彩虹缩进

内置 indent-rainbow v8.3.1 的全部 11 项设置，无需另装扩展。默认自动启用，按当前编辑器 `tabSize` 为每级缩进循环着色，默认排除纯文本；只显示标记，不修改文件内容。

- `classic` 模式使用半透明背景色，`light` 模式使用可调整线宽的彩色细线。
- 标记缩进宽度不是 `tabSize` 整数倍的行，以及完整缩进中的 Tab/空格混用；Markdown 默认跳过错误标记。
- 支持语言白名单、排除列表、忽略错误的语言和正则规则，保留上游颜色、更新延迟及仅空白着色设置。
- 配置修改即时生效，分屏编辑器同步更新；无效正则显示警告，未带 `g` 或匹配空字符串的正则不会导致扫描死循环。
- 已启用原扩展 `oderwat.indent-rainbow` 时复用其运行服务；禁用原扩展并重新加载窗口后使用内置版本。

在设置中搜索 `indentRainbow`，例如：

```jsonc
{
  "indentRainbow.indicatorStyle": "light",
  "indentRainbow.lightIndicatorStyleLineWidth": 1,
  "indentRainbow.includedLanguages": [],
  "indentRainbow.excludedLanguages": ["plaintext"],
  "indentRainbow.ignoreErrorLanguages": ["markdown"],
  "indentRainbow.colorOnWhiteSpaceOnly": true
}
```

</details>

<details>
<summary>CSV / TSV：彩虹列与查询</summary>

### CSV / TSV（Rainbow CSV）

内置 Rainbow CSV v3.24.1 的全部 24 个公开命令、21 项设置及 RBQL JavaScript/Python 引擎。

- CSV、TSV、分号、竖线、空白分隔以及动态分隔格式，支持内容自动识别、自定义多字符分隔符和 RFC 4180 多行引号字段。
- 彩虹列高亮、列名悬停提示、光标列信息、固定表头、虚拟表头、注释行，以及最多三列跟踪与交替行背景。
- CSVLint 检查引号和字段数；支持空格对齐、虚拟对齐、取消对齐及字段首尾空格清理，对齐时支持中文双宽字符。
- 列多光标选择、字段前后插入、跳转到列；复制为 Excel / Sheets 可粘贴格式或 Markdown 表格。
- 大文件头尾预览；通过右键菜单或状态栏 Query 打开 RBQL，支持 SELECT、UPDATE、WHERE、ORDER BY、GROUP BY、JOIN、结果导出及复制回源文件。
- 保留 `rainbow_csv.*` 设置和 `rainbow-csv.*` 命令 ID。JavaScript 查询直接可用；Python 查询需要 PATH 中可用的 `python3`。RBQL 需要受信任工作区。

同时启用原始 `rsbondi.highlight-words` 或 `mechatroner.rainbow-csv` 时复用其运行服务，避免重复注册。要使用本插件的内置版本，禁用对应原扩展后重新加载窗口；不需要卸载。

Web 入口供浏览器扩展宿主运行词语高亮、彩虹缩进和 Rainbow CSV。其限制沿用 Rainbow CSV 上游：浏览器查询使用 JavaScript，不支持 Python、本地文件 JOIN、文件头尾预览和复制回源文件。原有 MATLAB、本地编译检查等桌面功能仍需桌面版 VS Code。当前发布目标仍为 Windows x64，本次没有发布 Web 安装包。

</details>

## 配置与开发

<details>
<summary>基础格式化与 TODO 配置</summary>

## 配置项

```jsonc
{
  // 缩进空格数，默认 2
  "verilogFormatter.indentSize": 2,

  // 是否对齐行尾注释，默认 true
  "verilogFormatter.alignPortComment": true,

  // begin 是否另起一行，默认 true
  "verilogFormatter.newlineBeforeBegin": true,

  // Verilog/SystemVerilog 保存时自动格式化，默认 false
  "verilogFormatter.formatOnSave": false,

  // C/C++ 保存时自动格式化，默认 false
  "verilogFormatter.c.formatOnSave": false,

  // MATLAB 保存时自动格式化，默认 false
  "verilogFormatter.matlab.formatOnSave": false,

  // Anlogic ADC 保存时自动格式化，默认 false
  "verilogFormatter.adc.formatOnSave": false,

  // 是否启用 xvlog 语法检查，默认 false
  "verilogFormatter.lintEnabled": false,

  // 是否启用悬停查看定义，默认 true
  "verilogFormatter.hoverEnabled": true
}
```

四个保存开关互相独立，均支持用户和工作区设置，下一次保存即生效。VS Code 自带的 `editor.formatOnSave` 另行配置。

**从 1.x 升级：** 原 `verilogFormatter.formatOnSave` 仅保留为 Verilog/SystemVerilog 开关，不再同时开启 C/C++、MATLAB 和 ADC。如果以前依赖总开关开启这些语言，需要分别开启对应的新设置；新增开关默认关闭。

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

</details>

<details>
<summary>完整快捷键表</summary>

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

</details>

<details>
<summary>开发、调试、打包与代码结构</summary>

## 开发

### 环境要求

- Node.js ≥ 18
- VS Code ≥ 1.95（Rainbow CSV v3.24.1 的最低要求）

### 安装依赖 & 编译

```bash
npm install
npm run setup:matlab
npm run compile
```

### 调试

按 `F5` 启动扩展开发实例，打开任意 `.v` / `.sv` 文件测试各功能。

### 打包安装

当前安装包面向 Windows x64，包含 MATLAB 运行组件和 Windows ripgrep。发布时上传生成的 `.vsix` 文件；修改记录见 [CHANGELOG.md](CHANGELOG.md)。

```bash
npm run package -- --target win32-x64 --out hanxuyao-plugin-2.7.1-win32-x64.vsix
code --install-extension hanxuyao-plugin-2.7.1-win32-x64.vsix --force
```

MATLAB、highlight-words、Rainbow CSV、indent-rainbow、tcl-navigate 上游源码、固定提交和本地适配说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。`npm run compile` 会构建全部内置组件；仅构建高亮、CSV、彩虹缩进和 Tcl 组件可运行 `npm run compile:editor-tools`。

## 代码结构

```
hanxuyao-plugin/
├── src/
│   ├── extension.ts               # 入口，注册所有 Provider 和命令
│   ├── editorToolsWeb.ts          # 浏览器中的词语高亮与 CSV 入口
│   └── features/
│       ├── editorTools/           # 词语高亮与 CSV 生命周期、资源路径适配
│       ├── tcl/                   # Tcl 导航集成与原扩展共存
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

GitHub 自动测试、打包和发布的配置及使用方法见 [自动发布](docs/自动发布.md)。

</details>

## 修改记录

近期更新见 [更新日志](CHANGELOG.md)。

<details>
<summary>查看全部版本记录</summary>

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| v2.7.1 | 2026/11/13 | 多信号定义不参与声明和注释对齐 |
| v2.7.0 | 2026/11/13 | 大纲按声明类型分组并支持折叠 |
| v2.6.1 | 2026/11/12 | 修正结构体数组指定成员与元素右花括号的多余缩进 |
| v2.6.0 | 2026/11/11 | 内置彩虹缩进，保留 11 项设置，支持背景色、细线、错误与混用标记及桌面/Web 入口 |
| v2.5.2 | 2026/11/11 | 重组插件详情页，按功能折叠完整说明并突出快速入口 |
| v2.5.1 | 2026/11/11 | 补齐 Verilog HDL 兼容语言注册，消除语法贡献的未知语言警告 |
| v2.5.0 | 2026/11/11 | 内置 clangd 和 Windows x64 clang-format，支持独立 C/C++ 类型跳转、成员补全及格式化 |
| v2.4.1 | 2026/11/11 | 修复 Doxygen 整体对齐及 return 返回值列，取消输入点号等字符前的过期补全请求 |
| v2.4.0 | 2026/11/09 | 将文件 Git 历史升级为独立图形页签，新增提交时间线、搜索与作者筛选、详情及对比基准操作 |
| v2.3.0 | 2026/11/09 | 内置文件 Git 历史、重命名追踪、只读版本查看及与当前文件、上一个或其他历史版本对比 |
| v2.2.8 | 2026/11/09 | 对齐 Doxygen 参数、返回值名称及说明文字 |
| v2.2.7 | 2026/10/28 | C/C++ 格式化后保留一个文件尾换行，兼容 LF/CRLF、空文件及选区边界 |
| v2.2.6 | 2026/10/21 | 将原图标等比例缩至 395×855 并保存为 PNG，解除 Marketplace 尺寸限制，发布此前累计修复 |
| v2.2.5 | 2026/10/21 | 修复 C/C++ 自动输入无候选时弹出 No suggestions.，保留正常补全及参数提示 |
| v2.2.4 | 2026/10/20 | 结构体数组逐项换行并按字段列对齐，修复长命令表被合并为一行的问题 |
| v2.2.3 | 2026/10/15 | 分列对齐带修饰符声明的类型关键字和类型名，保持指针、名称及后续列对齐 |
| v2.2.2 | 2026/10/14 | 分离指针符号列，使指针与普通变量名称对齐，保持后续等号、分号和注释列对齐 |
| v2.2.1 | 2026/10/14 | 将独立单行 Doxygen 注释展开为标准多行块，保留正文、行尾成员注释和受保护区域，兼容选区与重复格式化 |
| v2.2.0 | 2026/10/12 | 新增 C 函数定义跳转和 F4 实现查找，支持头文件到源码、未保存缓冲区及工作区搜索 |
| v2.1.2 | 2026/10/12 | 保留 C/C++ 多行指定成员初始化及内嵌单行数组布局，兼容选区格式化和行宽设置 |
| v2.1.1 | 2026/10/09 | C/C++ 的 case/default 相对 switch 缩进一级，保留连续标签和嵌套分支的正确层级 |
| v2.1.0 | 2026/10/09 | 新增编辑器右键代码折叠/展开子菜单，复用当前块和全部代码的原生折叠命令，不改写源码 |
| v2.0.3 | 2026/10/08 | 修复 Verilog 紧凑例化参数留在一行的问题，拆分具名参数并保留嵌套表达式，参数与端口分别对齐 |
| v2.0.2 | 2026/09/29 | 禁止枚举合并为单行，保持每个成员独占一行并保留既有枚举项对齐 |
| v2.0.1 | 2026/09/29 | 修复连续简单 typedef 的类型、别名、分号和行尾注释对齐，保留复杂声明及分组边界 |
| v2.0.0 | 2026/09/24 | 按 Verilog/SystemVerilog、C/C++、MATLAB、ADC 拆分保存格式化开关；原开关仅控制 Verilog，提供独立工作区配置及升级说明 |
| v1.6.3 | 2026/09/23 | 禁止短函数合并为单行，展开已有单行函数，保留可配置行宽及其他格式规则 |
| v1.6.2 | 2026/09/23 | C/C++ 行宽默认设为 999999，支持用户或工作区设置；记录新版核验后自动清理旧安装包的授权 |
| v1.6.1 | 2026/09/22 | 每次修改通过验证后默认自动打包发布，统一仓库规则、版本规则和发布文档；发布此前完成的 C/C++ clang-format 集成 |
| v1.6.0 | 2026/09/22 | C/C++ 通用格式与换行接入 clang-format，保留定制多列对齐，修复宏续行和枚举缩进，支持工程样式及完整上下文选区格式化 |
| v1.5.0 | 2026/09/21 | 内置 Tcl 大纲、定义跳转、折叠、悬停及粘性滚动支持，修复上游导航边界，同步简介与文档；调整为按功能范围选择版本 |
| v1.4.11 | 2026/09/21 | 内置 highlight-words 与 Rainbow CSV，保留完整命令、配置、CSV/RBQL 运行资源和 Web 入口；同步插件简介、中文功能说明与代码注释 |
| v1.4.10 | 2026/09/15 | 统一宏定义的宏值和注释列，新增连续同名函数调用的参数、逗号和右括号对齐，保留字面量及嵌套表达式 |
| v1.4.9 | 2026/09/15 | 补齐函数内连续赋值的等号、表达式、分号和注释对齐，支持数组元素及成员赋值，保留分组边界和字面量内容 |
| v1.4.8 | 2026/09/15 | 修复 C/C++ 混合类型变量声明对齐，补齐等号、初始值、分号和行尾注释列，统一等号后的空格 |
| v1.4.7 | 2026/09/11 | 将 MATLAB 设置说明、下拉选项和工作区分组中文化，保留原有配置键及选项值 |
| v1.4.6 | 2026/09/11 | 固定验证后的自动发布流程，要求本地只保留最新验证通过的插件安装包 |
| v1.4.5 | 2026/09/11 | 整理 MATLAB 集成发布说明与使用要求，补齐构建步骤，生成 Windows x64 安装包；新增 GitHub Actions 标签自动发布 |
| v1.4.4 | 2026/09/11 | 内置 MathWorks MATLAB 编辑、运行调试、工作区、工程和测试功能，保留定制格式化并增加实现切换 |
| v1.4.3 | 2026/09/11 | 新增 Codex 仓库规则，要求每次更新同步版本号和修改记录，并从安装包排除开发规则 |
| v1.4.2 | 2026/08/21 | 将跨行的 C/C++ 控制条件整理为单行 |
| v1.4.1 | 2026/08/21 | 输入 C/C++ 标识符时主动显示语言服务器建议，输入 `(` 时显示函数参数提示 |
| v1.4.0 | 2026/08/21 | 新增 C/C++ 函数体、控制语句和嵌套代码块缩进重算 |
| v1.3.4 | 2026/08/21 | 修复 VSIX 未打包 Windows ripgrep 导致 TODO Tree 扫描失败的问题 |
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

</details>
