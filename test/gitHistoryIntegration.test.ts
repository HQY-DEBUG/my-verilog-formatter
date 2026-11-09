// 执行面板消息处理，核对版本选择、只读快照、分页和文件绑定。
import * as path from 'path';
import * as vscode from 'vscode';
import { registerGitHistory } from '../src/features/gitHistory/gitHistoryIntegration';

const handlers = new Map<string, (...args: any[]) => Promise<void>>();
let provider: any;
let messageHandler: (message: any) => Promise<void>;
let disposeHandler: () => void;
let disposeCallbacks: Array<() => void> = [];
const root = path.resolve('history-fixture');
const file = { scheme: 'file', fsPath: path.join(root, 'current.txt'), path: '/current.txt', toString: () => 'file:///current.txt' };
const commits = [
    { hash: 'a'.repeat(40), author: '甲', date: '2026-11-09T10:00:00+08:00', subject: '重命名', filePath: 'current.txt', deleted: false,
        previous: { hash: 'c'.repeat(40), filePath: 'old.txt', deleted: false } },
    { hash: 'b'.repeat(40), author: '乙', date: '2026-11-08T10:00:00+08:00', subject: '首次提交', filePath: 'old.txt', deleted: false },
];
const getFileHistory = jest.fn();
const readRevision = jest.fn();
const panel = {
    reveal: jest.fn(), dispose: jest.fn(),
    onDidDispose: (callback: () => void) => {
        disposeCallbacks.push(callback);
        disposeHandler = () => disposeCallbacks.slice().forEach(dispose => dispose());
        return { dispose() {} };
    },
    webview: {
        html: '', cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => ({ toString: () => 'vscode-webview:' + uri.path }),
        onDidReceiveMessage: (callback: any) => { messageHandler = callback; return { dispose() {} }; },
        postMessage: jest.fn().mockResolvedValue(true),
    },
};

jest.mock('../src/features/gitHistory/gitHistoryService', () => ({
    GitHistoryService: jest.fn().mockImplementation(() => ({ getFileHistory, readRevision })),
}));

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    Uri: {
        file: (filename: string) => ({ scheme: 'file', fsPath: filename, path: filename }),
        joinPath: (uri: any, ...parts: string[]) => ({ path: [uri.path, ...parts].join('/') }),
        from: (data: any) => ({ ...data, toString: () => data.scheme + ':' + data.path + '?' + data.query }),
    },
    ViewColumn: { Active: 1, Beside: 2 },
    Disposable: class { constructor(public dispose: () => void) {} },
    workspace: {
        isTrusted: true,
        getConfiguration: () => ({ get: (_key: string, fallback: any) => fallback }),
        registerTextDocumentContentProvider: (_scheme: string, value: any) => { provider = value; return { dispose() {} }; },
        openTextDocument: jest.fn(async uri => ({ uri })),
    },
    window: {
        activeTextEditor: undefined, createWebviewPanel: jest.fn(() => panel),
        showTextDocument: jest.fn(), showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(), showErrorMessage: jest.fn(),
    },
    commands: {
        registerCommand: (id: string, handler: any) => { handlers.set(id, handler); return { dispose() {} }; },
        executeCommand: jest.fn(),
    },
}));

