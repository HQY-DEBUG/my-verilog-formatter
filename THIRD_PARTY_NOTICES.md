# 内置组件来源

本插件内置下列上游组件的源码快照，版权归原作者所有。插件身份保持为 `hanxuyao.hanxuyao-plugin`，不是 MathWorks 官方发行版。

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
