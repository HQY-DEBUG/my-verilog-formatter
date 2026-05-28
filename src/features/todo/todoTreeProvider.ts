// =========================================================================
// 文件    : todoTreeProvider.ts
// 描述    : TODO 树视图 TreeDataProvider，支持树/平铺/Tag 三种视图模式
// 版本    : v1.0
// 日期    : 2026/05/28
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/05/28    创建文件
// =========================================================================

import * as vscode from 'vscode';
import * as path   from 'path';
import { scan, scanFile, groupByFile } from './todoScanner';
import { getTodoConfig, mergeTagConfig } from './todoConfig';
import type { TodoItem } from './todoScanner';

// ---- 视图模式 ----//
export type ViewMode = 'tree' | 'flat' | 'tags';

// ---- TreeItem 节点类型 ----//
export class TodoTreeNode extends vscode.TreeItem {
    constructor(
        public readonly label         : string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly nodeType      : 'folder' | 'file' | 'item',
        public readonly todoItem?     : TodoItem,
        public readonly filePath?     : string,
        public readonly tagName?      : string,   // tags 视图下的标签名
    ) {
        super(label, collapsibleState);

        if (nodeType === 'item' && todoItem) {
            const cfg = mergeTagConfig(todoItem.tag,
                getTodoConfig().customHighlight[todoItem.tag] ?? {});
            this.iconPath    = new vscode.ThemeIcon(
                cfg.icon.replace(/^\$\(|\)$/g, ''),
                new vscode.ThemeColor('charts.foreground'),
            );
            this.description = `行 ${todoItem.line + 1}`;
            this.tooltip     = `${todoItem.tag}: ${todoItem.text}`;
            this.contextValue = 'todoItem';
            this.command      = {
                command  : 'vscode.open',
                title    : '跳转到 TODO',
                arguments: [
                    vscode.Uri.file(todoItem.file),
                    <vscode.TextDocumentShowOptions>{
                        selection: new vscode.Range(todoItem.line, todoItem.col, todoItem.line, todoItem.col),
                    },
                ],
            };
        } else if (nodeType === 'file') {
            this.iconPath    = new vscode.ThemeIcon('file');
            this.contextValue = 'todoFile';
            this.resourceUri = filePath ? vscode.Uri.file(filePath) : undefined;
        } else if (nodeType === 'folder') {
            this.iconPath    = new vscode.ThemeIcon('folder');
            this.contextValue = 'todoFolder';
        }
    }
}