describe('文件历史面板', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        handlers.clear();
        disposeCallbacks = [];
        (vscode.workspace as any).isTrusted = true;
        (vscode.window as any).activeTextEditor = { document: { uri: file } };
        getFileHistory.mockResolvedValue({ repositoryRoot: root, commits, hasMore: false });
        readRevision.mockResolvedValue('历史内容');
        registerGitHistory({ subscriptions: [], extensionUri: { path: '/extension' } } as any);
    });

    async function open(): Promise<void> {
        await handlers.get('hanxuyao.gitHistory.file')!();
        expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        await messageHandler({ type: 'ready' });
    }

    function action(action: string, hash = commits[0].hash, baseHash?: string): Promise<void> {
        return messageHandler({ type: 'action', action, hash, baseHash });
    }

    it('打开独立历史页签，通过就绪握手发送提交数据', async () => {
        await open();
        expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'history', commits, repositoryRoot: root, fileName: 'current.txt',
        }));
        const options = (vscode.window.createWebviewPanel as jest.Mock).mock.calls[0][3];
        expect(options.enableScripts).toBe(true);
        expect(options.localResourceRoots).toHaveLength(1);
    });

    it('打开指定历史版本，使用重命名前的实际路径', async () => {
        await open(); await action('open', commits[1].hash);
        const uri = (vscode.workspace.openTextDocument as jest.Mock).mock.calls[0][0];
        expect(uri.scheme).toBe('hanxuyao-git-history');
        expect(await provider.provideTextDocumentContent(uri)).toBe('历史内容');
        expect(readRevision).toHaveBeenCalledWith(root, commits[1].hash, 'old.txt', 'utf8');
    });

    it('面板操作始终绑定原文件，不受当前编辑器变化影响', async () => {
        await open();
        (vscode.window as any).activeTextEditor = { document: { uri: { fsPath: 'other.txt' } } };
        await action('workspace');
        const [command, left, right] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(command).toBe('vscode.diff');
        expect(JSON.parse(left.query).hash).toBe(commits[0].hash);
        expect(right).toBe(file);
    });

    it('上一个版本使用第一父快照，首次提交使用空文件', async () => {
        await open(); await action('previous');
        let [, left, right] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(JSON.parse(left.query)).toMatchObject({ hash: 'c'.repeat(40), filePath: 'old.txt' });
        expect(JSON.parse(right.query).hash).toBe(commits[0].hash);
        await action('previous', commits[1].hash);
        [, left] = (vscode.commands.executeCommand as jest.Mock).mock.calls[1];
        expect(await provider.provideTextDocumentContent(left)).toBe('');
        expect(readRevision).not.toHaveBeenCalled();
    });

    it('对比基准放在左侧，选中版本放在右侧', async () => {
        await open(); await action('compare', commits[0].hash, commits[1].hash);
        const [, left, right] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(JSON.parse(left.query).hash).toBe(commits[1].hash);
        expect(JSON.parse(right.query).hash).toBe(commits[0].hash);
    });

    it('加载更多提交后保留分页语义，刷新重置为第一页', async () => {
        getFileHistory.mockResolvedValueOnce({ repositoryRoot: root, commits: [commits[0]], hasMore: true });
        await open(); await messageHandler({ type: 'more' }); await messageHandler({ type: 'refresh' });
        expect(getFileHistory.mock.calls.map(call => call[1])).toEqual([100, 200, 100]);
    });

    it('空历史仍展示面板，Git 错误在面板中反馈', async () => {
        getFileHistory.mockResolvedValueOnce({ repositoryRoot: root, commits: [], hasMore: false });
        await open();
        expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'history', commits: [] }));
        getFileHistory.mockRejectedValueOnce(new Error('Git 不可用'));
        await messageHandler({ type: 'refresh' });
        expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: expect.stringContaining('Git 不可用') }));
    });

    it('拒绝未加载的提交和对比基准，页面不能请求任意路径或命令', async () => {
        await open();
        await action('open', 'd'.repeat(40));
        await action('compare', commits[0].hash, 'd'.repeat(40));
        await action('executeAnything');
        expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });

    it('查询进行中不并发刷新，关闭后不再发送结果', async () => {
        let resolveHistory: any;
        let markStarted: () => void;
        const started = new Promise<void>(resolve => { markStarted = resolve; });
        getFileHistory.mockImplementationOnce(() => {
            markStarted();
            return new Promise(resolve => { resolveHistory = resolve; });
        });
        await handlers.get('hanxuyao.gitHistory.file')!();
        const pending = messageHandler({ type: 'ready' });
        await started;
        await messageHandler({ type: 'refresh' });
        expect(getFileHistory).toHaveBeenCalledTimes(1);
        disposeHandler();
        panel.webview.postMessage.mockClear();
        resolveHistory({ repositoryRoot: root, commits, hasMore: false });
        await pending;
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
    });

    it('同一文件复用页签，关闭后重新打开新面板', async () => {
        await open();
        await handlers.get('hanxuyao.gitHistory.file')!();
        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        expect(panel.reveal).toHaveBeenCalled();
        disposeHandler();
        await handlers.get('hanxuyao.gitHistory.file')!();
        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });

    it('非本地文件和不信任的工作区不启动面板', async () => {
        (vscode.workspace as any).isTrusted = false;
        await handlers.get('hanxuyao.gitHistory.file')!();
        (vscode.workspace as any).isTrusted = true;
        (vscode.window as any).activeTextEditor = { document: { uri: { scheme: 'untitled' } } };
        await handlers.get('hanxuyao.gitHistory.file')!();
        expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
        expect(getFileHistory).not.toHaveBeenCalled();
    });
});
