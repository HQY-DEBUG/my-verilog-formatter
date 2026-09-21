// 文件：editorTools.test.ts；描述：内置贡献覆盖、匹配行为、运行时共存与 RBQL 回归。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 新增词语高亮和 CSV 集成验证。
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as vscode from 'vscode';
import { activateEditorTools, deactivateEditorTools } from '../src/features/editorTools/editorToolsIntegration';

// 2026/09/21 新增：模拟编辑器边界，执行实际构建后的高亮命令与事件回调。
jest.mock('vscode', () => {
    const original = jest.requireActual('vscode');
    const commands = new Map();
    const events: Record<string, Function> = {};
    const disposable = () => ({ dispose: jest.fn() });
    const on = (name: string) => (callback: Function, _this?: unknown, subscriptions?: any[]) => {
        events[name] = callback;
        const item = disposable();
        subscriptions?.push(item);
        return item;
    };
    const config = Object.assign({}, ...require('../package.json').contributes.configuration.map((item: any) => item.properties));
    return {
        ...original,
        __commands: commands, __events: events,
        Uri: { ...original.Uri, joinPath: (uri: any, ...parts: string[]) => original.Uri.file(require('path').join(uri.fsPath, ...parts)) },
        EventEmitter: class extends original.EventEmitter { dispose = jest.fn(); },
        Selection: class { constructor(public anchor: any, public active: any) {} get start() { return this.anchor; } },
        OverviewRulerLane: { Right: 4 },
        commands: {
            registerCommand: jest.fn((id, callback) => { commands.set(id, callback); return { dispose: () => commands.delete(id) }; }),
            executeCommand: jest.fn(),
        },
        extensions: { getExtension: jest.fn() },
        workspace: {
            getConfiguration: (scope: string) => ({ get: (key: string) => config[`${scope}.${key}`]?.default }),
            onDidChangeConfiguration: on('config'), onDidChangeTextDocument: on('text'),
        },
        window: {
            activeTextEditor: undefined, visibleTextEditors: [],
            registerTreeDataProvider: jest.fn(disposable),
            createTextEditorDecorationType: jest.fn(disposable),
            showInputBox: jest.fn(), showQuickPick: jest.fn(),
            showInformationMessage: jest.fn(), showErrorMessage: jest.fn(),
            onDidChangeActiveTextEditor: on('active'), onDidChangeVisibleTextEditors: on('visible'),
        },
    };
});

const api = vscode as any;
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const context = () => ({ extensionUri: vscode.Uri.file(root), subscriptions: [], globalState: {}, workspaceState: {} } as unknown as vscode.ExtensionContext);

