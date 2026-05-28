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

import * as vscode from 'vscode';

// 递增/递减模式
type EditMode = 'increment' | 'decrement';

/**
 * @brief 对选区内所有十进制整数做递增或递减
 * @param step 步长，从配置读取，默认 1
 */
function editNumbers(mode: EditMode): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const cfg  = vscode.workspace.getConfiguration('verilogFormatter');
    const step = cfg.get<number>('incrementStep', 1);
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
export function registerNumberEditCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.incrementNumbers', () => editNumbers('increment')),
        vscode.commands.registerCommand('verilogFormatter.decrementNumbers', () => editNumbers('decrement'))
    );
}
