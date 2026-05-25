// =========================================================================
// 文件    : fileTree.ts
// 描述    : 文件树 TreeDataProvider：扫描工作区 .v/.sv 文件，按模块例化关系建立层次树
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import * as glob   from 'glob';

// ---- 数据结构 ----//
interface ModuleDecl {
    name    : string;
    filePath: string;
    line    : number;
}

interface InstRef {
    typeName : string; // 被例化的模块类型
    instName : string; // 例化名
    line     : number;
}

interface ParsedFile {
    filePath : string;
    modules  : ModuleDecl[];
    insts    : InstRef[];
}

// TreeItem 扩展
export class VerilogTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label    : string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly moduleName: string,
        public readonly filePath : string,
        public readonly lineNum  : number,
        public readonly instName : string = '',
    ) {
        super(label, collapsibleState);
        this.description = instName ? `(${instName})` : path.basename(filePath);
        this.tooltip     = `${filePath}:${lineNum + 1}`;
        this.iconPath    = new vscode.ThemeIcon('symbol-module');
        this.command     = {
            command   : 'vscode.open',
            title     : '跳转到模块定义',
            arguments : [
                vscode.Uri.file(filePath),
                <vscode.TextDocumentShowOptions>{ selection: new vscode.Range(lineNum, 0, lineNum, 0) },
            ],
        };
    }
}

// ---- 解析逻辑 ----//
const RE_MODULE    = /^\s*module\s+(\w+)/;
const RE_INST      = /^\s*(\w+)\s+(?:#\s*\([^)]*\)\s*)?(\w+)\s*\s*[(\s]/;
const VERILOG_EXTS = ['.v', '.vh', '.sv', '.svh'];
// 不视为模块例化的关键字
const KEYWORDS = new Set([
    'module','endmodule','input','output','inout','wire','reg','logic',
    'integer','always','initial','begin','end','if','else','case',
    'casex','casez','endcase','for','while','repeat','forever',
    'assign','parameter','localparam','function','task','generate',
    'genvar','defparam','fork','join','wait','disable','specify',
    'table','primitive','endprimitive','config','endconfig',
    'package','endpackage','interface','endinterface',
    'posedge','negedge','edge','default','signed','unsigned',
]);

function parseFile(filePath: string): ParsedFile {
    const result: ParsedFile = { filePath, modules: [], insts: [] };
    let   text: string;
    try { text = fs.readFileSync(filePath, 'utf8'); } catch { return result; }

    const lines    = text.split(/\r?\n/);
    let   inModule = false;

    for (let i = 0; i < lines.length; i++) {
        const line    = lines[i];
        const trimmed = line.replace(/\/\/.*$/, '').trim(); // 去行注释

        if (!inModule) {
            const mm = trimmed.match(RE_MODULE);
            if (mm) {
                result.modules.push({ name: mm[1], filePath, line: i });
                inModule = true;
            }
            continue;
        }

        if (/\bendmodule\b/.test(trimmed)) { inModule = false; continue; }

        const im = trimmed.match(RE_INST);
        if (im) {
            const typeName = im[1];
            const instName = im[2];
            if (!KEYWORDS.has(typeName) && !KEYWORDS.has(instName)) {
                result.insts.push({ typeName, instName, line: i });
            }
        }
    }

    return result;
}

/**
 * @brief 扫描工作区所有 Verilog 文件
 * @param excludeFolders 排除的文件夹名称列表
 * @return 文件解析结果数组
 */
function scanWorkspace(excludeFolders: string[]): ParsedFile[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return []; }

    const results: ParsedFile[] = [];
    for (const folder of folders) {
        const root  = folder.uri.fsPath;
        const files = glob.sync('**/*.{v,vh,sv,svh}', {
            cwd    : root,
            ignore : excludeFolders.map(f => `**/${f}/**`),
            absolute: true,
        });
        for (const f of files) {
            results.push(parseFile(f));
        }
    }
    return results;
}

