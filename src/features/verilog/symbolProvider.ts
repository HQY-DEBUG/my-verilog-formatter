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
import * as path   from 'path';

// ---- 文件扫描辅助（替代 glob，避免外部依赖）----//
const VERILOG_EXTS_SET = new Set(['.v', '.vh', '.sv', '.svh']);

function walkFiles(dir: string, excludeDirs: Set<string>, result: string[] = []): string[] {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return result; }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!excludeDirs.has(entry.name)) {
                walkFiles(path.join(dir, entry.name), excludeDirs, result);
            }
        } else if (VERILOG_EXTS_SET.has(path.extname(entry.name).toLowerCase())) {
            result.push(path.join(dir, entry.name));
        }
    }
    return result;
}

// ---- 符号信息 ----//
interface SymbolInfo {
    name    : string;
    kind    : 'module' | 'port' | 'signal' | 'param' | 'define';
    filePath: string;
    line    : number;
    text    : string; // 原始行内容（用于悬停显示）
}

// ---- 信号名称提取辅助 ----//
// 从单行 reg/wire/logic/integer 声明中提取所有信号名
// 支持：多名称逗号分隔、带初值赋值、综合属性前缀
const RE_SIGNAL_LINE = /^\s*(?:\(\*[^*]*\*\)\s*)?(reg|wire|logic|integer)\b\s*(?:signed|unsigned)?\s*(?:\[[^\]]*\])?\s*(.+?)\s*;?\s*(?:\/\/.*)?$/;

function extractSignalNamesFromLine(line: string): string[] {
    const noComment = line.replace(/\/\/.*$/, '');
    const m = noComment.match(RE_SIGNAL_LINE);
    if (!m) { return []; }
    const namesPart = m[2];
    // 按逗号分割，去掉 = 后面的初值，提取标识符
    return namesPart.split(',')
        .map(part => {
            const stripped = part.replace(/\s*=\s*[^,;]+/, '').trim();
            const nm = stripped.match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/);
            return nm ? nm[1] : '';
        })
        .filter(n => n.length > 0 && !/^(reg|wire|logic|integer|signed|unsigned)$/.test(n));
}

// 从单行端口声明中提取所有端口名（支持多名称）
const RE_PORT_LINE = /^\s*(?:\(\*[^*]*\*\)\s*)?(input|output|inout)\b\s*(?:wire|reg|logic)?\s*(?:signed|unsigned)?\s*(?:\[[^\]]*\])?\s*(.+?)\s*[,;)]\s*(?:\/\/.*)?$/;

function extractPortNamesFromLine(line: string): string[] {
    const noComment = line.replace(/\/\/.*$/, '');
    const m = noComment.match(RE_PORT_LINE);
    if (!m) { return []; }
    return m[2].split(',')
        .map(p => p.trim().match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/)?.[ 1] ?? '')
        .filter(n => n.length > 0);
}

/**
 * @brief 从单个文件提取所有符号（正确处理多名称声明和带初值信号）
 */
