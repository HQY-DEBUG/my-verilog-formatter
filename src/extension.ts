// =========================================================================
// 文件    : extension.ts
// 描述    : VS Code 扩展入口，注册 Verilog 格式化 Provider
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';
import { VerilogFormatter } from './formatter';

export function activate(context: vscode.ExtensionContext): void {
    const formatter = new VerilogFormatter();

    // 注册整文档格式化 Provider（支持 .v / .vh）
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            { language: 'verilog' },
            formatter
        )
    );

    // 注册整文档格式化 Provider（支持 .sv / .svh）
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            { language: 'systemverilog' },
            formatter
        )
    );

    // 注册区域格式化 Provider
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider(
            { language: 'verilog' },
            formatter
        )
    );
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider(
            { language: 'systemverilog' },
            formatter
        )
    );
}

export function deactivate(): void {
    // 清理工作（当前无需处理）
}
