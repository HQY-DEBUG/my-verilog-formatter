// 文件：editorToolsWeb.ts；描述：浏览器环境中的词语高亮和 Rainbow CSV 入口。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 保留上游 Web 编辑与 JavaScript 查询能力。
import * as vscode from 'vscode';
import { activateEditorTools, deactivateEditorTools } from './features/editorTools/editorToolsIntegration';

// 2026/09/21 新增：静态打包两个上游组件，不在浏览器加载桌面 MATLAB 或本地进程功能。
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await activateEditorTools(context, {
        'highlight-words': () => require('../vendor/highlight-words/src/extension.ts'),
        'rainbow-csv': () => require('../vendor/rainbow-csv/extension.js'),
    });
}

export const deactivate = deactivateEditorTools;
