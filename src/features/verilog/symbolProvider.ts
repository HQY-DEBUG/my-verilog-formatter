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

// 始终排除的目录（版本控制、历史备份、构建产物等）
const ALWAYS_EXCLUDE_DIRS = new Set([
    '.history', '.git', '.svn', '.hg',
    'node_modules', '.vscode', '.vscode-test',
    'out', 'dist', '.qoder', '.idea',
]);

function walkFiles(dir: string, excludeDirs: Set<string>, result: string[] = []): string[] {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return result; }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!excludeDirs.has(entry.name) && !ALWAYS_EXCLUDE_DIRS.has(entry.name)) {
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

// 从单行端口声明中提取所有端口名（支持多名称及下一行闭合的末端口）
const RE_PORT_LINE = /^\s*(?:\(\*[^*]*\*\)\s*)?(input|output|inout)\b\s*(?:wire|reg|logic)?\s*(?:signed|unsigned)?\s*(?:\[[^\]]*\])?\s*(.+?)\s*(?:[,;)]\s*)?$/;

function extractPortNamesFromLine(line: string): string[] {
    const noComment = line.replace(/\/\/.*$/, '');
    const m = noComment.match(RE_PORT_LINE);
    if (!m) { return []; }
    return m[2].split(',')
        .map(p => p.trim().match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/)?.[ 1] ?? '')
        .filter(n => n.length > 0);
}

/**
 * @brief 从文本内容提取所有符号（支持从内存缓冲区或磁盘文件）
 */
