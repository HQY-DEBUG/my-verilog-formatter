# MATLAB 内置组件来源

本插件内置下列上游组件的源码快照，版权归原作者所有。插件身份保持为 `hanxuyao.hanxuyao-plugin`，不是 MathWorks 官方发行版。

| 组件 | 版本 / 固定提交 | 许可证 |
| --- | --- | --- |
| [MATLAB extension for VS Code](https://github.com/mathworks/MATLAB-extension-for-vscode) | v1.3.13 / `91d25e45277983d9366bd2044f8f4bedb4107bfc` | [MIT](vendor/matlab/LICENSE) |
| [MATLAB language server](https://github.com/mathworks/MATLAB-language-server) | v1.3.13 / `5f4691951d4ccac77f5cb72376b80cc77c54e2cc` | [MIT](vendor/matlab/server/LICENSE) |
| [MATLAB language grammar](https://github.com/mathworks/MATLAB-Language-grammar) | `fd473ebfa18cb31a5da7aa1c5d20deee4e122ba9` | [BSD 2-Clause](vendor/matlab/syntaxes/license.txt) |

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
