// 优先查找普通 C 函数实现，F4 在未找到实现时使用语言服务提供的其他定义。
import * as vscode from 'vscode';
import * as path from 'path';
import { CFunction, maskCSource, parseCFunctions } from './cFunctionParser';

const SELECTOR: vscode.DocumentSelector = [
    { language: 'c', scheme: 'file' },
    { language: 'cpp', scheme: 'file', pattern: '**/*.{c,h}' },
];
const EXCLUDE = '**/{.git,.history,node_modules,out,dist,build}/**';

function isCFile(uri: vscode.Uri): boolean { return /\.[ch]$/i.test(uri.path); }

export class CDefinitionProvider implements vscode.DefinitionProvider {
    private cache = new Map<string, { stamp: string; text: string; functions: CFunction[] }>();

    private async read(uri: vscode.Uri): Promise<{ text: string; functions: CFunction[] } | undefined> {
        const opened = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
        if (opened) {
            const text = opened.getText();
            return { text, functions: parseCFunctions(text) };
        }
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            const stamp = `${stat.mtime}:${stat.size}`;
            const previous = this.cache.get(uri.toString());
            if (previous?.stamp === stamp) { return previous; }
            const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const entry = { stamp, text, functions: parseCFunctions(text) };
            // 缓存有界，避免长时间切换大型工程后持续持有全部源码。
            if (this.cache.size >= 512) { this.cache.delete(this.cache.keys().next().value!); }
            this.cache.set(uri.toString(), entry);
            return entry;
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') { return undefined; }
            throw error;
        }
    }

    private async locations(uri: vscode.Uri, name: string, allowStatic: boolean): Promise<vscode.Location[]> {
        const entry = await this.read(uri);
        if (!entry) { return []; }
        return entry.functions.filter(fn => fn.name === name && (allowStatic || !fn.isStatic)).map(fn => {
            const before = entry.text.slice(0, fn.offset);
            const line = (before.match(/\n/g) ?? []).length;
            const column = fn.offset - before.lastIndexOf('\n') - 1;
            return new vscode.Location(uri, new vscode.Range(line, column, line, column + name.length));
        });
    }

    async provideDefinition(document: vscode.TextDocument, position: vscode.Position,
        token: vscode.CancellationToken): Promise<vscode.Location[]> {
        if (!vscode.workspace.getConfiguration('verilogFormatter.c', document.uri).get('functionNavigation', true)
            || !isCFile(document.uri) || token.isCancellationRequested) { return []; }
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
        if (!range) { return []; }
        const name = document.getText(range);
        const source = maskCSource(document.getText());
        const nameStart = document.offsetAt(range.start);
        const nameEnd = document.offsetAt(range.end);
        if (source.slice(nameStart, nameEnd) !== name || !/^\s*\(/.test(source.slice(nameEnd))) { return []; }
        const prefix = source.slice(0, nameStart);
        const statementStart = Math.max(prefix.lastIndexOf(';'), prefix.lastIndexOf('{'), prefix.lastIndexOf('}')) + 1;
        // 只独立查找普通函数调用或声明；类型、变量及成员语义交给语言服务。
        if (/(?:\.|->|::)\s*$/.test(prefix) || /\btypedef\b/.test(prefix.slice(statementStart))) { return []; }
        // 当前编辑缓冲区优先，包括未保存的实现；不把头文件原型当作定义。
        const local = parseCFunctions(document.getText()).filter(fn => fn.name === name).map(fn => {
            const start = document.positionAt(fn.offset);
            return new vscode.Location(document.uri, new vscode.Range(start,
                new vscode.Position(start.line, start.character + name.length)));
        });
        if (local.length) { return local; }

        const seen = new Set([document.uri.toString()]);
        if (/\.h$/i.test(document.uri.path)) {
            const sibling = document.uri.with({ path: document.uri.path.replace(/\.h$/i, '.c') });
            seen.add(sibling.toString());
            const paired = await this.locations(sibling, name, false);
            if (token.isCancellationRequested) { return []; }
            if (paired.length) { return paired; }
        }

        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!folder) { return []; }
        const excluded = ['files', 'search'].flatMap(section => Object.entries(
            vscode.workspace.getConfiguration(section, document.uri).get<Record<string, unknown>>('exclude', {}))
            .filter(([, value]) => value === true).map(([pattern]) => pattern));
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.{c,h}'),
            excluded.length ? `{${[EXCLUDE, ...excluded].join(',')}}` : EXCLUDE, undefined, token);
        const opened = vscode.workspace.textDocuments.filter(doc => isCFile(doc.uri)
            && vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.toString() === folder.uri.toString()).map(doc => doc.uri);
        const candidates = [...opened, ...files].filter(uri => {
            if (seen.has(uri.toString())) { return false; }
            seen.add(uri.toString()); return true;
        });
        const includedHeaders = new Set([...document.getText().matchAll(/^\s*#\s*include\s*"([^"\r\n]+)"/gm)]
            .map(match => vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), match[1])).toString()));
        const result: vscode.Location[] = [];
        // 限制同时读取数量；只搜索所属工作区，避免多根工程中同名函数互相干扰。
        for (let i = 0; i < candidates.length; i += 16) {
            if (token.isCancellationRequested) { return []; }
            const batch = await Promise.all(candidates.slice(i, i + 16).map(uri =>
                this.locations(uri, name, includedHeaders.has(uri.toString()))));
            result.push(...batch.flat());
        }
        return token.isCancellationRequested ? [] : result;
    }
}

export function registerCFunctionNavigation(context: vscode.ExtensionContext): void {
    const provider = new CDefinitionProvider();
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(SELECTOR, provider),
        vscode.commands.registerCommand('verilogFormatter.c.goToFunction', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !['c', 'cpp'].includes(editor.document.languageId)) { return; }
            const document = editor.document;
            const documentVersion = document.version;
            const position = editor.selection.active;
            let requestToken: vscode.CancellationToken | undefined;
            const isCurrent = () => !requestToken?.isCancellationRequested
                && vscode.window.activeTextEditor === editor && editor.document === document
                && document.version === documentVersion && editor.selection.active.isEqual(position);
            try {
                const targets = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window,
                    title: '查找 C/C++ 定义', cancellable: true }, async (_progress, token) => {
                    requestToken = token;
                    const found = await provider.provideDefinition(document, position, token);
                    if (!isCurrent() || found.length) { return found; }
                    // 定义提供者不会调用 F4 命令；保留函数实现优先，并补充类型等语义定义。
                    const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
                        'vscode.executeDefinitionProvider', document.uri, position);
                    return (definitions ?? []).map(definition => 'targetUri' in definition
                        ? new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange)
                        : definition);
                });
                if (!isCurrent()) { return; }
                if (!targets.length) {
                    void vscode.window.showInformationMessage('未找到 C/C++ 定义，请确认源码位于当前工作区且语言服务已就绪。');
                    return;
                }
                let target = targets[0];
                if (targets.length > 1) {
                    const item = await vscode.window.showQuickPick(targets.map(location => ({
                        label: path.basename(location.uri.fsPath),
                        description: `${vscode.workspace.asRelativePath(location.uri)}:${location.range.start.line + 1}`,
                        location,
                    })), { placeHolder: '找到多个 C/C++ 定义，请选择目标' });
                    if (!item || !isCurrent()) { return; }
                    target = item.location;
                }
                await vscode.window.showTextDocument(target.uri, { selection: target.range });
            } catch (error) {
                void vscode.window.showErrorMessage(`C/C++ 定义跳转失败：${error instanceof Error ? error.message : String(error)}`);
            }
        }),
    );
}
