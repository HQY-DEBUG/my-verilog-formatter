// 基于 indent-rainbow v8.3.1，Copyright (c) 2016 Hans Raaf，MIT 许可证见 ../LICENSE.txt。
// 本地适配：保留全部设置及着色方式，修复正则循环、配置更新和资源释放，支持可见分屏。
import * as vscode from 'vscode';

const defaultColors = [
    'rgba(255,255,64,0.07)', 'rgba(127,255,127,0.07)',
    'rgba(255,127,255,0.07)', 'rgba(79,236,236,0.07)',
];
let session: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
    deactivate();
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let decorations: vscode.TextEditorDecorationType[] = [];
    let colorTypes: vscode.TextEditorDecorationType[] = [];
    let errorType: vscode.TextEditorDecorationType;
    let tabmixType: vscode.TextEditorDecorationType | undefined;
    let ignorePatterns: RegExp[] = [];
    let configuration: vscode.WorkspaceConfiguration;
    const listeners: vscode.Disposable[] = [];

    function readConfiguration(): void {
        decorations.forEach(type => type.dispose());
        decorations = [];
        configuration = vscode.workspace.getConfiguration('indentRainbow');
        const configuredColors = configuration.get<string[]>('colors', defaultColors);
        const colors = configuredColors.length ? configuredColors : defaultColors;
        const style = configuration.get<string>('indicatorStyle', 'classic');
        const lineWidth = configuration.get<number>('lightIndicatorStyleLineWidth', 1);
        colorTypes = colors.map(color => vscode.window.createTextEditorDecorationType(style === 'light' ? {
            borderStyle: 'solid', borderColor: color, borderWidth: `0 0 0 ${lineWidth}px`,
        } : { backgroundColor: color }));
        errorType = vscode.window.createTextEditorDecorationType({
            backgroundColor: configuration.get<string>('errorColor', 'rgba(128,32,32,0.6)'),
        });
        const tabmixColor = configuration.get<string>('tabmixColor', 'rgba(128,32,96,0.6)');
        tabmixType = tabmixColor ? vscode.window.createTextEditorDecorationType({ backgroundColor: tabmixColor }) : undefined;
        decorations.push(...colorTypes, errorType);
        if (tabmixType) { decorations.push(tabmixType); }

        ignorePatterns = [];
        for (const pattern of configuration.get<string[]>('ignoreLinePatterns', ['/[ \\t]* [*]/g', '/[ \\t]+[/]{2}/g'])) {
            try {
                const parts = pattern.match(/^\/(.*)\/([a-z]*)$/);
                const source = parts ? parts[1] : pattern;
                let flags = parts ? parts[2] : '';
                // 全文扫描必须推进；不带 g 的正则同样需要匹配后续行。
                if (!flags.includes('g')) { flags += 'g'; }
                ignorePatterns.push(new RegExp(source, flags));
            } catch (error) {
                void vscode.window.showWarningMessage(`indentRainbow.ignoreLinePatterns 中的正则无效：${pattern}（${String(error)}）`);
            }
        }
    }

    function updateEditor(editor: vscode.TextEditor): void {
        const language = editor.document.languageId;
        const included = configuration.get<string[]>('includedLanguages', []);
        const excluded = configuration.get<string[]>('excludedLanguages', ['plaintext']);
        if ((included.length && !included.includes(language)) || excluded.includes(language)) {
            decorations.forEach(type => editor.setDecorations(type, []));
            return;
        }

        const tabSizeValue = Number(editor.options.tabSize);
        const tabSize = Number.isInteger(tabSizeValue) && tabSizeValue > 0 ? tabSizeValue : 4;
        const ignoredLanguages = configuration.get<string[]>('ignoreErrorLanguages', ['markdown']);
        const skipErrors = ignoredLanguages.includes('*') || ignoredLanguages.includes(language);
        const whitespaceOnly = configuration.get<boolean>('colorOnWhiteSpaceOnly', false);
        const text = editor.document.getText();
        const ignoredLines = new Set<number>();
        if (!skipErrors) {
            for (const pattern of ignorePatterns) {
                pattern.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = pattern.exec(text)) !== null) {
                    ignoredLines.add(editor.document.positionAt(match.index).line);
                    if (match[0].length === 0) {
                        // Unicode 正则需跨过整个码点，避免在代理项中间反复命中。
                        const codePoint = text.codePointAt(pattern.lastIndex);
                        const unicodeMode = pattern.unicode || pattern.flags.includes('v');
                        pattern.lastIndex += unicodeMode && codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
                    }
                }
            }
        }

        const levels: vscode.Range[][] = colorTypes.map(() => []);
        const errors: vscode.Range[] = [];
        const mixed: vscode.Range[] = [];
        const indentation = /^[\t ]+/gm;
        let match: RegExpExecArray | null;
        while ((match = indentation.exec(text)) !== null) {
            const start = match.index;
            const indent = match[0];
            const line = editor.document.positionAt(start).line;
            const skip = skipErrors || ignoredLines.has(line);
            const width = indent.replace(/\t/g, ' '.repeat(tabSize)).length;
            if (!skip && width % tabSize !== 0) {
                errors.push(new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(start + indent.length)));
                continue;
            }

            const mixedIndent = !skip && tabmixType && indent.includes('\t') && indent.includes(' ');
            let offset = 0;
            let level = 0;
            while (offset < indent.length) {
                const from = offset;
                offset += indent[offset] === '\t' ? 1 : tabSize;
                if (whitespaceOnly) { offset = Math.min(offset, indent.length); }
                const range = new vscode.Range(editor.document.positionAt(start + from), editor.document.positionAt(start + offset));
                if (mixedIndent) { mixed.push(range); }
                else { levels[level % levels.length].push(range); }
                level++;
            }
        }
        colorTypes.forEach((type, index) => editor.setDecorations(type, levels[index]));
        editor.setDecorations(errorType, errors);
        if (tabmixType) { editor.setDecorations(tabmixType, mixed); }
    }

    function scheduleUpdate(): void {
        if (disposed) { return; }
        if (timeout !== undefined) { clearTimeout(timeout); }
        timeout = setTimeout(() => {
            timeout = undefined;
            for (const editor of vscode.window.visibleTextEditors) { updateEditor(editor); }
        }, configuration.get<number>('updateDelay', 100));
    }

    // 同时支持宿主 subscriptions 释放和显式 deactivate，两条路径均只清理一次。
    session = new vscode.Disposable(() => {
        if (disposed) { return; }
        disposed = true;
        if (timeout !== undefined) { clearTimeout(timeout); timeout = undefined; }
        listeners.forEach(listener => listener.dispose());
        decorations.forEach(type => type.dispose());
    });
    context.subscriptions.push(session);
    readConfiguration();
    listeners.push(
        vscode.window.onDidChangeActiveTextEditor(scheduleUpdate),
        vscode.window.onDidChangeVisibleTextEditors(scheduleUpdate),
        vscode.window.onDidChangeTextEditorOptions(scheduleUpdate),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (vscode.window.visibleTextEditors.some(editor => editor.document === event.document)) { scheduleUpdate(); }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('indentRainbow')) { readConfiguration(); scheduleUpdate(); }
        }),
    );
    scheduleUpdate();
}

export function deactivate(): void {
    session?.dispose();
    session = undefined;
}
