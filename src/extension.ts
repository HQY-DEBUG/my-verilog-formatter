// =========================================================================
// 文件    : extension.ts
// 描述    : VS Code 扩展入口，注册所有 Provider 和命令
// 版本    : v0.2.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.2.0  2026/05/25  新增文件树、例化、跳转、悬停、语法检查、UCF转XDC、数字编辑
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';
import { VerilogFormatter }          from './formatter';
import { registerInstantiatorCommands } from './instantiator';
import { registerFileTree }          from './fileTree';
import { registerSymbolProviders }   from './symbolProvider';
import { registerLinter }            from './linter';
import { registerUcfToXdcCommand }   from './ucfToXdc';
import { registerNumberEditCommands } from './numberEdit';

export function activate(context: vscode.ExtensionContext): void {
    const formatter = new VerilogFormatter();

    // ---- 格式化 ----//
    const VERILOG_LANGS = ['verilog', 'systemverilog'];
    for (const lang of VERILOG_LANGS) {
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider({ language: lang }, formatter),
            vscode.languages.registerDocumentRangeFormattingEditProvider({ language: lang }, formatter),
        );
    }

    // ---- 一键例化 / TB ----//
    registerInstantiatorCommands(context);

    // ---- 文件树 ----//
    registerFileTree(context);

    // ---- 语法跳转 + 悬停 ----//
    registerSymbolProviders(context);

    // ---- 语法检查 ----//
    registerLinter(context);

    // ---- UCF → XDC ----//
    registerUcfToXdcCommand(context);

    // ---- 数字递增/递减 ----//
    registerNumberEditCommands(context);
}

export function deactivate(): void {
    // 清理工作（当前无需处理）
}
