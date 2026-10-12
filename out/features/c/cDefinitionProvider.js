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
exports.CDefinitionProvider = void 0;
exports.registerCFunctionNavigation = registerCFunctionNavigation;
// 为普通 C 函数提供独立于编译数据库的定义跳转，工作区文件按需读取并缓存。
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const cFunctionParser_1 = require("./cFunctionParser");
const SELECTOR = [
    { language: 'c', scheme: 'file' },
    { language: 'cpp', scheme: 'file', pattern: '**/*.{c,h}' },
];
const EXCLUDE = '**/{.git,.history,node_modules,out,dist,build}/**';
function isCFile(uri) { return /\.[ch]$/i.test(uri.path); }
class CDefinitionProvider {
    constructor() {
        this.cache = new Map();
    }
    async read(uri) {
        const opened = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
        if (opened) {
            const text = opened.getText();
            return { text, functions: (0, cFunctionParser_1.parseCFunctions)(text) };
        }
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            const stamp = `${stat.mtime}:${stat.size}`;
            const previous = this.cache.get(uri.toString());
            if (previous?.stamp === stamp) {
                return previous;
            }
            const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const entry = { stamp, text, functions: (0, cFunctionParser_1.parseCFunctions)(text) };
            // 缓存有界，避免长时间切换大型工程后持续持有全部源码。
            if (this.cache.size >= 512) {
                this.cache.delete(this.cache.keys().next().value);
            }
            this.cache.set(uri.toString(), entry);
            return entry;
        }
        catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                return undefined;
            }
            throw error;
        }
    }
    async locations(uri, name, allowStatic) {
        const entry = await this.read(uri);
        if (!entry) {
            return [];
        }
        return entry.functions.filter(fn => fn.name === name && (allowStatic || !fn.isStatic)).map(fn => {
            const before = entry.text.slice(0, fn.offset);
            const line = (before.match(/\n/g) ?? []).length;
            const column = fn.offset - before.lastIndexOf('\n') - 1;
            return new vscode.Location(uri, new vscode.Range(line, column, line, column + name.length));
        });
    }
    async provideDefinition(document, position, token) {
        if (!vscode.workspace.getConfiguration('verilogFormatter.c', document.uri).get('functionNavigation', true)
            || !isCFile(document.uri) || token.isCancellationRequested) {
            return [];
        }
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
        if (!range) {
            return [];
        }
        const name = document.getText(range);
        const source = (0, cFunctionParser_1.maskCSource)(document.getText());
        if (source.slice(document.offsetAt(range.start), document.offsetAt(range.end)) !== name) {
            return [];
        }
        // 当前编辑缓冲区优先，包括未保存的实现；不把头文件原型当作定义。
        const local = (0, cFunctionParser_1.parseCFunctions)(document.getText()).filter(fn => fn.name === name).map(fn => {
            const start = document.positionAt(fn.offset);
            return new vscode.Location(document.uri, new vscode.Range(start, new vscode.Position(start.line, start.character + name.length)));
        });
        if (local.length) {
            return local;
        }
        const seen = new Set([document.uri.toString()]);
        if (/\.h$/i.test(document.uri.path)) {
            const sibling = document.uri.with({ path: document.uri.path.replace(/\.h$/i, '.c') });
            seen.add(sibling.toString());
            const paired = await this.locations(sibling, name, false);
            if (token.isCancellationRequested) {
                return [];
            }
            if (paired.length) {
                return paired;
            }
        }
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!folder) {
            return [];
        }
        const excluded = ['files', 'search'].flatMap(section => Object.entries(vscode.workspace.getConfiguration(section, document.uri).get('exclude', {}))
            .filter(([, value]) => value === true).map(([pattern]) => pattern));
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.{c,h}'), excluded.length ? `{${[EXCLUDE, ...excluded].join(',')}}` : EXCLUDE, undefined, token);
        const opened = vscode.workspace.textDocuments.filter(doc => isCFile(doc.uri)
            && vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.toString() === folder.uri.toString()).map(doc => doc.uri);
        const candidates = [...opened, ...files].filter(uri => {
            if (seen.has(uri.toString())) {
                return false;
            }
            seen.add(uri.toString());
            return true;
        });
        const includedHeaders = new Set([...document.getText().matchAll(/^\s*#\s*include\s*"([^"\r\n]+)"/gm)]
            .map(match => vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), match[1])).toString()));
        const result = [];
        // 限制同时读取数量；只搜索所属工作区，避免多根工程中同名函数互相干扰。
        for (let i = 0; i < candidates.length; i += 16) {
            if (token.isCancellationRequested) {
                return [];
            }
            const batch = await Promise.all(candidates.slice(i, i + 16).map(uri => this.locations(uri, name, includedHeaders.has(uri.toString()))));
            result.push(...batch.flat());
        }
        return token.isCancellationRequested ? [] : result;
    }
}
exports.CDefinitionProvider = CDefinitionProvider;
function registerCFunctionNavigation(context) {
    const provider = new CDefinitionProvider();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(SELECTOR, provider), vscode.commands.registerCommand('verilogFormatter.c.goToFunction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isCFile(editor.document.uri)) {
            return;
        }
        const documentVersion = editor.document.version;
        const position = editor.selection.active;
        let cancelled = false;
        try {
            const targets = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window,
                title: '查找 C 函数实现', cancellable: true }, async (_progress, token) => {
                const found = await provider.provideDefinition(editor.document, position, token);
                cancelled = token.isCancellationRequested;
                return found;
            });
            if (cancelled || vscode.window.activeTextEditor !== editor || editor.document.version !== documentVersion
                || !editor.selection.active.isEqual(position)) {
                return;
            }
            if (!targets.length) {
                void vscode.window.showInformationMessage('未找到 C 函数实现，请确认源码位于当前工作区。');
                return;
            }
            let target = targets[0];
            if (targets.length > 1) {
                const item = await vscode.window.showQuickPick(targets.map(location => ({
                    label: path.basename(location.uri.fsPath),
                    description: `${vscode.workspace.asRelativePath(location.uri)}:${location.range.start.line + 1}`,
                    location,
                })), { placeHolder: '找到多个 C 函数实现，请选择目标' });
                if (!item) {
                    return;
                }
                target = item.location;
            }
            await vscode.window.showTextDocument(target.uri, { selection: target.range });
        }
        catch (error) {
            void vscode.window.showErrorMessage(`C 函数跳转失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }));
}
//# sourceMappingURL=cDefinitionProvider.js.map