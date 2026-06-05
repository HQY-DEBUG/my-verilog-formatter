"use strict";
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
exports.VerilogCompletionProvider = void 0;
exports.registerCompletionProvider = registerCompletionProvider;
const vscode = __importStar(require("vscode"));
// ---- Verilog / SV 关键字列表 ----//
const VERILOG_KEYWORDS = [
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
const KIND_MAP = {
    module: vscode.CompletionItemKind.Class,
    port: vscode.CompletionItemKind.Field,
    signal: vscode.CompletionItemKind.Variable,
    param: vscode.CompletionItemKind.Constant,
    define: vscode.CompletionItemKind.Constant,
};
/**
 * @brief Verilog 代码补全 Provider
 */
class VerilogCompletionProvider {
    constructor(index) {
        this.index = index;
    }
    provideCompletionItems(document, position) {
        const wordRange = document.getWordRangeAtPosition(position, /\w+/);
        const prefix = wordRange ? document.getText(wordRange) : '';
        const items = [];
        const seen = new Set();
        // ---- 关键字补全 ----//
        for (const kw of VERILOG_KEYWORDS) {
            if (prefix && !kw.startsWith(prefix)) {
                continue;
            }
            if (seen.has(kw)) {
                continue;
            }
            seen.add(kw);
            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
            item.detail = 'keyword';
            items.push(item);
        }
        // ---- 当前文件符号补全（优先） ----//
        const localSymbols = this.index.getFileSymbols(document.uri.fsPath);
        for (const sym of localSymbols) {
            if (prefix && !sym.name.startsWith(prefix)) {
                continue;
            }
            if (seen.has(`local:${sym.name}`)) {
                continue;
            }
            seen.add(`local:${sym.name}`);
            const kind = KIND_MAP[sym.kind] ?? vscode.CompletionItemKind.Variable;
            const item = new vscode.CompletionItem(sym.name, kind);
            item.detail = sym.kind;
            item.documentation = new vscode.MarkdownString().appendCodeblock(sym.text.trim(), 'verilog');
            item.sortText = `0_${sym.name}`; // 当前文件符号排在最前
            items.push(item);
        }
        // ---- 工作区模块名补全 ----//
        const allSymbols = this.index.getAllSymbols();
        for (const sym of allSymbols) {
            if (sym.kind !== 'module') {
                continue;
            }
            if (prefix && !sym.name.startsWith(prefix)) {
                continue;
            }
            const key = `module:${sym.name}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const item = new vscode.CompletionItem(sym.name, vscode.CompletionItemKind.Class);
            item.detail = `module — ${sym.filePath.replace(/.*[\\/]/, '')}`;
            item.documentation = new vscode.MarkdownString().appendCodeblock(sym.text.trim(), 'verilog');
            item.sortText = `1_${sym.name}`;
            items.push(item);
        }
        return items;
    }
}
exports.VerilogCompletionProvider = VerilogCompletionProvider;
/**
 * @brief 注册代码补全 Provider
 * @param context 扩展上下文
 * @param index   符号索引（与 symbolProvider 共享）
 */
function registerCompletionProvider(context, index) {
    const SELECTOR = [
        { language: 'verilog' },
        { language: 'systemverilog' },
    ];
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(SELECTOR, new VerilogCompletionProvider(index), '.', '_'));
}
//# sourceMappingURL=completionProvider.js.map