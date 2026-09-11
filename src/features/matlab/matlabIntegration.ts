import * as path from 'path';
import * as vscode from 'vscode';

interface MatlabRuntime {
    activate(context: vscode.ExtensionContext): Promise<void>;
    deactivate(): Promise<void>;
}

let runtime: MatlabRuntime | undefined;

export function useMathWorksFormatter(): boolean {
    return vscode.workspace.getConfiguration('MATLAB').get<string>('formatter', 'hanxuyao') === 'mathworks';
}

export async function activateMatlab(context: vscode.ExtensionContext): Promise<void> {
    const official = vscode.extensions.getExtension('MathWorks.language-matlab');
    if (official) {
        // 同时安装官方扩展时复用它，防止重复注册命令、终端和调试适配器。
        await official.activate();
        void vscode.window.showInformationMessage('已复用已安装的 MathWorks MATLAB 扩展。禁用该扩展并重新加载窗口后，将使用本插件的内置 MATLAB 功能。');
        return;
    }

    const extensionPath = context.asAbsolutePath(path.join('out', 'matlab'));
    runtime = require(path.join(extensionPath, 'out', 'extension.js')) as MatlabRuntime;
    // 上游以扩展根目录定位语法、WASM、服务器和 Webview，状态存储仍使用宿主上下文。
    const matlabContext: vscode.ExtensionContext = Object.create(context);
    Object.defineProperties(matlabContext, {
        extensionPath: { value: extensionPath },
        extensionUri: { value: vscode.Uri.file(extensionPath) },
        asAbsolutePath: { value: (relative: string) => path.join(extensionPath, relative) },
    });
    try {
        await runtime.activate(matlabContext);
    } catch (error) {
        await runtime.deactivate();
        runtime = undefined;
        throw error;
    }
}

export async function deactivateMatlab(): Promise<void> {
    await runtime?.deactivate();
    runtime = undefined;
}