// ---- TreeDataProvider ----//
export class VerilogFileTreeProvider implements vscode.TreeDataProvider<VerilogTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<VerilogTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // 解析结果缓存
    private moduleMap  : Map<string, ModuleDecl> = new Map(); // moduleName → decl
    private childMap   : Map<string, InstRef[]>  = new Map(); // moduleName → insts in that module
    private topModules : string[] = [];

    // 用户设置的顶层模块（可选）
    private userTopModule: string | null = null;

    constructor() { this.refresh(); }

    // 刷新树
    refresh(): void {
        const cfg           = vscode.workspace.getConfiguration('verilogFormatter');
        const excludeFolders: string[] = cfg.get('excludeFolders', ['ip', 'core', 'ipshared']);

        this.moduleMap.clear();
        this.childMap.clear();
        this.topModules = [];

        const files = scanWorkspace(excludeFolders);

        // 收集模块声明
        for (const f of files) {
            for (const m of f.modules) {
                this.moduleMap.set(m.name, m);
                if (!this.childMap.has(m.name)) {
                    this.childMap.set(m.name, []);
                }
            }
        }

        // 收集例化关系：每个文件内的例化归属到该文件中定义的第一个（或最近的）模块
        for (const f of files) {
            let currentModule: string | null = null;
            const text = (() => {
                try { return fs.readFileSync(f.filePath, 'utf8'); } catch { return ''; }
            })();
            const lines = text.split(/\r?\n/);

            for (let i = 0; i < lines.length; i++) {
                const t = lines[i].replace(/\/\/.*$/, '').trim();
                const mm = t.match(RE_MODULE);
                if (mm) { currentModule = mm[1]; continue; }
                if (/\bendmodule\b/.test(t)) { currentModule = null; continue; }

                if (currentModule) {
                    const im = t.match(RE_INST);
                    if (im && this.moduleMap.has(im[1]) && !KEYWORDS.has(im[1])) {
                        const list = this.childMap.get(currentModule) || [];
                        list.push({ typeName: im[1], instName: im[2], line: i });
                        this.childMap.set(currentModule, list);
                    }
                }
            }
        }

        // 找顶层：没有被任何模块例化的模块
        const instantiated = new Set<string>();
        for (const insts of this.childMap.values()) {
            for (const inst of insts) { instantiated.add(inst.typeName); }
        }
        this.topModules = [...this.moduleMap.keys()].filter(m => !instantiated.has(m));
        if (this.topModules.length === 0) {
            this.topModules = [...this.moduleMap.keys()]; // fallback
        }

        this._onDidChangeTreeData.fire();
    }

    setTopModule(name: string): void {
        this.userTopModule = name;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: VerilogTreeItem): vscode.TreeItem { return element; }

    getChildren(element?: VerilogTreeItem): VerilogTreeItem[] {
        if (!element) {
            // 根节点：显示顶层模块
            const tops = this.userTopModule
                ? [this.userTopModule]
                : this.topModules;

            return tops.map(name => this.makeItem(name, '', -1, true));
        }

        // 子节点：显示该模块内的例化
        const insts = this.childMap.get(element.moduleName) || [];
        const seen  = new Set<string>(); // 避免循环引用造成无限递归
        seen.add(element.moduleName);

        return insts
            .filter(inst => this.moduleMap.has(inst.typeName) && !seen.has(inst.typeName))
            .map(inst => this.makeItem(inst.typeName, inst.instName, inst.line, true));
    }

    private makeItem(moduleName: string, instName: string, instLine: number, root: boolean): VerilogTreeItem {
        const decl      = this.moduleMap.get(moduleName);
        const hasChildren = (this.childMap.get(moduleName) || [])
            .some(c => this.moduleMap.has(c.typeName));
        const state     = hasChildren
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        return new VerilogTreeItem(
            moduleName,
            state,
            moduleName,
            decl ? decl.filePath : '',
            decl ? decl.line     : 0,
            instName,
        );
    }
}

/**
 * @brief 注册文件树视图和相关命令
 * @param context 扩展上下文
 * @return provider 实例（供外部调用 refresh）
 */
export function registerFileTree(context: vscode.ExtensionContext): VerilogFileTreeProvider {
    const provider = new VerilogFileTreeProvider();

    const treeView = vscode.window.createTreeView('verilogFileTree', {
        treeDataProvider: provider,
        showCollapseAll : true,
    });

    context.subscriptions.push(treeView);

    // 刷新命令
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.refreshFileTree', () => provider.refresh()),
    );

    // 设置顶层模块
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.setTopModule', async () => {
            const names = [...(provider as any).moduleMap.keys()] as string[];
            const pick  = await vscode.window.showQuickPick(names, {
                placeHolder: '选择 FPGA 顶层模块',
            });
            if (pick) { provider.setTopModule(pick); }
        }),
    );

    return provider;
}
