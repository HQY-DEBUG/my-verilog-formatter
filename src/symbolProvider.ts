// =========================================================================
// 文件    : symbolProvider.ts
// 描述    : 工作区符号索引；DefinitionProvider + HoverProvider
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as glob   from 'glob';

// ---- 符号信息 ----//
interface SymbolInfo {
    name    : string;
    kind    : 'module' | 'port' | 'signal' | 'param' | 'define';
    filePath: string;
    line    : number;
    text    : string; // 原始行内容（用于悬停显示）
}

// ---- 解析规则 ----//
const PATTERNS: { re: RegExp; kind: SymbolInfo['kind'] }[] = [
    { re: /^\s*module\s+(\w+)/,                               kind: 'module' },
    { re: /^\s*(input|output|inout)\b.*\b(\w+)\s*[,;)]/,      kind: 'port'   },
    { re: /^\s*(reg|wire|logic|integer)\b.*\b(\w+)\s*[;=,]/,  kind: 'signal' },
    { re: /^\s*(parameter|localparam)\s+\b(\w+)\s*=/,         kind: 'param'  },
    { re: /^`define\s+(\w+)/,                                 kind: 'define' },
];

/**
 * @brief 从单个文件提取所有符号
 */
function extractSymbols(filePath: string): SymbolInfo[] {
    let text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return []; }

    const lines   = text.split(/\r?\n/);
    const symbols : SymbolInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const { re, kind } of PATTERNS) {
            const m = line.match(re);
            if (!m) { continue; }
            // m[1] 可能是关键字（module/input/...），m[2] 是名称；
            // 对于 module/define，m[1] 是名称
            const name = kind === 'module' || kind === 'define' ? m[1] : m[2] ?? m[1];
            if (!name) { continue; }
            symbols.push({ name, kind, filePath, line: i, text: line.trimEnd() });
            break; // 一行只匹配一条规则
        }
    }
    return symbols;
}

// ---- 符号索引 ----//
export class VerilogSymbolIndex {
    private symbols : SymbolInfo[] = [];
    private indexedAt: number = 0;

    constructor() { this.rebuild(); }

    rebuild(): void {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) { return; }
        const cfg            = vscode.workspace.getConfiguration('verilogFormatter');
        const excludeFolders : string[] = cfg.get('excludeFolders', ['ip', 'core', 'ipshared']);

        this.symbols = [];
        for (const folder of folders) {
            const files = glob.sync('**/*.{v,vh,sv,svh}', {
                cwd     : folder.uri.fsPath,
                ignore  : excludeFolders.map(f => `**/${f}/**`),
                absolute: true,
            });
            for (const f of files) {
                this.symbols.push(...extractSymbols(f));
            }
        }
        this.indexedAt = Date.now();
    }

    find(name: string): SymbolInfo[] {
        return this.symbols.filter(s => s.name === name);
    }

    findInFile(name: string, filePath: string): SymbolInfo[] {
        return this.symbols.filter(s => s.name === name && s.filePath === filePath);
    }

    updateFile(filePath: string): void {
        this.symbols = this.symbols.filter(s => s.filePath !== filePath);
        this.symbols.push(...extractSymbols(filePath));
    }
}

// ---- Definition Provider ----//
export class VerilogDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private index: VerilogSymbolIndex) {}

    provideDefinition(
        document : vscode.TextDocument,
        position : vscode.Position,
    ): vscode.Location[] {
        const wordRange = document.getWordRangeAtPosition(position, /\w+/);
        if (!wordRange) { return []; }
        const word = document.getText(wordRange);

        // 先在当前文件查找，再跨文件查找
        const localHits = this.index.findInFile(word, document.uri.fsPath);
        const hits      = localHits.length > 0 ? localHits : this.index.find(word);

        return hits.map(s => new vscode.Location(
            vscode.Uri.file(s.filePath),
            new vscode.Position(s.line, 0),
        ));
    }
}

// ---- Hover Provider ----//
export class VerilogHoverProvider implements vscode.HoverProvider {
    constructor(private index: VerilogSymbolIndex) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | null {
        const cfg = vscode.workspace.getConfiguration('verilogFormatter');
        if (!cfg.get<boolean>('hoverEnabled', true)) { return null; }

        const wordRange = document.getWordRangeAtPosition(position, /\w+/);
        if (!wordRange) { return null; }
        const word = document.getText(wordRange);

        const hits = this.index.find(word);
        if (hits.length === 0) { return null; }

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${word}** — ${hits[0].kind}\n\n`);
        md.appendCodeblock(hits[0].text.trim(), 'verilog');
        if (hits.length > 1) {
            md.appendMarkdown(`\n_共 ${hits.length} 处定义_`);
        }

        return new vscode.Hover(md, wordRange);
    }
}

// ---- 注册函数 ----//
const VERILOG_SELECTOR = [
    { language: 'verilog'       },
    { language: 'systemverilog' },
];

/**
 * @brief 注册语法跳转与悬停 Provider
 * @param context 扩展上下文
 */
export function registerSymbolProviders(context: vscode.ExtensionContext): void {
    const index = new VerilogSymbolIndex();

    // 文件保存时增量更新索引
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'verilog' || doc.languageId === 'systemverilog') {
                index.updateFile(doc.uri.fsPath);
            }
        }),
    );

    // 工作区变化时重建索引
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => index.rebuild()),
    );

    // 手动重建索引命令
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.rebuildIndex', () => {
            index.rebuild();
            vscode.window.showInformationMessage('符号索引已重建');
        }),
    );

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(VERILOG_SELECTOR, new VerilogDefinitionProvider(index)),
        vscode.languages.registerHoverProvider(VERILOG_SELECTOR, new VerilogHoverProvider(index)),
    );
}
