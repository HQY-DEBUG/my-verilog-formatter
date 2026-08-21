// =========================================================================
// 文件    : extension.ts
// 描述    : VS Code 扩展入口，注册所有 Provider 和命令
// 版本    : v1.2.1
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.2.1  2026/08/21  使用插件专用命令执行快捷键格式化
//  v1.1.0  2026/08/21  注册 C/C++ 格式化器并扩展保存时格式化范围
//  v0.2.0  2026/05/25  新增文件树、例化、跳转、悬停、语法检查、UCF转XDC、数字编辑
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';
import { CFormatter }                from './features/c/cFormatter';
import { VerilogFormatter }          from './features/verilog/formatter';
import { AdcFormatter }              from './features/verilog/adcFormatter';
import { registerInstantiatorCommands } from './features/verilog/instantiator';
import { registerFileTree }          from './features/verilog/fileTree';
import { registerSymbolProviders }   from './features/verilog/symbolProvider';
import { registerLinter }            from './features/verilog/linter';
import { registerUcfToXdcCommand }   from './features/verilog/ucfToXdc';
import { registerNumberEditCommands } from './features/verilog/numberEdit';
import { registerCompletionProvider } from './features/verilog/completionProvider';
import { TodoTreeProvider }  from './features/todo/todoTreeProvider';
import { TodoDecorator }     from './features/todo/todoDecorator';
import { TodoStatusBar }     from './features/todo/todoStatusBar';

export const VERILOG_LANGS = ['verilog', 'systemverilog', 'verilog-hdl', 'systemverilog-hdl'];
export const C_LANGS = ['c', 'cpp'];

