// 文件：tclIntegration.test.ts；描述：Tcl 内置导航、资源及共存回归。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 覆盖大纲、定义、悬停、折叠和原扩展复用。
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { activateTcl, deactivateTcl } from '../src/features/tcl/tclIntegration';

// 2026/09/21 新增：模拟 VS Code 文档坐标，保留 DocumentSymbol 选区范围检查。
jest.mock('vscode', () => {
    const original = jest.requireActual('vscode');
    const register = () => jest.fn(() => ({ dispose: jest.fn() }));
    return {
        ...original,
        Position: class extends original.Position {
            isBefore(other: any) { return this.line < other.line || this.line === other.line && this.character < other.character; }
            isAfter(other: any) { return this.line > other.line || this.line === other.line && this.character > other.character; }
        },
        Range: class extends original.Range {
            contains(pos: any) { return !pos.isBefore(this.start) && !pos.isAfter(this.end); }
        },
        MarkdownString: class extends original.MarkdownString { constructor(value = '') { super(); this.value = value; } },
        FoldingRange: class { constructor(public start: number, public end: number) {} },
        SymbolKind: { ...original.SymbolKind, Namespace: 3, Function: 12, Array: 18 },
        languages: {
            registerDocumentSymbolProvider: register(), registerDefinitionProvider: register(),
            registerFoldingRangeProvider: register(), registerHoverProvider: register(), setLanguageConfiguration: register(),
        },
        workspace: { ...original.workspace, findFiles: jest.fn().mockResolvedValue([]), openTextDocument: jest.fn() },
        extensions: { getExtension: jest.fn() },
        window: { showInformationMessage: jest.fn(), showErrorMessage: jest.fn() },
    };
});

const api = vscode as any;
const root = path.resolve(__dirname, '..');
const runtime = require('../out/tcl-navigate/extension.js');
const context = () => ({ subscriptions: [], asAbsolutePath: (relative: string) => path.join(root, relative) } as unknown as vscode.ExtensionContext);
const token = { isCancellationRequested: false };

function document(text: string, name = 'test.tcl'): any {
    const starts = [0];
    for (let i = 0; i < text.length; i++) { if (text[i] === '\n') starts.push(i + 1); }
    const positionAt = (input: number) => {
        const offset = Math.max(0, Math.min(input, text.length));
        const line = starts.filter(start => start <= offset).length - 1;
        return new vscode.Position(line, offset - starts[line]);
    };
    const offsetAt = (pos: any) => starts[pos.line] + pos.character;
    const doc = {
        uri: vscode.Uri.file(name), languageId: 'tcl', positionAt, offsetAt,
        getText: (range?: any) => range ? text.slice(offsetAt(range.start), offsetAt(range.end)) : text,
        lineAt: (line: number) => {
            const value = text.slice(starts[line], starts[line + 1] === undefined ? text.length : starts[line + 1] - 1).replace(/\r$/, '');
            return { text: value, range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, value.length)) };
        },
        getWordRangeAtPosition: (pos: any, pattern: RegExp) => {
            for (const match of doc.lineAt(pos.line).text.matchAll(new RegExp(pattern.source, 'g'))) {
                if (match.index! <= pos.character && pos.character <= match.index! + match[0].length) {
                    return new vscode.Range(new vscode.Position(pos.line, match.index!), new vscode.Position(pos.line, match.index! + match[0].length));
                }
            }
            return undefined;
        },
    };
    return doc;
}

