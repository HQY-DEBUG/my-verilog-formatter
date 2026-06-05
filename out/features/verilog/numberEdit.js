"use strict";
// =========================================================================
// 文件    : numberEdit.ts
// 描述    : 数字递增/递减命令
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
// =========================================================================
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
exports.registerNumberEditCommands = registerNumberEditCommands;
const vscode = __importStar(require("vscode"));
/**
 * @brief 对选区内所有十进制整数做递增或递减
 * @param step 步长，从配置读取，默认 1
 */
function editNumbers(mode) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const cfg = vscode.workspace.getConfiguration('verilogFormatter');
    const step = cfg.get('incrementStep', 1);
    const sign = mode === 'increment' ? 1 : -1;
    editor.edit(builder => {
        for (const sel of editor.selections) {
            const text = editor.document.getText(sel);
            // 替换选区内所有十进制整数（不含 Verilog 基数前缀中的数字部分）
            const replaced = text.replace(/\b(\d+)\b/g, (_, n) => {
                return String(Number(n) + sign * step);
            });
            if (replaced !== text) {
                builder.replace(sel, replaced);
            }
        }
    });
}
/**
 * @brief 注册数字递增/递减命令
 * @param context 扩展上下文
 */
function registerNumberEditCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand('verilogFormatter.incrementNumbers', () => editNumbers('increment')), vscode.commands.registerCommand('verilogFormatter.decrementNumbers', () => editNumbers('decrement')));
}
//# sourceMappingURL=numberEdit.js.map