export function activate(context: vscode.ExtensionContext): void {
    const formatter = new VerilogFormatter();
    const cFormatter = new CFormatter();
    const adcFormatter = new AdcFormatter();

    // ---- 格式化 ----//
    for (const lang of VERILOG_LANGS) {
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider({ language: lang }, formatter),
            vscode.languages.registerDocumentRangeFormattingEditProvider({ language: lang }, formatter),
        );
    }
    for (const lang of C_LANGS) {
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider({ language: lang }, cFormatter),
            vscode.languages.registerDocumentRangeFormattingEditProvider({ language: lang }, cFormatter),
        );
    }
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider({ language: 'anlogic-adc' }, adcFormatter),
        vscode.languages.registerDocumentRangeFormattingEditProvider({ language: 'anlogic-adc' }, adcFormatter),
    );

    // ---- 插件专用格式化命令，避免被其他语言的默认 formatter 截获 ----//
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.formatDocument', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const document = editor.document;
            const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 2;
            const insertSpaces = typeof editor.options.insertSpaces === 'boolean'
                ? editor.options.insertSpaces
                : true;
            const options: vscode.FormattingOptions = { tabSize, insertSpaces };
            let edits: vscode.TextEdit[] = [];

            if (C_LANGS.includes(document.languageId)) {
                edits = cFormatter.provideDocumentFormattingEdits(document);
            } else if (VERILOG_LANGS.includes(document.languageId)) {
                edits = formatter.provideDocumentFormattingEdits(document, options);
            } else if (document.languageId === 'anlogic-adc') {
                edits = adcFormatter.provideDocumentFormattingEdits(document);
            }

            if (edits.length === 0) { return; }
            const applied = await editor.edit(builder => {
                for (const edit of edits) {
                    builder.replace(edit.range, edit.newText);
                }
            });
            if (!applied) {
                vscode.window.showWarningMessage('hanxuyao-plugin：格式化修改未能应用。');
            }
        }),
    );

    // ---- 保存时自动格式化 ----//
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async doc => {
            const cfg = vscode.workspace.getConfiguration('verilogFormatter');
            if (!cfg.get<boolean>('formatOnSave', false)) { return; }
            if (!VERILOG_LANGS.includes(doc.languageId)
                && !C_LANGS.includes(doc.languageId)
                && doc.languageId !== 'anlogic-adc') { return; }
            await vscode.commands.executeCommand('editor.action.formatDocument', doc.uri);
        }),
    );

    // ---- 一键例化 / TB ----//
    registerInstantiatorCommands(context);

    // ---- 文件树 ----//
    registerFileTree(context);

    // ---- 语法跳转 + 悬停（返回共享索引）----//
    const symbolIndex = registerSymbolProviders(context);

    // ---- 代码补全 ----//
    registerCompletionProvider(context, symbolIndex);

    // ---- 语法检查 ----//
    registerLinter(context);

    // ---- UCF → XDC ----//
    registerUcfToXdcCommand(context);

    // ---- 数字递增/递减 ----//
    registerNumberEditCommands(context);

    // ---- TODO 树视图 ----//
    const todoProvider  = new TodoTreeProvider(context);
    const todoDecorator = new TodoDecorator(context);
    const todoStatusBar = new TodoStatusBar();
    const todoLog       = vscode.window.createOutputChannel('TODO Tree');

    // 注册树视图
    const todoTreeView = vscode.window.createTreeView('verilogTodoTree', {
        treeDataProvider: todoProvider,
        showCollapseAll : true,
    });
    context.subscriptions.push(todoTreeView, todoStatusBar, todoDecorator, todoLog);

    // 注册专用跳转命令（比 vscode.open 更可靠，且能正确处理 Unicode 列偏移）
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'verilogFormatter.todo.revealItem',
            async (file: string, line: number, charCol: number) => {
                try {
                    const uri = vscode.Uri.file(file);
                    const pos = new vscode.Position(line, charCol);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, {
                        selection     : new vscode.Range(pos, pos),
                        preserveFocus : false,
                    });
                } catch (e: any) {
                    vscode.window.showErrorMessage(`TODO: 跳转失败 — ${e.message}`);
                }
            },
        ),
    );

    // 初始全量扫描
    todoProvider.refresh()
        .then(() => {
            const count = todoProvider.getTotalCount();
            todoStatusBar.update(count);
            todoLog.appendLine(`[扫描完成] 共找到 ${count} 条 TODO`);
            todoProvider.getItems().forEach(i =>
                todoLog.appendLine(`  [${i.tag}] ${i.file}:${i.line + 1}:${i.charCol}`));
            if (vscode.window.activeTextEditor) {
                todoDecorator.apply(vscode.window.activeTextEditor, todoProvider.getItems());
            }
        })
        .catch((err: Error) => {
            vscode.window.showErrorMessage(`TODO Tree: 扫描失败 — ${err.message}`);
            todoLog.appendLine(`[ERROR] ${err.message}\n${err.stack}`);
        });

    // 保存时增量更新
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async doc => {
            await todoProvider.refreshFile(doc.uri.fsPath);
            todoStatusBar.update(todoProvider.getTotalCount());
            if (vscode.window.activeTextEditor?.document === doc) {
                todoDecorator.apply(vscode.window.activeTextEditor, todoProvider.getItems());
            }
        }),
    );

    // 文件创建/删除时全量重扫
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(async () => {
            await todoProvider.refresh();
            todoStatusBar.update(todoProvider.getTotalCount());
        }),
        vscode.workspace.onDidDeleteFiles(async () => {
            await todoProvider.refresh();
            todoStatusBar.update(todoProvider.getTotalCount());
        }),
    );

    // 切换编辑器时更新高亮
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                todoDecorator.apply(editor, todoProvider.getItems());
            }
        }),
    );

    // ---- TODO 命令 ----//
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.todo.refresh', async () => {
            await todoProvider.refresh();
            todoStatusBar.update(todoProvider.getTotalCount());
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.setViewTree', () => todoProvider.setViewMode('tree')),
        vscode.commands.registerCommand('verilogFormatter.todo.setViewFlat', () => todoProvider.setViewMode('flat')),
        vscode.commands.registerCommand('verilogFormatter.todo.setViewTags', () => todoProvider.setViewMode('tags')),

        vscode.commands.registerCommand('verilogFormatter.todo.filterClear', () => {
            todoProvider.setFilter('');
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.collapseAll', () => {
            vscode.commands.executeCommand('workbench.actions.treeView.verilogTodoTree.collapseAll');
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.hidePath', (node: any) => {
            if (node?.filePath) { todoProvider.hidePath(node.filePath); }
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.resetPathFilter', () => {
            todoProvider.resetPathFilter();
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.addTag', async () => {
            const tag = await vscode.window.showInputBox({ prompt: '输入新标签关键字（如 BUG）', placeHolder: 'TAG' });
            if (!tag) { return; }
            const cfg  = vscode.workspace.getConfiguration('verilogFormatter.todo');
            const tags = cfg.get<string[]>('tags', ['TODO', 'FIXME', 'NOTE', 'HACK']);
            if (!tags.includes(tag.toUpperCase())) {
                await cfg.update('tags', [...tags, tag.toUpperCase()], vscode.ConfigurationTarget.Workspace);
                await todoProvider.refresh();
                todoStatusBar.update(todoProvider.getTotalCount());
            }
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.removeTag', async () => {
            const cfg  = vscode.workspace.getConfiguration('verilogFormatter.todo');
            const tags = cfg.get<string[]>('tags', ['TODO', 'FIXME', 'NOTE', 'HACK']);
            const pick = await vscode.window.showQuickPick(tags, { placeHolder: '选择要删除的标签' });
            if (!pick) { return; }
            await cfg.update('tags', tags.filter(t => t !== pick), vscode.ConfigurationTarget.Workspace);
            await todoProvider.refresh();
            todoStatusBar.update(todoProvider.getTotalCount());
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.goToNext', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const fsPath = editor.document.uri.fsPath.toLowerCase();
            const items: any[] = todoProvider.getItems();
            const fileItems = items
                .filter((i: any) => i.file.toLowerCase() === fsPath)
                .sort((a: any, b: any) => a.line - b.line);
            if (!fileItems.length) { return; }
            const curLine = editor.selection.active.line;
            const next    = fileItems.find((i: any) => i.line > curLine) ?? fileItems[0];
            const pos     = new vscode.Position(next.line, next.charCol ?? next.col);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }),

        // 诊断命令：显示当前扫描状态
        vscode.commands.registerCommand('verilogFormatter.todo.diagnose', async () => {
            const cfg     = vscode.workspace.getConfiguration('verilogFormatter.todo');
            const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
            const tags    = cfg.get<string[]>('tags', ['TODO', 'FIXME', 'NOTE', 'HACK']);
            const items   = todoProvider.getItems();
            const msg = [
                `工作区目录: ${folders.join(', ') || '（无）'}`,
                `监听标签: ${tags.join(', ')}`,
                `已扫描 TODO: ${items.length} 条`,
                items.length > 0 ? `示例: ${items[0].tag} @ ${items[0].file}:${items[0].line + 1}` : '',
            ].filter(Boolean).join('\n');
            vscode.window.showInformationMessage(msg, { modal: true });
        }),

        vscode.commands.registerCommand('verilogFormatter.todo.goToPrevious', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const fsPath = editor.document.uri.fsPath.toLowerCase();
            const items: any[] = todoProvider.getItems();
            const fileItems = items
                .filter((i: any) => i.file.toLowerCase() === fsPath)
                .sort((a: any, b: any) => a.line - b.line);
            if (!fileItems.length) { return; }
            const curLine = editor.selection.active.line;
            const prev    = [...fileItems].reverse().find((i: any) => i.line < curLine) ?? fileItems[fileItems.length - 1];
            const pos     = new vscode.Position(prev.line, prev.charCol ?? prev.col);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        }),
    );
}

export function deactivate(): void {
    // 清理工作（当前无需处理）
}
