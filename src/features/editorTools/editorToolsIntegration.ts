// 文件：editorToolsIntegration.ts；描述：内置词语高亮和 CSV 的激活、资源定位及释放。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 新增桌面与 Web 共用的集成入口。
import * as vscode from 'vscode';

export interface EditorToolRuntime {
    activate(context: vscode.ExtensionContext): unknown;
    deactivate(): unknown;
}
type RuntimeLoaders = Record<string, () => EditorToolRuntime>;
const activeRuntimes: EditorToolRuntime[] = [];

// 2026/09/21 新增：保留上游命令与设置；已有原扩展时复用其服务以避免重复注册。
export async function activateEditorTools(context: vscode.ExtensionContext, loaders?: RuntimeLoaders): Promise<void> {
    for (const [name, id] of [
        ['highlight-words', 'rsbondi.highlight-words'],
        ['rainbow-csv', 'mechatroner.rainbow-csv'],
    ]) {
        const subscriptions: vscode.Disposable[] = [];
        let runtime: EditorToolRuntime | undefined;
        try {
            const installed = vscode.extensions.getExtension(id);
            if (installed) {
                await installed.activate();
                continue;
            }
            const extensionUri = vscode.Uri.joinPath(context.extensionUri, 'out', name);
            const adapted: vscode.ExtensionContext = Object.create(context);
            Object.defineProperties(adapted, {
                extensionUri: { value: extensionUri },
                extensionPath: { value: extensionUri.fsPath },
                asAbsolutePath: { value: (relative: string) => vscode.Uri.joinPath(extensionUri, relative).fsPath },
                subscriptions: { value: subscriptions },
            });
            runtime = loaders ? loaders[name]() : require(adapted.asAbsolutePath('extension.js')) as EditorToolRuntime;
            await runtime.activate(adapted);
            activeRuntimes.push(runtime);
            context.subscriptions.push(...subscriptions);
        } catch (error) {
            subscriptions.forEach(subscription => subscription.dispose());
            try { await runtime?.deactivate(); } catch (cleanupError) { console.error(`${name} 清理失败：`, cleanupError); }
            console.error(`内置 ${name} 启动失败：`, error);
            void vscode.window.showErrorMessage(`内置 ${name} 启动失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// 2026/09/21 新增：只停止由本插件启动的运行时，外部扩展仍由 VS Code 管理。
export async function deactivateEditorTools(): Promise<void> {
    for (const runtime of activeRuntimes.splice(0)) {
        try { await runtime.deactivate(); } catch (error) { console.error('高亮或 CSV 组件停止失败：', error); }
    }
}
