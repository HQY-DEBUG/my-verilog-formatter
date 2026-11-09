// 提供独立 Git 历史面板、只读虚拟文档和 VS Code 原生版本对比入口。
import * as path from 'path';
import * as vscode from 'vscode';
import { FileHistory, FileRevision, GitHistoryService } from './gitHistoryService';
import { createHistoryHtml } from './gitHistoryHtml';

const snapshotScheme = 'hanxuyao-git-history';
const pageSize = 100;

interface Snapshot {
    repositoryRoot: string;
    hash: string;
    filePath: string;
    encoding: string;
    empty: boolean;
}

function serviceFor(resource: vscode.Uri): GitHistoryService {
    const configured = vscode.workspace.getConfiguration('git', resource).get<unknown>('path');
    if (typeof configured === 'string' && configured) { return new GitHistoryService(configured); }
    if (Array.isArray(configured)) {
        const candidates = configured.filter((value): value is string => typeof value === 'string' && value.length > 0);
        if (candidates.length > 0) { return new GitHistoryService(candidates); }
    }
    return new GitHistoryService();
}

function snapshotUri(repositoryRoot: string, commit: FileRevision | undefined, resource: vscode.Uri): vscode.Uri {
    const data: Snapshot = {
        repositoryRoot, hash: commit?.hash || '0'.repeat(40),
        filePath: commit?.filePath || path.basename(resource.fsPath),
        encoding: vscode.workspace.getConfiguration('files', resource).get<string>('encoding', 'utf8'),
        empty: !commit || commit.deleted,
    };
    return vscode.Uri.from({
        scheme: snapshotScheme, path: `/${data.hash.slice(0, 8)}/${data.filePath}`,
        query: JSON.stringify(data),
    });
}

function createHistoryPanel(context: vscode.ExtensionContext, resource: vscode.Uri): vscode.WebviewPanel {
    const assets = vscode.Uri.joinPath(context.extensionUri, 'resources', 'gitHistory');
    const panel = vscode.window.createWebviewPanel('hanxuyao.gitHistory',
        'Git 历史：' + path.basename(resource.fsPath), vscode.ViewColumn.Active, {
            enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [assets],
        });
    const service = serviceFor(resource);
    let history: FileHistory | undefined;
    let limit = pageSize;
    let busy = false;
    let disposed = false;

    const post = async (message: unknown) => {
        if (!disposed) { await panel.webview.postMessage(message); }
    };
    context.subscriptions.push(panel, panel.onDidDispose(() => { disposed = true; }));
    context.subscriptions.push(panel.webview.onDidReceiveMessage(async (message: unknown) => {
        if (disposed || busy || !message || typeof message !== 'object') { return; }
        const request = message as Record<string, unknown>;
        if (!['ready', 'refresh', 'more', 'action'].includes(request.type as string)) { return; }
        if (request.type === 'more' && !history?.hasMore) { return; }
        busy = true;
        try {
            if (!vscode.workspace.isTrusted) { throw new Error('请先信任工作区，再读取 Git 历史。'); }
            await post({ type: 'busy', value: true });
            if (request.type !== 'action') {
                const nextLimit = request.type === 'more' ? limit + pageSize : pageSize;
                const result = await service.getFileHistory(resource.fsPath, nextLimit);
                if (disposed) { return; }
                history = result;
                limit = nextLimit;
                await post({ type: 'history', ...history, fileName: path.basename(resource.fsPath) });
                return;
            }
            // 页面只能引用本面板已加载的提交，不能传入文件路径或任意 VS Code 命令。
            const commit = history?.commits.find(item => item.hash === request.hash);
            if (!history || !commit) { throw new Error('所选版本不在已加载的提交中，请刷新历史。'); }
            const revision = snapshotUri(history.repositoryRoot, commit, resource);
            if (request.action === 'open') {
                const document = await vscode.workspace.openTextDocument(revision);
                await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
            } else if (request.action === 'workspace') {
                await vscode.commands.executeCommand('vscode.diff', revision, resource,
                    path.basename(resource.fsPath) + '：' + commit.hash.slice(0, 8) + ' ↔ 当前文件',
                    { viewColumn: vscode.ViewColumn.Beside });
            } else if (request.action === 'previous' || request.action === 'compare') {
                let base: FileRevision | undefined = commit.previous;
                if (request.action === 'compare') {
                    base = history.commits.find(item => item.hash === request.baseHash);
                    if (!base) { throw new Error('对比基准不在已加载的提交中，请重新选择。'); }
                }
                const left = snapshotUri(history.repositoryRoot, base, resource);
                await vscode.commands.executeCommand('vscode.diff', left, revision,
                    path.basename(resource.fsPath) + '：' + (base?.hash.slice(0, 8) || '空文件') + ' ↔ ' + commit.hash.slice(0, 8),
                    { viewColumn: vscode.ViewColumn.Beside });
            } else {
                throw new Error('不支持的历史版本操作。');
            }
        } catch (error) {
            await post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        } finally {
            busy = false;
            await post({ type: 'busy', value: false });
        }
    }));
    panel.webview.html = createHistoryHtml(
        panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'history.css')).toString(),
        panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'history.js')).toString(),
        panel.webview.cspSource);
    return panel;
}

export function registerGitHistory(context: vscode.ExtensionContext): void {
    const panels = new Map<string, vscode.WebviewPanel>();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(snapshotScheme, {
            async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
                if (!vscode.workspace.isTrusted) { throw new Error('请先信任工作区，再读取 Git 历史版本。'); }
                const data: Snapshot = JSON.parse(uri.query);
                if (typeof data.repositoryRoot !== 'string' || typeof data.hash !== 'string'
                    || typeof data.filePath !== 'string' || typeof data.encoding !== 'string'
                    || typeof data.empty !== 'boolean') {
                    throw new Error('Git 历史文档地址无效。');
                }
                if (data.empty) { return ''; }
                const resource = vscode.Uri.file(path.join(data.repositoryRoot, data.filePath));
                return serviceFor(resource).readRevision(data.repositoryRoot, data.hash, data.filePath, data.encoding);
            },
        }),
        vscode.commands.registerCommand('hanxuyao.gitHistory.file', async (resource?: vscode.Uri) => {
            if (!vscode.workspace.isTrusted) {
                void vscode.window.showWarningMessage('请先信任工作区，再读取文件 Git 历史。');
                return;
            }
            resource = resource || vscode.window.activeTextEditor?.document.uri;
            if (!resource || resource.scheme !== 'file') {
                void vscode.window.showInformationMessage('请先打开或在资源管理器中选择一个已保存的本地文件。');
                return;
            }
            try {
                const key = resource.toString();
                const existing = panels.get(key);
                if (existing) { existing.reveal(); return; }
                const panel = createHistoryPanel(context, resource);
                panels.set(key, panel);
                context.subscriptions.push(panel.onDidDispose(() => { panels.delete(key); }));
            } catch (error) {
                void vscode.window.showErrorMessage(`文件 Git 历史：${error instanceof Error ? error.message : String(error)}`);
            }
        }),
    );
}
