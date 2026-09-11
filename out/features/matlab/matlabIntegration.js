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
exports.useMathWorksFormatter = useMathWorksFormatter;
exports.activateMatlab = activateMatlab;
exports.deactivateMatlab = deactivateMatlab;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
let runtime;
function useMathWorksFormatter() {
    return vscode.workspace.getConfiguration('MATLAB').get('formatter', 'hanxuyao') === 'mathworks';
}
async function activateMatlab(context) {
    const official = vscode.extensions.getExtension('MathWorks.language-matlab');
    if (official) {
        // 同时安装官方扩展时复用它，防止重复注册命令、终端和调试适配器。
        await official.activate();
        void vscode.window.showInformationMessage('已复用已安装的 MathWorks MATLAB 扩展。禁用该扩展并重新加载窗口后，将使用本插件的内置 MATLAB 功能。');
        return;
    }
    const extensionPath = context.asAbsolutePath(path.join('out', 'matlab'));
    runtime = require(path.join(extensionPath, 'out', 'extension.js'));
    // 上游以扩展根目录定位语法、WASM、服务器和 Webview，状态存储仍使用宿主上下文。
    const matlabContext = Object.create(context);
    Object.defineProperties(matlabContext, {
        extensionPath: { value: extensionPath },
        extensionUri: { value: vscode.Uri.file(extensionPath) },
        asAbsolutePath: { value: (relative) => path.join(extensionPath, relative) },
    });
    try {
        await runtime.activate(matlabContext);
    }
    catch (error) {
        await runtime.deactivate();
        runtime = undefined;
        throw error;
    }
}
async function deactivateMatlab() {
    await runtime?.deactivate();
    runtime = undefined;
}
//# sourceMappingURL=matlabIntegration.js.map