function extractSymbolsFromText(filePath: string, text: string): SymbolInfo[] {
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

/**
 * @brief 从磁盘文件读取并提取符号
 */
function extractSymbols(filePath: string): SymbolInfo[] {
    let text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
    return extractSymbolsFromText(filePath, text);
}

/**
 * @brief 从当前编辑器缓冲区查找符号
 * @details 跳转和悬停必须直接读取当前文档，避免文件位于索引范围外或索引尚未刷新时误用其他文件的同名符号。
 */
function findSymbolsInDocument(document: vscode.TextDocument, name: string): SymbolInfo[] {
    return extractSymbolsFromText(document.uri.fsPath, document.getText())
        .filter(symbol => symbol.name === name);
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

    /** 从内存文本更新指定文件的符号（避免磁盘读取时序问题）*/
    updateFileFromText(filePath: string, text: string): void {
        this.symbols = this.symbols.filter(s => s.filePath !== filePath);
        this.symbols.push(...extractSymbolsFromText(filePath, text));
    }

    // 返回指定文件的所有符号（供补全使用）
    getFileSymbols(filePath: string): SymbolInfo[] {
        return this.symbols.filter(s => s.filePath === filePath);
    }

    // 返回全部符号（供补全使用）
    getAllSymbols(): SymbolInfo[] {
        return this.symbols;
    }

    getIndexedAt(): number {
        return this.indexedAt;
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

        // 当前编辑器缓冲区优先，未找到时才跨文件查询索引
        const localHits = findSymbolsInDocument(document, word);
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

        // 当前编辑器缓冲区优先，避免显示其他文件的同名定义
        const localHits = findSymbolsInDocument(document, word);
        const allHits   = this.index.find(word);
        if (localHits.length === 0 && allHits.length === 0) { return null; }

        // 当前文件优先，再补充其他文件
        const hits = localHits.length > 0 ? localHits : allHits;

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${word}** — ${hits[0].kind}\n\n`);
        md.appendCodeblock(hits[0].text.trim(), 'verilog');

        if (hits.length > 1) {
            // 显示最多 5 个不同文件的定义
            const shown = new Set<string>();
            shown.add(hits[0].text.trim());
            let extra = 0;
            for (let i = 1; i < hits.length && extra < 4; i++) {
                const t = hits[i].text.trim();
                if (shown.has(t)) { continue; }
                shown.add(t);
                const fname = hits[i].filePath.replace(/.*[\\/]/, '');
                md.appendMarkdown(`\n\n---\n`);
                md.appendMarkdown(`_📄 ${fname}:${hits[i].line + 1}_\n`);
                md.appendCodeblock(t, 'verilog');
                extra++;
            }
            if (allHits.length > 1) {
                md.appendMarkdown(`\n_共 ${allHits.length} 处定义（${localHits.length} 处在当前文件）_`);
            }
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
        let   pendingInst: { typeName: string; range: vscode.Range } | null = null;

        // 关键字黑名单，避免将控制语句误识别为例化
        const KW = /^(always|initial|if|else|for|case|casez|casex|begin|end|assign|module|endmodule|parameter|localparam|reg|wire|logic|input|output|inout|integer|generate|endgenerate|task|function|endtask|endfunction)$/;

        for (let i = 0; i < lines.length; i++) {
            const line    = lines[i];
            const code    = line.replace(/\/\/.*$/, '');
            const trimmed = code.trimStart();
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
                mod = null;
                continue;
            }

            if (!mod) { continue; }

            if (pendingInst) {
                const pendingM = trimmed.match(/^\)\s*(\w+)\s*\(/);
                if (pendingM && !KW.test(pendingM[1])) {
                    const fullRange = new vscode.Range(pendingInst.range.start, range.end);
                    mod.children.push(new vscode.DocumentSymbol(
                        `${pendingM[1]}  (${pendingInst.typeName})`,
                        'instantiation',
                        vscode.SymbolKind.Object,
                        fullRange, range,
                    ));
                    pendingInst = null;
                    continue;
                }
                if (/;\s*$/.test(trimmed)) {
                    pendingInst = null;
                }
            }

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
                continue;
            }

            // 参数化模块例化允许参数列表换行：ModuleName #( ... ) u_inst (
            const paramInstM = trimmed.match(/^(\w+)\s*#\s*\(/);
            if (paramInstM && !KW.test(paramInstM[1])) {
                const sameLineM = trimmed.match(/^(\w+)\s*#\s*\(.*\)\s*(\w+)\s*\(/);
                if (sameLineM && !KW.test(sameLineM[2])) {
                    mod.children.push(new vscode.DocumentSymbol(
                        `${sameLineM[2]}  (${sameLineM[1]})`,
                        'instantiation',
                        vscode.SymbolKind.Object,
                        range, range,
                    ));
                } else {
                    pendingInst = { typeName: paramInstM[1], range };
                }
            }
        }

        return result;
    }
}

// ---- 注册函数 ----//
const VERILOG_LANG_IDS = ['verilog', 'systemverilog', 'verilog-hdl', 'systemverilog-hdl'];
const VERILOG_FILE_EXTS = new Set(['.v', '.vh', '.sv', '.svh']);
const VERILOG_SELECTOR: vscode.DocumentFilter[] = [
    { language: 'verilog'          },
    { language: 'systemverilog'    },
    { language: 'verilog-hdl'      },
    { language: 'systemverilog-hdl'},
    { scheme: 'file', pattern: '**/*.v'   },
    { scheme: 'file', pattern: '**/*.vh'  },
    { scheme: 'file', pattern: '**/*.sv'  },
    { scheme: 'file', pattern: '**/*.svh' },
];

const VERILOG_LANGS = new Set(VERILOG_LANG_IDS);

function isVerilogDocument(doc: vscode.TextDocument): boolean {
    if (VERILOG_LANGS.has(doc.languageId)) { return true; }
    if (doc.uri.scheme !== 'file') { return false; }
    return VERILOG_FILE_EXTS.has(path.extname(doc.uri.fsPath).toLowerCase());
}

/**
 * @brief 注册语法跳转、悬停与大纲 Provider
 * @param context 扩展上下文
 * @return 符号索引实例（供其他 Provider 共享）
 */
export function registerSymbolProviders(context: vscode.ExtensionContext): VerilogSymbolIndex {
    const index = new VerilogSymbolIndex();

    // 文件保存时增量更新索引（使用内存文本，避免磁盘读取时序问题）
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.uri.scheme !== 'file') { return; }
            if (isVerilogDocument(doc)) {
                index.updateFileFromText(doc.uri.fsPath, doc.getText());
            }
        }),
    );

    // 编辑时防抖更新索引（实时跟踪变化）
    const debounceTimers = new Map<string, NodeJS.Timeout>();
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const doc = event.document;
            if (doc.uri.scheme !== 'file') { return; }
            if (!isVerilogDocument(doc)) { return; }
            const fsPath = doc.uri.fsPath;
            if (!fsPath) { return; }
            const existing = debounceTimers.get(fsPath);
            if (existing) { clearTimeout(existing); }
            debounceTimers.set(fsPath, setTimeout(() => {
                index.updateFileFromText(fsPath, doc.getText());
                debounceTimers.delete(fsPath);
            }, 500)); // 500ms 防抖
        }),
    );

    // 文件打开时立即索引（确保新打开的文件符号可用）
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.uri.scheme !== 'file') { return; }
            if (isVerilogDocument(doc)) {
                index.updateFileFromText(doc.uri.fsPath, doc.getText());
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

    // 诊断索引状态命令
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.diagnoseIndex', () => {
            const all = index.getAllSymbols();
            const fileCounts = new Map<string, number>();
            for (const s of all) {
                fileCounts.set(s.filePath, (fileCounts.get(s.filePath) ?? 0) + 1);
            }
            const totalFiles = fileCounts.size;
            const topFiles = [...fileCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([f, c]) => `  ${c} symbols: ${f.replace(/.*[\\/]/, '')}`)
                .join('\n');
            const paramCount = all.filter(s => s.kind === 'param').length;
            const msg = [
                `索引符号总数: ${all.length}`,
                `索引文件数: ${totalFiles}`,
                `参数符号数: ${paramCount}`,
                `索引时间: ${new Date(index.getIndexedAt()).toLocaleString()}`,
                `\n符号最多的文件:\n${topFiles}`,
            ].join('\n');
            vscode.window.showInformationMessage(msg, { modal: true });
        }),
    );

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(VERILOG_SELECTOR, new VerilogDefinitionProvider(index)),
        vscode.languages.registerHoverProvider(VERILOG_SELECTOR, new VerilogHoverProvider(index)),
        vscode.languages.registerDocumentSymbolProvider(VERILOG_SELECTOR, new VerilogDocumentSymbolProvider()),
    );

    return index;
}
