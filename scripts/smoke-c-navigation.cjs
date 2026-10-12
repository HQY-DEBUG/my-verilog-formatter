// 在隔离 VS Code 宿主中验证真实 app_platform 文件副本的 C 函数跳转，不修改原工程。
const assert = require('assert');
const fs = require('fs');
const vscode = require('vscode');

exports.run = async () => {
    const checks = [];
    try {
        const extension = vscode.extensions.getExtension('hanxuyao.hanxuyao-plugin');
        await extension.activate();
        const folder = vscode.workspace.workspaceFolders[0].uri;
        const header = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'app_platform.h'));
        const sourceUri = vscode.Uri.joinPath(folder, 'app_platform.c');
        const editor = await vscode.window.showTextDocument(header);
        const position = header.positionAt(header.getText().indexOf('platform_fault_stop') + 3);
        editor.selection = new vscode.Selection(position, position);
        const locations = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', header.uri, position);
        assert.strictEqual(locations.length, 1);
        assert.strictEqual(locations[0].uri.toString(), sourceUri.toString());
        assert.strictEqual(locations[0].range.start.line, 214);
        checks.push('真实头文件第 86 行通过标准定义查询定位到 C 文件第 215 行');

        await vscode.commands.executeCommand('verilogFormatter.c.goToFunction');
        const target = vscode.window.activeTextEditor;
        assert.strictEqual(target.document.uri.toString(), sourceUri.toString());
        assert.strictEqual(target.selection.start.line, 214);
        assert.strictEqual(target.document.getText(target.selection), 'platform_fault_stop');
        assert.strictEqual(target.document.isDirty, false);
        checks.push('独立命令实际打开 C 文件并选中函数名，源码保持未修改');

        const edit = new vscode.WorkspaceEdit();
        edit.insert(sourceUri, new vscode.Position(0, 0), '// 未保存缓冲区验证\n');
        assert(await vscode.workspace.applyEdit(edit));
        const moved = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', header.uri, position);
        assert.strictEqual(moved[0].range.start.line, 215);
        checks.push('未保存缓冲区修改后跳转位置即时更新');

        await vscode.workspace.getConfiguration('verilogFormatter.c', header.uri).update('functionNavigation', false, vscode.ConfigurationTarget.Workspace);
        assert.deepStrictEqual(await vscode.commands.executeCommand('vscode.executeDefinitionProvider', header.uri, position), []);
        checks.push('关闭配置后停止返回 C 函数导航结果');
        fs.writeFileSync(process.env.C_NAVIGATION_SMOKE_REPORT, JSON.stringify({ passed: true, checks }, null, 2));
    } catch (error) {
        fs.writeFileSync(process.env.C_NAVIGATION_SMOKE_REPORT, JSON.stringify({ passed: false, checks, error: String(error.stack || error) }, null, 2));
        throw error;
    }
};
