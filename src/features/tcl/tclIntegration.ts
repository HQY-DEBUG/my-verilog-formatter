// 文件：tclIntegration.ts；描述：内置 Tcl 导航的启动和原扩展共存管理。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 集成 Tcl 大纲、定义、折叠、悬停及缩进配置。
import * as vscode from 'vscode';

interface TclRuntime {
    activate(context: vscode.ExtensionContext): void;
    deactivate(): void;
}
let runtime: TclRuntime | undefined;

// 2026/09/21 新增：沿用现有 Tcl 语言与语法贡献，启用原扩展时复用其 Provider。
export async function activateTcl(context: vscode.ExtensionContext): Promise<void> {
    const subscriptions: vscode.Disposable[] = [];
    try {
        const original = vscode.extensions.getExtension('lukemt.tcl-navigate');
        if (original) { await original.activate(); return; }
        const adapted: vscode.ExtensionContext = Object.create(context);
        Object.defineProperty(adapted, 'subscriptions', { value: subscriptions });
        runtime = require(context.asAbsolutePath('out/tcl-navigate/extension.js')) as TclRuntime;
        runtime.activate(adapted);
        context.subscriptions.push(...subscriptions);
    } catch (error) {
        subscriptions.forEach(item => item.dispose());
        runtime = undefined;
        console.error('内置 Tcl 导航启动失败：', error);
        void vscode.window.showErrorMessage(`内置 Tcl 导航启动失败：${error instanceof Error ? error.message : String(error)}`);
    }
}

// 2026/09/21 新增：仅停止本插件启动的运行时，Provider 由上下文统一释放。
export function deactivateTcl(): void {
    runtime?.deactivate();
    runtime = undefined;
}