// 2026/09/21 新增：检查所有贡献点和资源，允许中文说明但不能丢失行为配置。
describe('上游贡献与运行资源', () => {
    function stripLabels(value: any): any {
        if (Array.isArray(value)) { return value.map(stripLabels); }
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value)
                .filter(([key]) => !['title', 'description', 'category', 'name', 'enumDescriptions'].includes(key))
                .map(([key, item]) => [key, stripLabels(item)]));
        }
        return value;
    }
    function contains(expected: any, actual: any): void {
        if (Array.isArray(expected)) {
            for (const item of expected) {
                expect(actual).toEqual(expect.arrayContaining([typeof item === 'object' ? expect.objectContaining(item) : item]));
            }
        } else if (expected && typeof expected === 'object') {
            for (const key of Object.keys(expected)) { contains(expected[key], actual?.[key]); }
        } else { expect(actual).toEqual(expected); }
    }
    it.each(['highlight-words', 'rainbow-csv'])('%s 的全部贡献点保留且资源存在', name => {
        const upstream = require(`../vendor/${name}/package.json`);
        const expected = structuredClone(upstream.contributes);
        const config = expected.configuration.properties;
        delete expected.configuration;
        for (const item of expected.languages || []) { item.configuration = `./out/${name}/${item.configuration.replace(/^\.\//, '')}`; }
        for (const item of expected.grammars || []) { item.path = `./out/${name}/${item.path.replace(/^\.\//, '')}`; }
        for (const item of expected.commands) {
            if (item.icon) { for (const theme of ['light', 'dark']) { item.icon[theme] = `./out/${name}/${item.icon[theme]}`; } }
        }
        contains(stripLabels(expected), stripLabels(manifest.contributes));
        const properties = Object.assign({}, ...manifest.contributes.configuration.map((item: any) => item.properties));
        contains(stripLabels(config), stripLabels(properties));
        expect(manifest.activationEvents).toEqual(expect.arrayContaining(upstream.activationEvents));
        for (const entry of [...expected.languages || [], ...expected.grammars || [], ...expected.commands]) {
            for (const file of [entry.configuration, entry.path, entry.icon?.light, entry.icon?.dark].filter(Boolean)) {
                expect(fs.existsSync(path.join(root, file))).toBe(true);
            }
        }
    });
    it('命令 ID 无重复，Web、Webview、Python 和许可资源完整', () => {
        const ids = manifest.contributes.commands.map((item: any) => item.command);
        expect(new Set(ids).size).toBe(ids.length);
        for (const file of [
            'editorToolsWeb.js', 'highlight-words/extension.js', 'highlight-words/LICENSE.md',
            'rainbow-csv/rbql_client.html', 'rainbow-csv/rbql_client.js', 'rainbow-csv/rbql_suggest.js',
            'rainbow-csv/dialect_select.html', 'rainbow-csv/dialect_select.js',
            'rainbow-csv/rbql_core/vscode_rbql.py', 'rainbow-csv/rbql_core/rbql/rbql_engine.py',
            'rainbow-csv/rbql_core/LICENSE', 'rainbow-csv/contrib/textarea-caret-position/LICENSE',
            'rainbow-csv/contrib/wcwidth/LICENSE', 'rainbow-csv/LICENSE',
        ]) { expect(fs.existsSync(path.join(root, 'out', file))).toBe(true); }
    });
});

// 2026/09/21 新增：验证本插件上下文重定位、原扩展复用及单组件故障隔离。
describe('运行时集成', () => {
    beforeEach(() => { api.extensions.getExtension.mockReset(); });
    afterEach(async () => { await deactivateEditorTools(); });
    const runtime = () => ({ activate: jest.fn(), deactivate: jest.fn() });
    it('两个组件读取独立资源目录，共用宿主状态', async () => {
        const highlight = runtime(), rainbow = runtime(), host = context();
        await activateEditorTools(host, { 'highlight-words': () => highlight, 'rainbow-csv': () => rainbow });
        for (const [name, component] of [['highlight-words', highlight], ['rainbow-csv', rainbow]] as const) {
            const adapted = component.activate.mock.calls[0][0];
            expect(adapted.asAbsolutePath('extension.js')).toBe(path.join(root, 'out', name, 'extension.js'));
            expect(adapted.globalState).toBe(host.globalState);
            expect(adapted.workspaceState).toBe(host.workspaceState);
        }
        await deactivateEditorTools();
        expect(highlight.deactivate).toHaveBeenCalledTimes(1);
        expect(rainbow.deactivate).toHaveBeenCalledTimes(1);
    });
    it('已有原扩展时不重复注册，也不停止原扩展', async () => {
        const original = { activate: jest.fn().mockResolvedValue(undefined), deactivate: jest.fn() };
        api.extensions.getExtension.mockReturnValue(original);
        const load = jest.fn();
        await activateEditorTools(context(), { 'highlight-words': load, 'rainbow-csv': load });
        await deactivateEditorTools();
        expect(original.activate).toHaveBeenCalledTimes(2);
        expect(load).not.toHaveBeenCalled();
        expect(original.deactivate).not.toHaveBeenCalled();
    });
    it('一个组件启动失败时释放其资源并继续启动另一个', async () => {
        const dispose = jest.fn(), rainbow = runtime();
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        const broken = { activate: (ctx: any) => { ctx.subscriptions.push({ dispose }); throw new Error('启动测试'); }, deactivate: jest.fn() };
        await activateEditorTools(context(), { 'highlight-words': () => broken, 'rainbow-csv': () => rainbow });
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(broken.deactivate).toHaveBeenCalledTimes(1);
        expect(rainbow.activate).toHaveBeenCalledTimes(1);
        expect(api.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('启动测试'));
        errorLog.mockRestore();
    });
});

