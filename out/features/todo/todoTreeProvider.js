"use strict";
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
exports.TodoTreeProvider = exports.TodoTreeNode = void 0;
exports.pathStartsWith = pathStartsWith;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const todoScanner_1 = require("./todoScanner");
const todoConfig_1 = require("./todoConfig");
// ---- 路径比较（Windows 大小写不敏感、统一分隔符） ----//
function pathStartsWith(child, parent) {
    const normalize = (p) => path.normalize(p).toLowerCase();
    const c = normalize(child);
    const p_ = normalize(parent);
    // 确保 parent 以分隔符结尾，避免 /foo 误匹配 /foobar
    const pSep = p_.endsWith(path.sep) ? p_ : p_ + path.sep;
    return c === p_ || c.startsWith(pSep);
}
// ---- TreeItem 节点类型 ----//
class TodoTreeNode extends vscode.TreeItem {
    constructor(label, collapsibleState, nodeType, todoItem, filePath, tagName) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.nodeType = nodeType;
        this.todoItem = todoItem;
        this.filePath = filePath;
        this.tagName = tagName;
        if (nodeType === 'item' && todoItem) {
            const cfg = (0, todoConfig_1.mergeTagConfig)(todoItem.tag, (0, todoConfig_1.getTodoConfig)().customHighlight[todoItem.tag] ?? {});
            this.iconPath = new vscode.ThemeIcon(cfg.icon.replace(/^\$\(|\)$/g, ''), new vscode.ThemeColor('charts.foreground'));
            this.description = `行 ${todoItem.line + 1}`;
            this.tooltip = `${todoItem.tag}: ${todoItem.text}`;
            this.contextValue = 'todoItem';
            this.command = {
                command: 'verilogFormatter.todo.revealItem',
                title: '跳转到 TODO',
                arguments: [todoItem.file, todoItem.line, todoItem.charCol],
            };
        }
        else if (nodeType === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
            this.contextValue = 'todoFile';
            this.resourceUri = filePath ? vscode.Uri.file(filePath) : undefined;
        }
        else if (nodeType === 'folder') {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'todoFolder';
        }
    }
}
exports.TodoTreeNode = TodoTreeNode;
// ---- Provider ----//
class TodoTreeProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.allItems = [];
        this.byFile = new Map();
        this.viewMode = 'tree';
        this.filter = '';
        this.hiddenPaths = new Set();
        this.viewMode = (context.workspaceState.get('todo.viewMode')) ?? 'tree';
    }
    // ---- 公开 API ----//
    setViewMode(mode) {
        this.viewMode = mode;
        this.context.workspaceState.update('todo.viewMode', mode);
        this._onDidChangeTreeData.fire(null);
    }
    setFilter(text) {
        this.filter = text.toLowerCase();
        this._onDidChangeTreeData.fire(null);
    }
    hidePath(p) {
        this.hiddenPaths.add(p);
        this._onDidChangeTreeData.fire(null);
    }
    resetPathFilter() {
        this.hiddenPaths.clear();
        this._onDidChangeTreeData.fire(null);
    }
    getItems() { return this.allItems; }
    getTotalCount() { return this.allItems.length; }
    async refresh() {
        const cfg = (0, todoConfig_1.getTodoConfig)();
        const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        this.allItems = await (0, todoScanner_1.scan)(folders, cfg);
        this.byFile = (0, todoScanner_1.groupByFile)(this.allItems);
        this._onDidChangeTreeData.fire(null);
    }
    async refreshFile(filePath) {
        const cfg = (0, todoConfig_1.getTodoConfig)();
        const newItems = await (0, todoScanner_1.scanFile)(filePath, cfg);
        // 移除旧条目，替换为新条目
        this.allItems = this.allItems.filter(i => i.file !== filePath).concat(newItems);
        this.byFile = (0, todoScanner_1.groupByFile)(this.allItems);
        this._onDidChangeTreeData.fire(null);
    }
    // ---- TreeDataProvider ----//
    getTreeItem(element) { return element; }
    getChildren(element) {
        if (!element) {
            return this._getRootNodes();
        }
        return this._getChildNodes(element);
    }
    // ---- 根节点 ----//
    _getRootNodes() {
        const filtered = this._applyFilter(this.allItems);
        if (this.viewMode === 'flat') {
            return filtered.map(item => this._makeItemNode(item));
        }
        if (this.viewMode === 'tags') {
            const tags = [...new Set(filtered.map(i => i.tag))].sort();
            return tags.map(tag => {
                const count = filtered.filter(i => i.tag === tag).length;
                return new TodoTreeNode(`${tag} (${count})`, vscode.TreeItemCollapsibleState.Expanded, 'folder', undefined, undefined, // filePath
                tag);
            });
        }
        // tree 模式：按工作区文件夹 → 子路径分组
        return this._buildTreeRoots(filtered);
    }
    _getChildNodes(parent) {
        const filtered = this._applyFilter(this.allItems);
        if (this.viewMode === 'tags') {
            const tag = parent.tagName;
            return filtered
                .filter(i => i.tag === tag)
                .map(i => this._makeItemNode(i));
        }
        if (parent.nodeType === 'file') {
            const items = (this.byFile.get(parent.filePath) ?? [])
                .filter(i => this._matchFilter(i));
            return items.map(i => this._makeItemNode(i));
        }
        if (parent.nodeType === 'folder') {
            // 返回该目录下的文件节点
            const folderPath = parent.filePath;
            return this._getFileNodesUnderFolder(folderPath, filtered);
        }
        return [];
    }
    // ---- 构建树模式根节点（按工作区文件夹分组） ----//
    _buildTreeRoots(items) {
        const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        if (folders.length === 0) {
            return this._buildFileNodes(items);
        }
        if (folders.length === 1) {
            return this._buildFileNodes(items, folders[0]);
        }
        return folders
            .filter(f => items.some(i => pathStartsWith(i.file, f)))
            .map(f => {
            const name = path.basename(f);
            const count = items.filter(i => pathStartsWith(i.file, f)).length;
            return new TodoTreeNode(`${name} (${count})`, vscode.TreeItemCollapsibleState.Expanded, 'folder', undefined, f);
        });
    }
    _buildFileNodes(items, baseFolder) {
        const fileSet = [...new Set(items.map(i => i.file))].sort();
        return fileSet
            .filter(f => !this.hiddenPaths.has(f) && (!baseFolder || pathStartsWith(f, baseFolder)))
            .map(f => {
            const count = (this.byFile.get(f) ?? []).filter(i => this._matchFilter(i)).length;
            const rel = baseFolder ? path.relative(baseFolder, f) : f;
            return new TodoTreeNode(`${rel} (${count})`, vscode.TreeItemCollapsibleState.Expanded, 'file', undefined, f);
        });
    }
    _getFileNodesUnderFolder(folderPath, items) {
        return this._buildFileNodes(items.filter(i => pathStartsWith(i.file, folderPath)), folderPath);
    }
    _makeItemNode(item) {
        return new TodoTreeNode(`[${item.tag}] ${item.text || '(no text)'}`, vscode.TreeItemCollapsibleState.None, 'item', item);
    }
    // ---- 过滤辅助 ----//
    _applyFilter(items) {
        if (!this.filter) {
            return items;
        }
        return items.filter(i => this._matchFilter(i));
    }
    _matchFilter(item) {
        if (!this.filter) {
            return true;
        }
        return (item.text.toLowerCase().includes(this.filter) ||
            item.file.toLowerCase().includes(this.filter) ||
            item.tag.toLowerCase().includes(this.filter));
    }
}
exports.TodoTreeProvider = TodoTreeProvider;
//# sourceMappingURL=todoTreeProvider.js.map