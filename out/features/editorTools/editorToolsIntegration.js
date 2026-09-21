"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateEditorTools = activateEditorTools;
exports.deactivateEditorTools = deactivateEditorTools;
// 文件：editorToolsIntegration.ts；描述：内置词语高亮和 CSV 的激活、资源定位及释放。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 新增桌面与 Web 共用的集成入口。
const vscode = __importStar(require("vscode"));
const activeRuntimes = [];
// 2026/09/21 新增：保留上游命令与设置；已有原扩展时复用其服务以避免重复注册。
async function activateEditorTools(context, loaders) {
    for (const [name, id] of [
        ['highlight-words', 'rsbondi.highlight-words'],
        ['rainbow-csv', 'mechatroner.rainbow-csv'],
    ]) {
        const subscriptions = [];
        let runtime;
        try {
            const installed = vscode.extensions.getExtension(id);
            if (installed) {
                await installed.activate();
                continue;
            }
            const extensionUri = vscode.Uri.joinPath(context.extensionUri, 'out', name);
            const adapted = Object.create(context);
            Object.defineProperties(adapted, {
                extensionUri: { value: extensionUri },
                extensionPath: { value: extensionUri.fsPath },
                asAbsolutePath: { value: (relative) => vscode.Uri.joinPath(extensionUri, relative).fsPath },
                subscriptions: { value: subscriptions },
            });
            runtime = loaders ? loaders[name]() : require(adapted.asAbsolutePath('extension.js'));
            await runtime.activate(adapted);
            activeRuntimes.push(runtime);
            context.subscriptions.push(...subscriptions);
        }
        catch (error) {
            subscriptions.forEach(subscription => subscription.dispose());
            try {
                await runtime?.deactivate();
            }
            catch (cleanupError) {
                console.error(`${name} 清理失败：`, cleanupError);
            }
            console.error(`内置 ${name} 启动失败：`, error);
            void vscode.window.showErrorMessage(`内置 ${name} 启动失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
// 2026/09/21 新增：只停止由本插件启动的运行时，外部扩展仍由 VS Code 管理。
async function deactivateEditorTools() {
    for (const runtime of activeRuntimes.splice(0)) {
        try {
            await runtime.deactivate();
        }
        catch (error) {
            console.error('高亮或 CSV 组件停止失败：', error);
        }
    }
}
//# sourceMappingURL=editorToolsIntegration.js.map