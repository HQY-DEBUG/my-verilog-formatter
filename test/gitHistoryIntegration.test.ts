// 执行真实命令处理逻辑，在 VS Code 边界记录只读文档和差异编辑器请求。
import * as path from 'path';
import * as vscode from 'vscode';
import { registerGitHistory } from '../src/features/gitHistory/gitHistoryIntegration';

const handlers = new Map<string, (...args: any[]) => Promise<void>>();
let provider: any;
const snapshots: Record<string, any> = {};
let snapshotCount = 0;
const root = path.resolve('history-fixture');
const file = { scheme: 'file', fsPath: path.join(root, 'current.txt'), path: '/current.txt' };
const commits = [
    { hash: 'a'.repeat(40), author: '甲', date: '2026-11-09T10:00:00+08:00', subject: '重命名', filePath: 'current.txt', deleted: false,
        previous: { hash: 'c'.repeat(40), filePath: 'old.txt', deleted: false } },
    { hash: 'b'.repeat(40), author: '乙', date: '2026-11-08T10:00:00+08:00', subject: '首次提交', filePath: 'old.txt', deleted: false },
];
const getFileHistory = jest.fn();
const readRevision = jest.fn();

jest.mock('../src/features/gitHistory/gitHistoryService', () => ({
    GitHistoryService: jest.fn().mockImplementation(() => ({ getFileHistory, readRevision })),
}));

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    Uri: {
        file: (filename: string) => ({ scheme: 'file', fsPath: filename, path: filename }),
        from: (data: any) => {
            const id = `snapshot-${++snapshotCount}`;
            const uri = { ...data, toString: () => id };
            snapshots[id] = uri;
            return uri;
        },
    },
    workspace: {
        isTrusted: true,
        getConfiguration: () => ({ get: (_key: string, fallback: any) => fallback }),
        registerTextDocumentContentProvider: (_scheme: string, value: any) => { provider = value; return { dispose() {} }; },
        openTextDocument: jest.fn(async uri => ({ uri, getText: async () => provider.provideTextDocumentContent(uri) })),
    },
    window: {
        activeTextEditor: undefined,
        showQuickPick: jest.fn(), showTextDocument: jest.fn(),
        showInformationMessage: jest.fn(), showWarningMessage: jest.fn(), showErrorMessage: jest.fn(),
    },
    commands: {
        registerCommand: (id: string, handler: any) => { handlers.set(id, handler); return { dispose() {} }; },
        executeCommand: jest.fn(),
    },
}));

describe('文件历史交互', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        handlers.clear();
        (vscode.workspace as any).isTrusted = true;
        (vscode.window as any).activeTextEditor = { document: { uri: file } };
        getFileHistory.mockResolvedValue({ repositoryRoot: root, commits, hasMore: false });
        readRevision.mockResolvedValue('历史内容');
        registerGitHistory({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    });

    async function invoke(): Promise<void> {
        expect(handlers.has('hanxuyao.gitHistory.file')).toBe(true);
        await handlers.get('hanxuyao.gitHistory.file')!();
    }

    function pickCommit(index = 0): void {
        (vscode.window.showQuickPick as jest.Mock).mockImplementationOnce(async items => items[index]);
    }

    function pickAction(label: RegExp): void {
        (vscode.window.showQuickPick as jest.Mock).mockImplementationOnce(async items =>
            items.find((item: any) => label.test(item.label)));
    }

    it('从当前编辑器打开选定历史版本，并使用该提交实际路径', async () => {
        pickCommit(1); pickAction(/^查看历史版本$/);
        await invoke();
        const document = (vscode.workspace.openTextDocument as jest.Mock).mock.calls[0][0];
        expect(document.scheme).toBe('hanxuyao-git-history');
        expect(await provider.provideTextDocumentContent(document)).toBe('历史内容');
        expect(readRevision).toHaveBeenCalledWith(root, 'b'.repeat(40), 'old.txt', 'utf8');
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('与当前文件对比时把工作区 URI 放在右侧，保留未保存缓冲区', async () => {
        pickCommit(); pickAction(/^与当前文件对比$/);
        await invoke();
        const [command, left, right] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(command).toBe('vscode.diff');
        expect(JSON.parse(left.query).hash).toBe('a'.repeat(40));
        expect(right).toBe(file);
    });

    it('跨重命名与上一个文件版本对比时左右侧各自使用历史路径', async () => {
        pickCommit(); pickAction(/^与上一个文件版本对比$/);
        await invoke();
        const [, left, right] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(JSON.parse(left.query)).toMatchObject({ hash: 'c'.repeat(40), filePath: 'old.txt' });
        expect(JSON.parse(right.query)).toMatchObject({ hash: 'a'.repeat(40), filePath: 'current.txt' });
    });

    it('首次提交与空文件对比，不尝试读取不存在的父版本', async () => {
        pickCommit(1); pickAction(/^与上一个文件版本对比$/);
        await invoke();
        const [, left] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(await provider.provideTextDocumentContent(left)).toBe('');
        expect(readRevision).not.toHaveBeenCalled();
    });

    it('允许任意两个历史版本对比，第二次选择成为左侧基准', async () => {
        pickCommit(); pickAction(/^与其他历史版本对比$/); pickCommit(1);
        await invoke();
        const [, left, right] = (vscode.commands.executeCommand as jest.Mock).mock.calls[0];
        expect(JSON.parse(left.query).hash).toBe('b'.repeat(40));
        expect(JSON.parse(right.query).hash).toBe('a'.repeat(40));
    });

    it('加载更多后允许选择新出现的旧提交', async () => {
        getFileHistory.mockResolvedValueOnce({ repositoryRoot: root, commits: [commits[0]], hasMore: true });
        pickCommit(1); pickCommit(1); pickAction(/^查看历史版本$/);
        await invoke();
        expect(getFileHistory.mock.calls.map(call => call[1])).toEqual([100, 200]);
        const uri = (vscode.workspace.openTextDocument as jest.Mock).mock.calls[0][0];
        expect(JSON.parse(uri.query).hash).toBe('b'.repeat(40));
    });

    it('空历史显示提示，取消选择不打开任何文档', async () => {
        getFileHistory.mockResolvedValueOnce({ repositoryRoot: root, commits: [], hasMore: false });
        await invoke();
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
        await invoke();
        expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it('非本地文件或不信任的工作区不会调用 Git', async () => {
        (vscode.workspace as any).isTrusted = false;
        await invoke();
        expect(getFileHistory).not.toHaveBeenCalled();
        (vscode.workspace as any).isTrusted = true;
        (vscode.window as any).activeTextEditor = { document: { uri: { scheme: 'untitled' } } };
        await invoke();
        expect(getFileHistory).not.toHaveBeenCalled();
    });

    it('Git 失败显示明确错误，不当成空历史', async () => {
        getFileHistory.mockRejectedValueOnce(new Error('Git 不可用'));
        await invoke();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Git 不可用'));
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
});
