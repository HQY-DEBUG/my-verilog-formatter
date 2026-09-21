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
exports.activateTcl = activateTcl;
exports.deactivateTcl = deactivateTcl;
// 文件：tclIntegration.ts；描述：内置 Tcl 导航的启动和原扩展共存管理。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 集成 Tcl 大纲、定义、折叠、悬停及缩进配置。
const vscode = __importStar(require("vscode"));
let runtime;
// 2026/09/21 新增：沿用现有 Tcl 语言与语法贡献，启用原扩展时复用其 Provider。
async function activateTcl(context) {
    const subscriptions = [];
    try {
        const original = vscode.extensions.getExtension('lukemt.tcl-navigate');
        if (original) {
            await original.activate();
            return;
        }
        const adapted = Object.create(context);
        Object.defineProperty(adapted, 'subscriptions', { value: subscriptions });
        runtime = require(context.asAbsolutePath('out/tcl-navigate/extension.js'));
        runtime.activate(adapted);
        context.subscriptions.push(...subscriptions);
    }
    catch (error) {
        subscriptions.forEach(item => item.dispose());
        runtime = undefined;
        console.error('内置 Tcl 导航启动失败：', error);
        void vscode.window.showErrorMessage(`内置 Tcl 导航启动失败：${error instanceof Error ? error.message : String(error)}`);
    }
}
// 2026/09/21 新增：仅停止本插件启动的运行时，Provider 由上下文统一释放。
function deactivateTcl() {
    runtime?.deactivate();
    runtime = undefined;
}
//# sourceMappingURL=tclIntegration.js.map