// ---- Provider ----//
export class TodoTreeProvider implements vscode.TreeDataProvider<TodoTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private allItems : TodoItem[]             = [];
    private byFile   : Map<string, TodoItem[]> = new Map();
    private viewMode : ViewMode               = 'tree';
    private filter   : string                 = '';
    private hiddenPaths: Set<string>          = new Set();

    constructor(private readonly context: vscode.ExtensionContext) {
        this.viewMode = (context.workspaceState.get<ViewMode>('todo.viewMode')) ?? 'tree';
    }

    // ---- 公开 API ----//
    setViewMode(mode: ViewMode): void {
        this.viewMode = mode;
        this.context.workspaceState.update('todo.viewMode', mode);
        this._onDidChangeTreeData.fire(null);
    }

    setFilter(text: string): void {
        this.filter = text.toLowerCase();
        this._onDidChangeTreeData.fire(null);
    }

    hidePath(p: string): void {
        this.hiddenPaths.add(p);
        this._onDidChangeTreeData.fire(null);
    }

    resetPathFilter(): void {
        this.hiddenPaths.clear();
        this._onDidChangeTreeData.fire(null);
    }

    getItems(): TodoItem[]  { return this.allItems; }
    getTotalCount(): number { return this.allItems.length; }

    async refresh(): Promise<void> {
        const cfg     = getTodoConfig();
        const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        this.allItems = await scan(folders, cfg);
        this.byFile   = groupByFile(this.allItems);
        this._onDidChangeTreeData.fire(null);
    }

    async refreshFile(filePath: string): Promise<void> {
        const cfg      = getTodoConfig();
        const newItems = await scanFile(filePath, cfg);
        // 移除旧条目，替换为新条目
        this.allItems = this.allItems.filter(i => i.file !== filePath).concat(newItems);
        this.byFile   = groupByFile(this.allItems);
        this._onDidChangeTreeData.fire(null);
    }

    // ---- TreeDataProvider ----//
    getTreeItem(element: TodoTreeNode): vscode.TreeItem { return element; }

    getChildren(element?: TodoTreeNode): vscode.ProviderResult<TodoTreeNode[]> {
        if (!element) { return this._getRootNodes(); }
        return this._getChildNodes(element);
    }

    // ---- 根节点 ----//
    private _getRootNodes(): TodoTreeNode[] {
        const filtered = this._applyFilter(this.allItems);

        if (this.viewMode === 'flat') {
            return filtered.map(item => this._makeItemNode(item));
        }

        if (this.viewMode === 'tags') {
            const tags = [...new Set(filtered.map(i => i.tag))].sort();
            return tags.map(tag => {
                const count = filtered.filter(i => i.tag === tag).length;
                return new TodoTreeNode(
                    `${tag} (${count})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    undefined,
                    undefined,  // filePath
                    tag,        // tagName
                );
            });
        }

        // tree 模式：按工作区文件夹 → 子路径分组
        return this._buildTreeRoots(filtered);
    }

    private _getChildNodes(parent: TodoTreeNode): TodoTreeNode[] {
        const filtered = this._applyFilter(this.allItems);

        if (this.viewMode === 'tags') {
            const tag = parent.tagName!;
            return filtered
                .filter(i => i.tag === tag)
                .map(i => this._makeItemNode(i));
        }

        if (parent.nodeType === 'file') {
            const items = (this.byFile.get(parent.filePath!) ?? [])
                .filter(i => this._matchFilter(i));
            return items.map(i => this._makeItemNode(i));
        }

        if (parent.nodeType === 'folder') {
            // 返回该目录下的文件节点
            const folderPath = parent.filePath!;
            return this._getFileNodesUnderFolder(folderPath, filtered);
        }

        return [];
    }

    // ---- 构建树模式根节点（按工作区文件夹分组） ----//
    private _buildTreeRoots(items: TodoItem[]): TodoTreeNode[] {
        const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        if (folders.length === 0) {
            return this._buildFileNodes(items);
        }
        if (folders.length === 1) {
            return this._buildFileNodes(items, folders[0]);
        }
        return folders
            .filter(f => items.some(i => i.file.startsWith(f)))
            .map(f => {
                const name  = path.basename(f);
                const count = items.filter(i => i.file.startsWith(f)).length;
                return new TodoTreeNode(
                    `${name} (${count})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    undefined,
                    f,
                );
            });
    }

    private _buildFileNodes(items: TodoItem[], baseFolder?: string): TodoTreeNode[] {
        const fileSet = [...new Set(items.map(i => i.file))].sort();
        return fileSet
            .filter(f => !this.hiddenPaths.has(f) && (!baseFolder || f.startsWith(baseFolder)))
            .map(f => {
                const count   = (this.byFile.get(f) ?? []).filter(i => this._matchFilter(i)).length;
                const rel     = baseFolder ? path.relative(baseFolder, f) : f;
                return new TodoTreeNode(
                    `${rel} (${count})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'file',
                    undefined,
                    f,
                );
            });
    }

    private _getFileNodesUnderFolder(folderPath: string, items: TodoItem[]): TodoTreeNode[] {
        return this._buildFileNodes(items.filter(i => i.file.startsWith(folderPath)), folderPath);
    }

    private _makeItemNode(item: TodoItem): TodoTreeNode {
        return new TodoTreeNode(
            `[${item.tag}] ${item.text || '(no text)'}`,
            vscode.TreeItemCollapsibleState.None,
            'item',
            item,
        );
    }

    // ---- 过滤辅助 ----//
    private _applyFilter(items: TodoItem[]): TodoItem[] {
        if (!this.filter) { return items; }
        return items.filter(i => this._matchFilter(i));
    }

    private _matchFilter(item: TodoItem): boolean {
        if (!this.filter) { return true; }
        return (
            item.text.toLowerCase().includes(this.filter) ||
            item.file.toLowerCase().includes(this.filter) ||
            item.tag.toLowerCase().includes(this.filter)
        );
    }
}