// 2026/09/21 新增：覆盖原版易出错的零长度正则、字面量、回绕和多编辑器计数。
describe('词语高亮行为', () => {
    let host: vscode.ExtensionContext;
    const invoke = async (id: string, value?: any) => { api.__commands.get(`highlightwords.${id}`)(value); await Promise.resolve(); };
    const tree = () => api.window.registerTreeDataProvider.mock.calls.at(-1)[1];
    function editor(text: string, selected = ''): any {
        return {
            document: {
                getText: (selection: any) => selection ? selected : text,
                getWordRangeAtPosition: () => undefined,
                positionAt: (offset: number) => new vscode.Position(0, offset),
                offsetAt: (position: any) => position.character,
            },
            selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
            setDecorations: jest.fn(), revealRange: jest.fn(),
        };
    }
    beforeEach(() => {
        jest.useFakeTimers();
        api.window.activeTextEditor = undefined;
        api.window.visibleTextEditors = [];
        host = context();
        require('../out/highlight-words/extension.js').activate(host);
    });
    afterEach(() => { host.subscriptions.forEach(item => item.dispose()); jest.useRealTimers(); });
    it('普通选区按字面量匹配，并在再次切换时清除', async () => {
        const ed = editor('a.b axb a.b', 'a.b');
        api.window.activeTextEditor = ed; api.window.visibleTextEditors = [ed];
        await invoke('addHighlight');
        expect(ed.setDecorations.mock.calls.at(-8)[1]).toHaveLength(2);
        expect(await tree().getChildren()).toHaveLength(1);
        await invoke('addHighlight');
        expect(await tree().getChildren()).toHaveLength(0);
    });
    it('零长度正则有限结束，前后跳转在当前编辑器回绕', async () => {
        const ed = editor('a a'), other = editor('a');
        api.window.activeTextEditor = ed; api.window.visibleTextEditors = [ed, other];
        api.window.showInputBox.mockResolvedValue('(?=a)');
        await invoke('addRegExpHighlight');
        const node = (await tree().getChildren())[0];
        await invoke('findNext', node);
        expect(ed.selection.active.character).toBe(2);
        expect(tree().currentIndex).toEqual({ index: 2, count: 2 });
        await invoke('findNext', node);
        expect(ed.selection.active.character).toBe(0);
        await invoke('findPrevious', node);
        expect(ed.selection.active.character).toBe(2);
    });
    it('全词与大小写模式不匹配较长词语', async () => {
        const ed = editor('one ONE stone', 'one');
        api.window.activeTextEditor = ed; api.window.visibleTextEditors = [ed];
        api.window.showQuickPick.mockResolvedValue('both');
        await invoke('addHighlightWithOptions');
        expect(ed.setDecorations.mock.calls.at(-8)[1]).toHaveLength(2);
    });
    it('取消输入、非法表达式、无编辑器和无匹配均可安全返回', async () => {
        api.window.showInputBox.mockResolvedValue(undefined);
        await invoke('addRegExpHighlight'); await invoke('addHighlight');
        expect(await tree().getChildren()).toHaveLength(0);
        api.window.showInputBox.mockResolvedValue('[');
        await invoke('addRegExpHighlight');
        expect(await tree().getChildren()).toHaveLength(0);
        api.window.activeTextEditor = editor('nothing');
        await invoke('findPrevious', { highlight: { expression: 'missing', wholeWord: false, ignoreCase: false } });
        expect(tree().currentIndex.count).toBe(0);
    });
    it('配置变化释放旧装饰器，扩展释放全部命令', () => {
        const old = api.window.createTextEditorDecorationType.mock.results.slice(-8).map((item: any) => item.value);
        api.__events.config({ affectsConfiguration: () => true });
        old.forEach((item: any) => expect(item.dispose).toHaveBeenCalledTimes(1));
        host.subscriptions.forEach(item => item.dispose()); host.subscriptions.length = 0;
        expect(api.__commands.size).toBe(0);
    });
});

