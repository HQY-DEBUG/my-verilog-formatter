// 文件：smoke-tcl.cjs；描述：真实 VS Code 中的 Tcl 导航与编辑验证。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 新增大纲、跨文件跳转、悬停、折叠及未保存文档验证。
const assert = require('assert');
const fs = require('fs');
const vscode = require('vscode');

// 2026/09/21 新增：通过公开 Provider 命令验证实际宿主行为。
exports.run = async () => {
    const checks = [];
    const report = process.env.TCL_SMOKE_REPORT;
    const command = (id, ...args) => vscode.commands.executeCommand(id, ...args);
    try {
        const extension = vscode.extensions.getExtension('hanxuyao.hanxuyao-plugin');
        assert(extension);
        await extension.activate();
        const folder = vscode.workspace.workspaceFolders[0].uri;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'main.tcl'));
        await vscode.window.showTextDocument(doc);
        assert.strictEqual(doc.languageId, 'tcl');
        const symbols = await command('vscode.executeDocumentSymbolProvider', doc.uri);
        const run = symbols.find(item => item.name === 'run');
        assert(run && run.range.end.line === 5);
        checks.push('Tcl 语言识别、大纲及粘性滚动符号范围');
        const definitions = await command('vscode.executeDefinitionProvider', doc.uri, new vscode.Position(6, 1));
        assert(definitions.some(item => (item.uri || item.targetUri).toString() === doc.uri.toString()));
        const remote = await command('vscode.executeDefinitionProvider', doc.uri, new vscode.Position(7, 9));
        assert(remote.some(item => (item.uri || item.targetUri).path.endsWith('/library.tcl')));
        checks.push('当前文档与跨文件命名空间定义跳转');
        const hover = await command('vscode.executeHoverProvider', doc.uri, new vscode.Position(6, 1));
        assert(hover.some(item => item.contents.some(content => content.value.includes('过程说明'))));
        const folds = await command('vscode.executeFoldingRangeProvider', doc.uri);
        assert(folds.some(item => item.start === 1 && item.end >= 4));
        checks.push('过程悬停文档与转义花括号折叠');
        const unsaved = await vscode.workspace.openTextDocument({ language: 'tcl', content: 'proc buffer_only {} { return 1 }; buffer_only\nbuffer_only' });
        await vscode.window.showTextDocument(unsaved);
        const local = await command('vscode.executeDefinitionProvider', unsaved.uri, new vscode.Position(1, 3));
        assert(local.some(item => (item.uri || item.targetUri).toString() === unsaved.uri.toString()));
        const localSymbols = await command('vscode.executeDocumentSymbolProvider', unsaved.uri);
        assert(localSymbols.some(item => item.name === 'buffer_only'));
        checks.push('未保存缓冲区导航及单行过程大纲');
        fs.writeFileSync(report, JSON.stringify({ passed: true, checks }, null, 2));
    } catch (error) {
        fs.writeFileSync(report, JSON.stringify({ passed: false, checks, error: String(error.stack || error) }, null, 2));
        throw error;
    }
};
