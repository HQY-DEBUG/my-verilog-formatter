// 文件：editorToolsWeb.ts；描述：浏览器环境中的词语高亮、Rainbow CSV 和彩虹缩进入口。
// 版本：v2.6.0；日期：2026/11/11
// 修改记录：v2.6.0 2026/11/11 静态打包彩虹缩进运行时。
// 修改记录：v1.0 2026/09/21 保留上游 Web 编辑与 JavaScript 查询能力。
import * as vscode from 'vscode';
import { activateEditorTools, deactivateEditorTools } from './features/editorTools/editorToolsIntegration';

// 静态打包通用编辑组件，浏览器入口不加载桌面 MATLAB 或本地进程功能。
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await activateEditorTools(context, {
        'highlight-words': () => require('../vendor/highlight-words/src/extension.ts'),
        'rainbow-csv': () => require('../vendor/rainbow-csv/extension.js'),
        'indent-rainbow': () => require('../vendor/indent-rainbow/src/extension.ts'),
    });
}

export const deactivate = deactivateEditorTools;
