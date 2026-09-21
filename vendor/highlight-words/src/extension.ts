'use strict';
import { commands, ExtensionContext, window, workspace, Position, Selection, Range } from 'vscode';
import HighlightConfig from './config'
import Highlight from './highlight'

export function activate(context: ExtensionContext) {
    // 2026/09/21 修改：统一释放命令、装饰器、树视图与延时任务。
    let highlight = new Highlight()
    context.subscriptions.push(highlight)
    const registerCommand = (name, handler) => context.subscriptions.push(commands.registerCommand(name, handler))
    let configValues

    registerCommand('highlightwords.addRegExpHighlight', function () {
        window.showInputBox({ prompt: 'Enter expression' })
            .then(word => {
                highlight.addRegExp(word)
            });
    });

    registerCommand('highlightwords.addHighlight', function () {
        highlight.addSelected()
    });

    registerCommand('highlightwords.addHighlightWithOptions', function () {
        highlight.addSelected(true)
    });

    registerCommand('highlightwords.removeHighlight', function () {
        window.showQuickPick(highlight.getWords().concat([{ expression: '* All *', wholeWord: false, ignoreCase: false }]).map(w => {
            return {
                label: w.expression,
                description: (w.ignoreCase ? 'i' : '') + (w.wholeWord ? 'w' : ''),
                detail: ''
            }
        }))
            .then(word => {
                highlight.remove(word)
            })
    });

    registerCommand('highlightwords.treeRemoveHighlight', e => {
        highlight.remove(e)
    })

    registerCommand('highlightwords.treeHighlightOptions', e => {
        highlight.updateOptions(e.label)
    })

    registerCommand('highlightwords.removeAllHighlights', function () {
        highlight.clearAll()
    });

    registerCommand('highlightwords.toggleSidebar', function () {
        configValues.showSidebar = !configValues.showSidebar
        commands.executeCommand('setContext', 'showSidebar', configValues.showSidebar)
    });

    registerCommand('highlightwords.setHighlightMode', function () {
        const modes = ['Default', 'Whole Word', 'Ignore Case', 'Both'].map((s, i) => highlight.getMode() == i ? s+' ✅' : s)
        window.showQuickPick(modes).then(option => {
            if (typeof option == 'undefined') return;

            highlight.setMode(modes.indexOf(option)) 
        })
    })
    
    // 2026/09/21 修改：从当前文档匹配列表导航，支持回绕、多行和无匹配场景。
    registerCommand('highlightwords.findNext', e => highlight.navigate(e, 1));
    registerCommand('highlightwords.findPrevious', e => highlight.navigate(e, -1));

    updateConfig()

    function updateConfig() {
        configValues = HighlightConfig.getConfigValues()
        highlight.setDecorators(configValues.decorators)
        highlight.setMode(configValues.defaultMode)
        highlight.updateDecorations()
        commands.executeCommand('setContext', 'showSidebar', configValues.showSidebar)
    }

    let activeEditor = window.activeTextEditor;
    if (activeEditor) {
        triggerUpdateDecorations();
    }

    context.subscriptions.push(workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('highlightwords')) updateConfig()
    }))
    context.subscriptions.push(window.onDidChangeActiveTextEditor(() => highlight.updateDecorations()))

    window.onDidChangeVisibleTextEditors(function (editor) {
        highlight.updateDecorations();
    }, null, context.subscriptions);

    workspace.onDidChangeTextDocument(function (event) {
        activeEditor = window.activeTextEditor;
        if (window.visibleTextEditors.some(editor => editor.document === event.document)) {
            triggerUpdateDecorations();
        }
    }, null, context.subscriptions);

    var timeout: ReturnType<typeof setTimeout> = null;
    context.subscriptions.push({ dispose: () => { if (timeout) clearTimeout(timeout) } });
    function triggerUpdateDecorations() {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            highlight.updateDecorations()
        }, 500);
    }

}

// this method is called when your extension is deactivated
export function deactivate() {
}