// 2026/09/21 新增：从真实构建组件捕获 Provider，避免测试复制实现。
describe('Tcl 内置 Provider', () => {
    let host: vscode.ExtensionContext;
    const provider = (name: string) => api.languages[name].mock.calls.at(-1)[1];
    beforeEach(() => {
        host = context(); runtime.activate(host);
        api.workspace.findFiles.mockReset().mockResolvedValue([]);
        api.workspace.openTextDocument.mockReset();
    });
    afterEach(() => host.subscriptions.forEach(item => item.dispose()));

    it('注册全部四种 Provider，语言配置可释放且不弹启动通知', () => {
        expect(host.subscriptions).toHaveLength(5);
        for (const name of ['registerDocumentSymbolProvider', 'registerDefinitionProvider', 'registerFoldingRangeProvider', 'registerHoverProvider']) {
            expect(api.languages[name]).toHaveBeenLastCalledWith({ language: 'tcl' }, expect.anything());
        }
        expect(api.window.showInformationMessage).not.toHaveBeenCalled();
    });
    it.each(['\n', '\r\n'])('大纲包含命名空间、过程和变量，并提供粘性滚动所需层级（%j）', newline => {
        const doc = document(['set ::global_value 7', 'namespace eval Tools {', '    variable count 2', '    proc calc {x} {', '        set local_value 3', '        return $local_value', '    }', '}', 'proc run {} {', '    array set data {x 1}', '}', 'run'].join(newline));
        const symbols = provider('registerDocumentSymbolProvider').provideDocumentSymbols(doc, token);
        expect(symbols.map((s: any) => s.name)).toEqual(expect.arrayContaining(['Tools', 'run', 'global_value']));
        const ns = symbols.find((s: any) => s.name === 'Tools');
        expect(ns.children.map((s: any) => s.name)).toEqual(expect.arrayContaining(['count', 'calc']));
        expect(ns.children.find((s: any) => s.name === 'calc').children[0].name).toBe('local_value');
        expect(symbols.find((s: any) => s.name === 'run').children.some((s: any) => s.name === 'data')).toBe(true);
    });
    it('单行过程后存在其他命令时选区不越界', () => {
        const doc = document('proc run {} { return 1 }; run');
        expect(() => provider('registerDocumentSymbolProvider').provideDocumentSymbols(doc, token)).not.toThrow();
    });
    it('当前未保存文档的定义优先，不搜索同名外部过程', async () => {
        const doc = document('proc run {} { return 1 }\nrun');
        const result = await provider('registerDefinitionProvider').provideDefinition(doc, new vscode.Position(1, 1), token);
        expect(result.uri).toBe(doc.uri);
        expect(result.range.start.line).toBe(0);
        expect(api.workspace.findFiles).not.toHaveBeenCalled();
    });
    it('跨文件搜索保留命名空间，未找到符号时不递归循环', async () => {
        const doc = document('Tools::calc 3');
        const other = document('namespace eval Tools {\n    proc calc {x} { return $x }\n}', 'library.tcl');
        api.workspace.findFiles.mockResolvedValue([other.uri]);
        api.workspace.openTextDocument.mockResolvedValue(other);
        const def = provider('registerDefinitionProvider');
        const result = await def.provideDefinition(doc, new vscode.Position(0, 9), token);
        expect(result.uri).toBe(other.uri);
        expect(result.range.start.line).toBe(1);
        expect(await def.provideDefinition(document('Tools::missing'), new vscode.Position(0, 9), token)).toBeNull();
        expect(api.workspace.findFiles).toHaveBeenCalledTimes(2);
    });
    it('局部变量、全局变量以及命名空间内定义可跳转', async () => {
        const doc = document('set ::value 7\nproc run {} {\n    set value 2\n    puts $value\n}\nputs $::value');
        const def = provider('registerDefinitionProvider');
        expect((await def.provideDefinition(doc, new vscode.Position(3, 12), token)).range.start.line).toBe(2);
        expect((await def.provideDefinition(doc, new vscode.Position(5, 10), token)).range.start.line).toBe(0);
    });
    it('悬停展示过程参数、首行说明和变量值', async () => {
        const doc = document('# 过程说明\nproc run {x} {\n    set value 2\n    puts $value\n}\nrun 1');
        const hover = provider('registerHoverProvider');
        const proc = await hover.provideHover(doc, new vscode.Position(5, 1), token);
        expect(proc.contents.map((item: any) => item.value).join('\n')).toContain('过程说明');
        expect(proc.contents.map((item: any) => item.value).join('\n')).toContain('x');
        const variable = await hover.provideHover(doc, new vscode.Position(3, 12), token);
        expect(variable.contents.map((item: any) => item.value).join('\n')).toContain('2');
    });
    it('折叠覆盖过程与控制块，转义花括号不截断范围', () => {
        const doc = document('proc run {} {\n    puts \\}\n    if {1} {\n        puts ok\n    }\n}');
        const folds = provider('registerFoldingRangeProvider').provideFoldingRanges(doc, {}, token);
        expect(folds).toEqual(expect.arrayContaining([expect.objectContaining({ start: 0, end: 5 }), expect.objectContaining({ start: 2, end: 4 })]));
    });
});

// 2026/09/21 新增：验证构建产物和原扩展共存边界。
describe('Tcl 宿主集成', () => {
    afterEach(() => { deactivateTcl(); api.extensions.getExtension.mockReset(); });
    it('包含运行时与 MIT 许可，沿用已声明的 Tcl 激活事件和语法', () => {
        expect(fs.existsSync(path.join(root, 'out/tcl-navigate/extension.js'))).toBe(true);
        expect(fs.readFileSync(path.join(root, 'out/tcl-navigate/LICENSE'), 'utf8')).toContain('Copyright (c) 2025 lukemt');
        const manifest = require('../package.json');
        expect(manifest.activationEvents).toContain('onLanguage:tcl');
        expect(manifest.contributes.grammars.some((g: any) => g.language === 'tcl')).toBe(true);
    });
    it('启用原扩展时复用，避免重复注册', async () => {
        const original = { activate: jest.fn().mockResolvedValue(undefined) };
        api.extensions.getExtension.mockReturnValue(original);
        const host = context();
        await activateTcl(host);
        expect(original.activate).toHaveBeenCalledTimes(1);
        expect(host.subscriptions).toHaveLength(0);
    });
    it('无原扩展时启动内置运行时并托管其资源', async () => {
        const host = context();
        await activateTcl(host);
        expect(host.subscriptions).toHaveLength(5);
        host.subscriptions.forEach(item => item.dispose());
    });
});
