// 文件：indentRainbow.test.ts；描述：执行彩虹缩进真实运行时，验证绘制、配置和生命周期。
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import * as vscode from 'vscode';

const source = fs.readFileSync(path.join(__dirname, '../vendor/indent-rainbow/src/extension.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const defaults = Object.fromEntries(Object.entries(require('../vendor/indent-rainbow/package.json').contributes.configuration.properties)
    .map(([key, item]: [string, any]) => [key.replace('indentRainbow.', ''), item.default]));

describe('彩虹缩进运行时', () => {
    let config: any, api: any, host: any, runtime: any;
    let events: Record<string, Function[]>;
    let types: any[];
    function on(name: string) {
        return (callback: Function, _this?: unknown, subscriptions?: any[]) => {
            (events[name] ||= []).push(callback);
            const disposable = { dispose: () => { events[name] = events[name].filter(item => item !== callback); } };
            subscriptions?.push(disposable);
            return disposable;
        };
    }
    function editor(text: string, languageId = 'verilog', tabSize = 2): any {
        const lines = text.split('\n');
        return {
            options: { tabSize },
            document: {
                languageId, getText: () => text,
                positionAt: (offset: number) => {
                    const before = text.slice(0, Math.min(offset, text.length)).split('\n');
                    return new vscode.Position(before.length - 1, before[before.length - 1].length);
                },
                lineAt: (position: any) => {
                    const lineNumber = typeof position === 'number' ? position : position.line;
                    return { lineNumber, text: lines[lineNumber] };
                },
            },
            decorations: new Map(),
            setDecorations(type: any, ranges: any[]) { this.decorations.set(type, ranges); },
        };
    }
    function ranges(ed: any, options: any): number[][] {
        const type = [...ed.decorations.keys()].reverse().find((item: any) =>
            Object.entries(options).every(([key, value]) => item.options[key] === value));
        return (ed.decorations.get(type) || []).map((item: any) => {
            const range = item.range || item;
            return [range.start.line, range.start.character, range.end.line, range.end.character];
        });
    }
    function start(...editors: any[]) {
        api.window.activeTextEditor = editors[0];
        api.window.visibleTextEditors = editors;
        runtime.activate(host);
        jest.runOnlyPendingTimers();
    }
    function fire(name: string, event: any) {
        for (const callback of [...events[name] || []]) { callback(event); }
        jest.runOnlyPendingTimers();
    }
    beforeEach(() => {
        jest.useFakeTimers();
        config = structuredClone(defaults); events = {}; types = [];
        host = { subscriptions: [] };
        api = {
            ...vscode,
            Disposable: class { constructor(public dispose: () => void) {} },
            workspace: {
                getConfiguration: () => Object.assign({ get: (key: string, fallback: any) => config[key] ?? fallback }, config),
                onDidChangeTextDocument: on('text'), onDidChangeConfiguration: on('config'),
            },
            window: {
                visibleTextEditors: [], activeTextEditor: undefined,
                onDidChangeActiveTextEditor: on('active'), onDidChangeVisibleTextEditors: on('visible'),
                onDidChangeTextEditorOptions: on('options'),
                createTextEditorDecorationType: (options: any) => {
                    const type = { options, dispose: jest.fn() }; types.push(type); return type;
                },
                showWarningMessage: jest.fn(), showInformationMessage: jest.fn().mockResolvedValue(undefined),
            },
        };
        const module = { exports: {} };
        vm.runInNewContext(compiled, { module, exports: module.exports, require: () => api, setTimeout, clearTimeout, console });
        runtime = module.exports;
    });
    afterEach(() => {
        runtime.deactivate?.();
        host.subscriptions.forEach((item: any) => item.dispose());
        jest.clearAllTimers(); jest.useRealTimers();
    });
    it('按照 tabSize 循环绘制每层空格，兼容 CRLF 和 Tab', () => {
        const ed = editor('  a\r\n    b\r\n\tc\r\n          d');
        start(ed);
        expect(ranges(ed, { backgroundColor: config.colors[0] })).toEqual([
            [0, 0, 0, 2], [1, 0, 1, 2], [2, 0, 2, 1], [3, 0, 3, 2], [3, 8, 3, 10],
        ]);
        expect(ranges(ed, { backgroundColor: config.colors[1] })).toEqual([[1, 2, 1, 4], [3, 2, 3, 4]]);
    });
    it('不完整缩进标记为错误，完整但混用的缩进单独标记', () => {
        start();
        const ed = editor('   a\n\t  b');
        api.window.visibleTextEditors = [ed]; api.window.activeTextEditor = ed;
        fire('active', ed);
        expect(ranges(ed, { backgroundColor: config.errorColor })).toEqual([[0, 0, 0, 3]]);
        expect(ranges(ed, { backgroundColor: config.tabmixColor })).toEqual([[1, 0, 1, 1], [1, 1, 1, 3]]);
    });
    it('首次打开 Markdown 时即跳过错误，仅在需要时绘制空白', () => {
        config.colorOnWhiteSpaceOnly = true;
        const ed = editor('   text', 'markdown'); start(ed);
        expect(ranges(ed, { backgroundColor: config.errorColor })).toEqual([]);
        expect(ranges(ed, { backgroundColor: config.colors[1] })).toEqual([[0, 2, 0, 3]]);
    });
    it('保留上游未限制空白时补足整级范围的行为', () => {
        config.ignoreErrorLanguages = ['*'];
        const ed = editor('   text'); start(ed);
        expect(ranges(ed, { backgroundColor: config.colors[1] })).toEqual([[0, 2, 0, 4]]);
    });
    it('默认注释忽略规则只跳过对应行的错误', () => {
        config.colorOnWhiteSpaceOnly = true;
        const ed = editor('   // comment\n   code'); start(ed);
        expect(ranges(ed, { backgroundColor: config.errorColor })).toEqual([[1, 0, 1, 3]]);
    });
    it('无 g 标记和零长度忽略正则有限结束并作用于所有匹配行', () => {
        config.ignoreLinePatterns = ['/comment/i', '/(?=x)/g', '/(?=)/gu'];
        const ed = editor('   comment\n   COMMENT\n   x😀'); start(ed);
        expect(ranges(ed, { backgroundColor: config.errorColor })).toEqual([]);
    });
    it('Unicode Sets 的零长度忽略正则跨过整个 emoji，避免扫描卡住', () => {
        config.ignoreLinePatterns = ['/(?=)/gv'];
        const module = { exports: {} };
        class BoundedRegExp extends RegExp {
            private executions = 0;
            exec(text: string): RegExpExecArray | null {
                // 保留真实正则行为，限制次数仅防止回归时挂起整个测试进程。
                if (++this.executions > 100) { throw new Error('零长度正则扫描未推进'); }
                return super.exec(text);
            }
        }
        vm.runInNewContext(compiled, {
            module, exports: module.exports, require: () => api, setTimeout, clearTimeout, console, RegExp: BoundedRegExp,
        });
        runtime = module.exports;
        const ed = editor('   😀');
        expect(() => start(ed)).not.toThrow();
        expect(ranges(ed, { backgroundColor: config.errorColor })).toEqual([]);
    });
    it('非法正则报告警告，其他着色继续工作', () => {
        config.ignoreLinePatterns = ['['];
        const ed = editor('  x'); start(ed);
        expect(api.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('ignoreLinePatterns'));
        expect(ranges(ed, { backgroundColor: config.colors[0] })).toEqual([[0, 0, 0, 2]]);
    });
    it('空颜色列表回退默认颜色，避免绘制失败', () => {
        config.colors = [];
        const ed = editor('  x'); start(ed);
        expect(ranges(ed, { backgroundColor: defaults.colors[0] })).toEqual([[0, 0, 0, 2]]);
    });
    it('细线模式使用配置颜色与线宽', () => {
        config.indicatorStyle = 'light'; config.lightIndicatorStyleLineWidth = 2;
        const ed = editor('  x'); start(ed);
        expect(ranges(ed, { borderColor: config.colors[0], borderWidth: '0 0 0 2px' })).toEqual([[0, 0, 0, 2]]);
    });
    it('宿主完整保留上游 11 项设置的默认值、类型和模式选项', () => {
        const upstream = require('../vendor/indent-rainbow/package.json').contributes.configuration.properties;
        const properties = Object.assign({}, ...require('../package.json').contributes.configuration.map((item: any) => item.properties));
        expect(Object.keys(upstream)).toHaveLength(11);
        for (const [key, value] of Object.entries(upstream) as [string, any][]) {
            expect(properties[key]).toMatchObject({ type: value.type, default: value.default });
            if (value.enum) { expect(properties[key].enum).toEqual(value.enum); }
        }
    });
    it('Web 构建仅通过 vscode API 完成真实缩进绘制', async () => {
        const ed = editor('    x');
        api.extensions = { getExtension: (id: string) => id === 'oderwat.indent-rainbow' ? undefined : { activate: async () => {} } };
        api.Uri = { ...vscode.Uri, joinPath: (uri: any, ...parts: string[]) => vscode.Uri.file(path.join(uri.fsPath, ...parts)) };
        api.window.showErrorMessage = jest.fn();
        api.window.activeTextEditor = ed; api.window.visibleTextEditors = [ed];
        host.extensionUri = vscode.Uri.file(path.resolve(__dirname, '..'));
        const module = { exports: {} as any };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../out/editorToolsWeb.js'), 'utf8'), {
            module, exports: module.exports, console, setTimeout, clearTimeout,
            require: (id: string) => { expect(id).toBe('vscode'); return api; },
        });
        runtime = module.exports;
        await runtime.activate(host); jest.runOnlyPendingTimers();
        expect(api.window.showErrorMessage).not.toHaveBeenCalled();
        expect(ranges(ed, { backgroundColor: config.colors[1] })).toEqual([[0, 2, 0, 4]]);
    });
    it('禁用混用颜色时仍显示普通层级色', () => {
        config.tabmixColor = '';
        const ed = editor('\t  x'); start(ed);
        expect(ranges(ed, { backgroundColor: config.colors[0] })).toEqual([[0, 0, 0, 1]]);
        expect(ranges(ed, { backgroundColor: config.colors[1] })).toEqual([[0, 1, 0, 3]]);
    });
    it('切换到排除语言时清除普通色、错误色和混用色', () => {
        const ed = editor('   x\n\t  y'); start(ed);
        ed.document.languageId = 'plaintext'; fire('active', ed);
        expect([...ed.decorations.values()].every((items: any) => items.length === 0)).toBe(true);
    });
    it('包含语言白名单限制绘制范围', () => {
        config.includedLanguages = ['verilog'];
        const allowed = editor('  x'), excluded = editor('  x', 'cpp'); start(allowed, excluded);
        expect(ranges(allowed, { backgroundColor: config.colors[0] })).toHaveLength(1);
        expect(ranges(excluded, { backgroundColor: config.colors[0] })).toEqual([]);
    });
    it('同时绘制所有可见编辑器，编辑文档后刷新', () => {
        const first = editor('  x'), second = editor('    y'); start(first, second);
        expect(ranges(second, { backgroundColor: config.colors[1] })).toEqual([[0, 2, 0, 4]]);
        second.document.getText = () => '  y'; fire('text', { document: second.document });
        expect(ranges(second, { backgroundColor: config.colors[1] })).toEqual([]);
    });
    it('tabSize 改变后重新检测错误缩进', () => {
        const ed = editor('  x'); start(ed);
        ed.options.tabSize = 4; fire('options', { textEditor: ed, options: ed.options });
        expect(ranges(ed, { backgroundColor: config.errorColor })).toEqual([[0, 0, 0, 2]]);
    });
    it('配置变化立即更新样式并释放旧装饰器，无需重载', () => {
        const ed = editor('  x'); start(ed); const old = [...types];
        config.colors = ['#123456']; fire('config', { affectsConfiguration: () => true });
        old.forEach(type => expect(type.dispose).toHaveBeenCalledTimes(1));
        expect(ranges(ed, { backgroundColor: '#123456' })).toEqual([[0, 0, 0, 2]]);
        expect(api.window.showInformationMessage).not.toHaveBeenCalled();
    });
    it('停用会取消待刷新任务、释放装饰器及全部事件', () => {
        const ed = editor('  x'); start(ed);
        for (const callback of events.text) { callback({ document: ed.document }); }
        expect(jest.getTimerCount()).toBe(1);
        expect(typeof runtime.deactivate).toBe('function');
        runtime.deactivate();
        expect(jest.getTimerCount()).toBe(0);
        expect(Object.values(events).every(items => items.length === 0)).toBe(true);
        types.forEach(type => expect(type.dispose).toHaveBeenCalledTimes(1));
    });
});
