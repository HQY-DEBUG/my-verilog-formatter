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
exports.registerGitHistory = registerGitHistory;
// 提供文件历史列表、只读虚拟文档和 VS Code 原生版本对比入口。
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const gitHistoryService_1 = require("./gitHistoryService");
const snapshotScheme = 'hanxuyao-git-history';
const pageSize = 100;
function serviceFor(resource) {
    const configured = vscode.workspace.getConfiguration('git', resource).get('path');
    if (typeof configured === 'string' && configured) {
        return new gitHistoryService_1.GitHistoryService(configured);
    }
    if (Array.isArray(configured)) {
        const candidates = configured.filter((value) => typeof value === 'string' && value.length > 0);
        if (candidates.length > 0) {
            return new gitHistoryService_1.GitHistoryService(candidates);
        }
    }
    return new gitHistoryService_1.GitHistoryService();
}
async function pickCommit(service, resource, title) {
    let limit = pageSize;
    while (true) {
        const history = await service.getFileHistory(resource.fsPath, limit);
        if (history.commits.length === 0) {
            void vscode.window.showInformationMessage('该文件没有 Git 提交历史（可能尚未提交，或仓库尚无提交）。');
            return;
        }
        const items = history.commits.map(commit => ({
            label: `${commit.hash.slice(0, 8)}  ${commit.subject}`,
            description: `${commit.author} · ${commit.date.replace('T', ' ')}`,
            detail: `${commit.filePath}${commit.deleted ? '（已删除）' : ''}`,
            commit,
        }));
        if (history.hasMore) {
            items.push({ label: '加载更多提交…', loadMore: true });
        }
        const selected = await vscode.window.showQuickPick(items, {
            title, placeHolder: '选择提交，可搜索提交说明、作者、日期和版本号',
            matchOnDescription: true, matchOnDetail: true,
        });
        if (!selected) {
            return;
        }
        if (selected.loadMore) {
            limit += pageSize;
            continue;
        }
        const commit = selected.commit;
        return { commit, history };
    }
}
function snapshotUri(repositoryRoot, commit, resource) {
    const data = {
        repositoryRoot, hash: commit?.hash || '0'.repeat(40),
        filePath: commit?.filePath || path.basename(resource.fsPath),
        encoding: vscode.workspace.getConfiguration('files', resource).get('encoding', 'utf8'),
        empty: !commit || commit.deleted,
    };
    return vscode.Uri.from({
        scheme: snapshotScheme, path: `/${data.hash.slice(0, 8)}/${data.filePath}`,
        query: JSON.stringify(data),
    });
}
async function showFileHistory(resource) {
    if (!vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage('请先信任工作区，再读取文件 Git 历史。');
        return;
    }
    resource = resource || vscode.window.activeTextEditor?.document.uri;
    if (!resource || resource.scheme !== 'file') {
        void vscode.window.showInformationMessage('请先打开或在资源管理器中选择一个已保存的本地文件。');
        return;
    }
    const service = serviceFor(resource);
    const selected = await pickCommit(service, resource, `文件 Git 历史（当前分支主线）：${path.basename(resource.fsPath)}`);
    if (!selected) {
        return;
    }
    const { commit, history } = selected;
    const action = await vscode.window.showQuickPick([
        { label: '查看历史版本', action: 'open' },
        { label: '与当前文件对比', action: 'workspace' },
        { label: '与上一个文件版本对比', action: 'previous' },
        { label: '与其他历史版本对比', action: 'other' },
    ], { title: `${commit.hash.slice(0, 8)}：${commit.subject}`, placeHolder: '选择查看或对比方式' });
    if (!action) {
        return;
    }
    const revision = snapshotUri(history.repositoryRoot, commit, resource);
    if (action.action === 'open') {
        const document = await vscode.workspace.openTextDocument(revision);
        await vscode.window.showTextDocument(document, { preview: false });
        return;
    }
    if (action.action === 'workspace') {
        await vscode.commands.executeCommand('vscode.diff', revision, resource, `${path.basename(resource.fsPath)}：${commit.hash.slice(0, 8)} ↔ 当前文件`);
        return;
    }
    let base;
    if (action.action === 'previous') {
        // 列表中相邻记录可能来自不同分支，使用该提交的第一父快照。
        base = commit.previous;
    }
    else {
        const other = await pickCommit(service, resource, '选择作为左侧基准的历史版本');
        if (!other) {
            return;
        }
        base = other.commit;
    }
    // 首次添加前或删除后的文件用空快照表示，不读取不存在的 Git 对象路径。
    const left = snapshotUri(history.repositoryRoot, base, resource);
    await vscode.commands.executeCommand('vscode.diff', left, revision, `${path.basename(resource.fsPath)}：${base?.hash.slice(0, 8) || '空文件'} ↔ ${commit.hash.slice(0, 8)}`);
}
function registerGitHistory(context) {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(snapshotScheme, {
        async provideTextDocumentContent(uri) {
            if (!vscode.workspace.isTrusted) {
                throw new Error('请先信任工作区，再读取 Git 历史版本。');
            }
            const data = JSON.parse(uri.query);
            if (typeof data.repositoryRoot !== 'string' || typeof data.hash !== 'string'
                || typeof data.filePath !== 'string' || typeof data.encoding !== 'string'
                || typeof data.empty !== 'boolean') {
                throw new Error('Git 历史文档地址无效。');
            }
            if (data.empty) {
                return '';
            }
            const resource = vscode.Uri.file(path.join(data.repositoryRoot, data.filePath));
            return serviceFor(resource).readRevision(data.repositoryRoot, data.hash, data.filePath, data.encoding);
        },
    }), vscode.commands.registerCommand('hanxuyao.gitHistory.file', async (resource) => {
        try {
            await showFileHistory(resource);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`文件 Git 历史：${error instanceof Error ? error.message : String(error)}`);
        }
    }));
}
//# sourceMappingURL=gitHistoryIntegration.js.map