// 2026/09/21 新增：复用上游算法测试，并对真实 RBQL 引擎执行查询。
describe('Rainbow CSV 算法与 RBQL', () => {
    it('Web 包在没有 Node 模块的宿主中启动，受限工作区阻止查询', async () => {
        const registered = new Map<string, Function>();
        const dispose = () => ({ dispose: jest.fn() });
        const hostApi = {
            ...api,
            SemanticTokensLegend: class { constructor(public tokenTypes: string[]) {} },
            extensions: { getExtension: () => undefined },
            commands: {
                registerCommand: (id: string, fn: Function) => { registered.set(id, fn); return dispose(); },
                executeCommand: jest.fn(),
            },
            languages: new Proxy({}, { get: () => dispose }),
            workspace: { ...api.workspace, isTrusted: false, onDidOpenTextDocument: dispose, onDidCloseTextDocument: dispose },
            window: {
                ...api.window, activeTextEditor: undefined, visibleTextEditors: [],
                createOutputChannel: () => ({ dispose: jest.fn(), appendLine: jest.fn() }),
                showWarningMessage: jest.fn(),
            },
        };
        const module = { exports: {} as any };
        const sandbox = {
            module, exports: module.exports, console, setTimeout, clearTimeout,
            require: (id: string) => { expect(id).toBe('vscode'); return hostApi; },
        };
        const errorCount = api.window.showErrorMessage.mock.calls.length;
        vm.runInNewContext(fs.readFileSync(path.join(root, 'out/editorToolsWeb.js'), 'utf8'), sandbox);
        const host = context();
        await module.exports.activate(host);
        expect(api.window.showErrorMessage.mock.calls.length).toBe(errorCount);
        for (const item of manifest.contributes.commands.filter((entry: any) => /^(highlightwords|rainbow-csv)\./.test(entry.command))) {
            expect(registered.has(item.command)).toBe(true);
        }
        await registered.get('rainbow-csv.RBQL')!();
        expect(hostApi.window.showWarningMessage).toHaveBeenCalledWith('RBQL 查询需要受信任的工作区。');
        await module.exports.deactivate();
        host.subscriptions.forEach(item => item.dispose());
    });
    it('通过上游 CSV 解析、双宽对齐、列编辑、提示和预览回归', () => {
        require('./upstream/rainbow-csv/unit_tests.js').test_all();
    });
    it('执行筛选排序、聚合、JOIN 和 UPDATE', async () => {
        const rbql = require('../vendor/rainbow-csv/rbql_core/rbql-js/rbql.js');
        const input = [['甲', 2], ['乙', 3], ['甲', 1]];
        async function query(sql: string, join: any[] | null = null): Promise<any[]> {
            const output: any[] = [];
            await rbql.query_table(sql, input, output, [], join);
            return output;
        }
        expect(await query('SELECT a1, a2 WHERE a2 > 1 ORDER BY a2 DESC')).toEqual([['乙', 3], ['甲', 2]]);
        expect(await query('SELECT a1, SUM(a2) GROUP BY a1')).toEqual(expect.arrayContaining([['甲', 3], ['乙', 3]]));
        expect(await query('SELECT a1, b2 JOIN b ON a1 == b1', [['甲', 'A'], ['乙', 'B']])).toEqual([['甲', 'A'], ['乙', 'B'], ['甲', 'A']]);
        expect(await query('UPDATE a2 = a2 * 2')).toEqual([['甲', 4], ['乙', 6], ['甲', 2]]);
    });
});