function extractSymbols(filePath: string): SymbolInfo[] {
    let text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return []; }

    const lines   = text.split(/\r?\n/);
    const symbols : SymbolInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line    = lines[i];
        const trimmed = line.trimStart();

        // module 声明
        const modM = trimmed.match(/^module\s+(\w+)/);
        if (modM) {
            symbols.push({ name: modM[1], kind: 'module', filePath, line: i, text: line.trimEnd() });
            continue;
        }

        // `define
        const defM = trimmed.match(/^`define\s+(\w+)/);
        if (defM) {
            symbols.push({ name: defM[1], kind: 'define', filePath, line: i, text: line.trimEnd() });
            continue;
        }

        // parameter / localparam
        const paramM = trimmed.match(/^(?:parameter|localparam)\s+(?:\[[^\]]*\]\s*)?(\w+)\s*=/);
        if (paramM) {
            symbols.push({ name: paramM[1], kind: 'param', filePath, line: i, text: line.trimEnd() });
            continue;
        }

        // 端口声明（多名称）
        if (/^\s*(?:\(\*[^*]*\*\)\s*)?(?:input|output|inout)\b/.test(line)) {
            for (const name of extractPortNamesFromLine(line)) {
                symbols.push({ name, kind: 'port', filePath, line: i, text: line.trimEnd() });
            }
            continue;
        }

        // 信号声明（多名称，支持初值）
        if (/^\s*(?:\(\*[^*]*\*\)\s*)?(?:reg|wire|logic|integer)\b/.test(line)) {
            for (const name of extractSignalNamesFromLine(line)) {
                symbols.push({ name, kind: 'signal', filePath, line: i, text: line.trimEnd() });
            }
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
            const excludeSet = new Set(excludeFolders);
            const files = walkFiles(folder.uri.fsPath, excludeSet);
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

    // 返回指定文件的所有符号（供补全使用）
    getFileSymbols(filePath: string): SymbolInfo[] {
        return this.symbols.filter(s => s.filePath === filePath);
    }

    // 返回全部符号（供补全使用）
    getAllSymbols(): SymbolInfo[] {
        return this.symbols;
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

// ---- Document Symbol Provider（大纲面板）----//
export class VerilogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const lines  = document.getText().split(/\r?\n/);
        const result : vscode.DocumentSymbol[] = [];
        let   mod    : vscode.DocumentSymbol | null = null;

        // 关键字黑名单，避免将控制语句误识别为例化
        const KW = /^(always|initial|if|else|for|case|casez|casex|begin|end|assign|module|endmodule|parameter|localparam|reg|wire|logic|input|output|inout|integer|generate|endgenerate|task|function|endtask|endfunction)$/;

        for (let i = 0; i < lines.length; i++) {
            const line    = lines[i];
            const trimmed = line.trimStart();
            const range   = new vscode.Range(i, 0, i, line.length);

            // module 声明
            const modM = trimmed.match(/^module\s+(\w+)/);
            if (modM) {
                mod = new vscode.DocumentSymbol(modM[1], 'module', vscode.SymbolKind.Module, range, range);
                result.push(mod);
                continue;
            }

            // endmodule — 扩展 module 范围结束
            if (/^endmodule\b/.test(trimmed)) {
                if (mod) {
                    mod.range = new vscode.Range(mod.range.start, range.end);
                    mod = null;
                }
                continue;
            }

            if (!mod) { continue; }

            // parameter / localparam
            const paramM = trimmed.match(/^(?:localparam|parameter)\b\s*(?:\[[^\]]*\]\s*)?(\w+)\s*[=,]/);
            if (paramM) {
                mod.children.push(new vscode.DocumentSymbol(
                    paramM[1], 'parameter', vscode.SymbolKind.Constant, range, range,
                ));
                continue;
            }

            // 端口声明
            if (/^\s*(?:\(\*[^*]*\*\)\s*)?(?:input|output|inout)\b/.test(line)) {
                for (const name of extractPortNamesFromLine(line)) {
                    mod.children.push(new vscode.DocumentSymbol(
                        name, 'port', vscode.SymbolKind.Field, range, range,
                    ));
                }
                continue;
            }

            // 信号声明
            if (/^\s*(?:\(\*[^*]*\*\)\s*)?(?:reg|wire|logic|integer)\b/.test(line)) {
                for (const name of extractSignalNamesFromLine(line)) {
                    mod.children.push(new vscode.DocumentSymbol(
                        name, 'signal', vscode.SymbolKind.Variable, range, range,
                    ));
                }
                continue;
            }

            // 模块例化：ModuleName  u_inst_name  ( 或 ModuleName #( ...
            const instM = trimmed.match(/^(\w+)\s+(\w+)\s*[#(]/);
            if (instM && !KW.test(instM[1]) && !KW.test(instM[2])) {
                mod.children.push(new vscode.DocumentSymbol(
                    `${instM[2]}  (${instM[1]})`,
                    'instantiation',
                    vscode.SymbolKind.Object,
                    range, range,
                ));
            }
        }

        return result;
    }
}

// ---- 注册函数 ----//
const VERILOG_SELECTOR = [
    { language: 'verilog'       },
    { language: 'systemverilog' },
];

/**
 * @brief 注册语法跳转、悬停与大纲 Provider
 * @param context 扩展上下文
 * @return 符号索引实例（供其他 Provider 共享）
 */
export function registerSymbolProviders(context: vscode.ExtensionContext): VerilogSymbolIndex {
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
        vscode.languages.registerDocumentSymbolProvider(VERILOG_SELECTOR, new VerilogDocumentSymbolProvider()),
    );

    return index;
}
