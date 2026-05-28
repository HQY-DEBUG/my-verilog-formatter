// =========================================================================
// 文件    : completionProvider.ts
// 描述    : Verilog/SV 代码补全：关键字、当前文件符号、工作区模块名
// 版本    : v0.1.0
// 日期    : 2026/05/27
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/27  创建文件
// =========================================================================

import * as vscode from 'vscode';
import { VerilogSymbolIndex } from './symbolProvider';

// ---- Verilog / SV 关键字列表 ----//
const VERILOG_KEYWORDS: string[] = [
    'module', 'endmodule', 'input', 'output', 'inout',
    'wire', 'reg', 'logic', 'integer', 'parameter', 'localparam',
    'assign', 'always', 'always_ff', 'always_comb', 'always_latch',
    'initial', 'begin', 'end', 'if', 'else', 'case', 'casex', 'casez',
    'endcase', 'for', 'while', 'repeat', 'forever', 'fork', 'join',
    'task', 'endtask', 'function', 'endfunction',
    'generate', 'endgenerate', 'genvar',
    'posedge', 'negedge', 'or', 'and', 'not',
    'signed', 'unsigned', 'default', 'disable',
    'timescale', 'define', 'include', 'ifdef', 'ifndef', 'endif',
    'package', 'endpackage', 'interface', 'endinterface',
    'modport', 'clocking', 'endclocking',
    'enum', 'struct', 'union', 'typedef', 'automatic',
    'bit', 'byte', 'shortint', 'int', 'longint', 'real',
];

// 关键字 → SymbolKind 映射
const KIND_MAP: Record<string, vscode.CompletionItemKind> = {
    module  : vscode.CompletionItemKind.Class,
    port    : vscode.CompletionItemKind.Field,
    signal  : vscode.CompletionItemKind.Variable,
    param   : vscode.CompletionItemKind.Constant,
    define  : vscode.CompletionItemKind.Constant,
};

/**
 * @brief Verilog 代码补全 Provider
 */
export class VerilogCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private index: VerilogSymbolIndex) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const wordRange = document.getWordRangeAtPosition(position, /\w+/);
        const prefix    = wordRange ? document.getText(wordRange) : '';

        const items: vscode.CompletionItem[] = [];
        const seen  = new Set<string>();

        // ---- 关键字补全 ----//
        for (const kw of VERILOG_KEYWORDS) {
            if (prefix && !kw.startsWith(prefix)) { continue; }
            if (seen.has(kw)) { continue; }
            seen.add(kw);

            const item  = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
            item.detail = 'keyword';
            items.push(item);
        }

        // ---- 当前文件符号补全（优先） ----//
        const localSymbols = this.index.getFileSymbols(document.uri.fsPath);
        for (const sym of localSymbols) {
            if (prefix && !sym.name.startsWith(prefix)) { continue; }
            if (seen.has(`local:${sym.name}`)) { continue; }
            seen.add(`local:${sym.name}`);

            const kind = KIND_MAP[sym.kind] ?? vscode.CompletionItemKind.Variable;
            const item = new vscode.CompletionItem(sym.name, kind);
            item.detail      = sym.kind;
            item.documentation = new vscode.MarkdownString().appendCodeblock(sym.text.trim(), 'verilog');
            item.sortText    = `0_${sym.name}`; // 当前文件符号排在最前
            items.push(item);
        }

        // ---- 工作区模块名补全 ----//
        const allSymbols = this.index.getAllSymbols();
        for (const sym of allSymbols) {
            if (sym.kind !== 'module') { continue; }
            if (prefix && !sym.name.startsWith(prefix)) { continue; }
            const key = `module:${sym.name}`;
            if (seen.has(key)) { continue; }
            seen.add(key);

            const item       = new vscode.CompletionItem(sym.name, vscode.CompletionItemKind.Class);
            item.detail      = `module — ${sym.filePath.replace(/.*[\\/]/, '')}`;
            item.documentation = new vscode.MarkdownString().appendCodeblock(sym.text.trim(), 'verilog');
            item.sortText    = `1_${sym.name}`;
            items.push(item);
        }

        return items;
    }
}

/**
 * @brief 注册代码补全 Provider
 * @param context 扩展上下文
 * @param index   符号索引（与 symbolProvider 共享）
 */
export function registerCompletionProvider(
    context: vscode.ExtensionContext,
    index  : VerilogSymbolIndex,
): void {
    const SELECTOR = [
        { language: 'verilog'        },
        { language: 'systemverilog'  },
    ];
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            SELECTOR,
            new VerilogCompletionProvider(index),
            '.', '_',  // 额外触发字符
        ),
    );
}
