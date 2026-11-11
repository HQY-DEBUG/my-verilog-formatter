# 内置组件来源

本插件内置下列上游组件的源码快照，版权归原作者所有。插件身份保持为 `hanxuyao.hanxuyao-plugin`，不是 MathWorks 官方发行版。

## C/C++ 语义与格式化组件

- [clangd 23.1.0 Windows x64](https://github.com/clangd/clangd/releases/tag/23.1.0)：LLVM 官方二进制包，Apache License 2.0 with LLVM Exceptions。固定压缩包及 SHA-256 用于可复现构建，许可证随运行资源位于 `out/clangd/clangd_23.1.0/LICENSE.TXT`。
- [vscode-languageclient 9.0.1](https://github.com/microsoft/vscode-languageserver-node)：MIT 许可证，用于 VS Code 与 clangd 的语言服务协议通信；许可证随 npm 依赖分发。
- [@cpp-linter/clang-format-win32-x64 23.1.3](https://github.com/cpp-linter/clang-tools-npm)：Apache License 2.0 with LLVM Exceptions，提供 Windows x64 的 clang-format，npm 依赖包含许可证和二进制来源信息。

| 组件 | 版本 / 固定提交 | 许可证 |
| --- | --- | --- |
| [MATLAB extension for VS Code](https://github.com/mathworks/MATLAB-extension-for-vscode) | v1.3.13 / `91d25e45277983d9366bd2044f8f4bedb4107bfc` | [MIT](https://github.com/mathworks/MATLAB-extension-for-vscode/blob/91d25e45277983d9366bd2044f8f4bedb4107bfc/LICENSE) |
| [MATLAB language server](https://github.com/mathworks/MATLAB-language-server) | v1.3.13 / `5f4691951d4ccac77f5cb72376b80cc77c54e2cc` | [MIT](https://github.com/mathworks/MATLAB-language-server/blob/5f4691951d4ccac77f5cb72376b80cc77c54e2cc/LICENSE) |
| [MATLAB language grammar](https://github.com/mathworks/MATLAB-Language-grammar) | `fd473ebfa18cb31a5da7aa1c5d20deee4e122ba9` | [BSD 2-Clause](https://github.com/mathworks/MATLAB-Language-grammar/blob/fd473ebfa18cb31a5da7aa1c5d20deee4e122ba9/license.txt) |

## 集成范围

源码位于 `vendor/matlab/`，保留生产功能代码、构建配置、锁定依赖和许可文本；不引入上游 Git 历史、CI 配置、测试目录和演示图片。授权网页资源随语言服务器一起构建。安装包中对应目录为 `out/matlab/`，包含客户端、语言服务器、MATLAB 支持代码、WASM、Webview、语法及原许可证。

保留上游的命令、配置、快捷键、调试器、终端、视图和语言贡献。包括基础编辑、智能编辑、运行与调试、代码节、工作区变量、工程管理、路径操作、测试发现及执行、连接和可选登录流程。Jupyter 扩展和 MATLAB Kernel 为上游文档要求的外部配套组件，不属于此源码仓库。

## 本地适配

1. 将插件贡献的资源路径映射到 `out/matlab/`，使用适配后的扩展上下文定位运行资源；全局及工作区状态仍由宿主插件保存。
2. 增加 `MATLAB.formatter`，通过语言客户端中间件选择 MathWorks 格式化或现有自定义格式化，避免同时返回两套修改。
3. 将启动参数读取键修正为上游实际声明的 `MATLAB.matlabConnectionTiming`；默认 `onDemand`，避免宿主启动时自动运行 MATLAB。
4. 修复上游配置变更监听器未调用处理函数的问题，使登录选项变更能更新监听器。
5. 内置遥测接口不发送事件，不使用上游遥测应用凭据。保留设置键和调用接口，其他功能不依赖遥测结果。
6. 同时启用 MathWorks 官方扩展时复用其运行服务，避免重复注册；禁用官方扩展并重新加载后使用内置实现。
7. 将上游 TypeScript 全局类型限定为 Node，并显式引入 `DOM.Iterable`，避免与宿主 Jest/Mocha 类型冲突。打包后的依赖许可汇总位于 `out/matlab/THIRD_PARTY_LICENSES.txt`。

上游历史源码注释和许可证保留原文，原始空白通过 Git 属性豁免空白检查；本地新增说明使用中文。后续升级需要重新核对上游贡献点、以上适配以及运行资源路径，不能只替换客户端文件。

## 运行要求

MATLAB 本体及其授权不包含在插件中。运行、调试及高级编辑需要可使用的 MATLAB R2021b 或更高版本；工作区面板需要 R2023a 或更高版本。详细功能限制以固定版本的上游 README 为准。

## 构建

```text
npm install
npm run setup:matlab
npm run compile
npm test -- --runInBand
```

`setup:matlab` 按三个上游锁文件安装构建依赖；`compile` 编译客户端、语言服务器、工作区界面和登录网页，再将运行资源复制到宿主输出目录。仅运行根目录 `tsc` 不会生成完整 MATLAB 组件。

## highlight-words 与 Rainbow CSV（2026/09/21）

| 组件 | 版本 / 固定提交 | 许可证 |
| --- | --- | --- |
| [highlight-words](https://github.com/rsbondi/highlight-words) | v0.1.3 / `a93c4967d36d861face6468ea0af698b646e7430` | MIT，保留 `vendor/highlight-words/LICENSE.md` |
| [Rainbow CSV](https://github.com/mechatroner/vscode_rainbow_csv) | v3.24.1 / `82f1b82272e567d6e1736fce845f94eccef6d211` | MIT，保留 `vendor/rainbow-csv/LICENSE` |
| RBQL | 随上述 Rainbow CSV 快照 | MIT，保留 `rbql_core/LICENSE` |
| textarea-caret-position / wcwidth | 随上述 Rainbow CSV 快照 | 各自原许可，保留 `contrib/*/LICENSE` |

生产源码位于 `vendor/highlight-words/`、`vendor/rainbow-csv/`，保留原始 manifest 以核对贡献点，不引入 Git 历史、CI 或开发依赖。Rainbow CSV 原单元测试位于 `test/upstream/rainbow-csv/`，仅调整两个模块加载路径，其许可见上述 Rainbow CSV 许可。

`scripts/build-editor-tools.js` 用根目录已锁定的 esbuild 构建词语高亮，将 Rainbow CSV 的语法、Webview、列工具、RBQL 双引擎、辅助库和许可证复制到 `out/`；Web 入口按上游构建方式屏蔽 Node 专属模块。构建不连接上游服务，不增加运行时 npm 依赖。

本地适配：

1. 保留上游 11 + 24 个公开命令、4 + 21 项设置及其 ID，合并语言、语法、菜单、视图、颜色与语义高亮贡献；资源路径映射到 `out/<组件>/`，命令和设置说明使用中文。
2. 使用独立资源上下文和宿主状态存储；已启用原扩展时复用原扩展服务。禁用原扩展后使用内置版本，原扩展的历史状态不会自动迁移。
3. 修复 highlight-words 零长度正则循环、空编辑器/取消输入、前后回绕与多行匹配、跨编辑器计数、配置变更装饰器释放和树/命令/事件清理。普通文本继续转义后匹配，正则保留上游语义。
4. Rainbow CSV 查询入口和实际执行处增加工作区信任检查，防止受限工作区执行查询代码；释放退出时的动态资源。其余生产算法保留上游实现。
5. 桌面入口保留完整功能，新增 Web 入口仅运行这两个组件；浏览器运行限制与上游一致。现有桌面 MATLAB 和 Verilog 开发工具不因 Web 入口变为浏览器功能。

许可证同时复制到安装包的 `out/highlight-words/` 和 `out/rainbow-csv/`。上游源码注释保持原文，本地适配以中文日期注释标明。后续升级需要重新核对全部贡献点、资源依赖、工作区信任和原扩展共存行为。

## tcl-navigate（2026/09/21）

来源：[lukemt/tcl-navigate](https://github.com/lukemt/tcl-navigate)，v1.0.0，固定提交 `e3e78a050ee400fb8777adc523f0b8d444c82757`，MIT 许可证，Copyright (c) 2025 lukemt。

源码位于 `vendor/tcl-navigate/src/extension.ts`，保留上游 manifest、README 和 LICENSE。根目录锁定的 esbuild 将运行时构建为 `out/tcl-navigate/extension.js`，许可证同时复制到 `out/tcl-navigate/LICENSE`，不安装上游开发依赖。

集成全部 DocumentSymbol、Definition、FoldingRange、Hover Provider，以及缩进、注释和括号配置；大纲符号支持 VS Code 粘性滚动。已有 Tcl 语言与语法资源沿用宿主贡献，未启用原扩展时直接使用内置实现。

本地适配包括：语言配置随上下文释放；取消启动提示；修复单行过程选区超出符号范围、限定名跨文件检索丢失 `::`、变量引用前缀识别、转义花括号和首行文档注释。保留上游静态解析方式，没有加入 Tcl 执行器或语言服务器；Tcl 增强目前仅注册在桌面入口。

## indent-rainbow（2026/11/11）

来源：[oderwat/vscode-indent-rainbow](https://github.com/oderwat/vscode-indent-rainbow)，v8.3.1，固定提交 `4c78a0c3a9be6617c96891f7a40f2ad365c845ce`，MIT 许可证，Copyright (c) 2016 Hans Raaf。

源码及原始 manifest、README、许可证位于 `vendor/indent-rainbow/`。使用现有 esbuild 构建 `out/indent-rainbow/extension.js`，并复制 `out/indent-rainbow/LICENSE.txt`；Web 入口静态打包同一份源码，不增加 npm 运行依赖。

保留全部 11 项 `indentRainbow.*` 设置、默认值及背景/细线两种模式；设置说明使用中文。已有启用的 `oderwat.indent-rainbow` 时复用其服务，禁用原扩展并重载后使用内置实现。

本地重整运行时，在保留上游层级循环、错误优先级、Tab/空格混用及可补齐整级范围的着色行为基础上，支持配置即时生效、可见分屏和 tabSize 变化刷新；正则统一扫描全部匹配，零长度匹配推进完整 Unicode 码点，无效正则提示后跳过，空颜色数组回退默认色。停用时取消定时器，释放全部监听器和装饰器，避免宿主生命周期结束后残留任务。
