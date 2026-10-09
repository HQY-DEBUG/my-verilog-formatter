// 为插件菜单提供中文命令入口，折叠范围和视图操作交由 VS Code 原生命令处理。
import * as vscode from 'vscode';

export function registerFoldingCommands(context: vscode.ExtensionContext): void {
    const commands = [
        ['verilogFormatter.fold', 'editor.fold'],
        ['verilogFormatter.unfold', 'editor.unfold'],
        ['verilogFormatter.foldAll', 'editor.foldAll'],
        ['verilogFormatter.unfoldAll', 'editor.unfoldAll'],
    ] as const;
    for (const [command, nativeCommand] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(command,
            () => vscode.commands.executeCommand(nativeCommand)));
    }
}
