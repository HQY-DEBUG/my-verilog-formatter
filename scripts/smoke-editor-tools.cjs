// 文件：smoke-editor-tools.cjs；描述：真实 VS Code 扩展宿主中的高亮与 CSV 验证。
// 版本：v1.0；日期：2026/09/21
// 修改记录：v1.0 2026/09/21 新增命令、CSV 编辑和 Webview 双引擎查询检查。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

// 2026/09/21 新增：等待 Webview 与语言服务异步完成，并记录明确超时原因。
async function waitFor(check, label, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('等待超时：' + label);
}

exports.run = async () => {
    const checks = [];
    const report = process.env.EDITOR_TOOLS_SMOKE_REPORT;
    const record = value => {
        checks.push(value);
        fs.writeFileSync(report, JSON.stringify({ passed: false, running: true, checks }, null, 2));
    };
    const extension = vscode.extensions.getExtension('hanxuyao.hanxuyao-plugin');
    const folder = vscode.workspace.workspaceFolders[0].uri;
    const command = (id, ...args) => vscode.commands.executeCommand(id, ...args);
    try {
        assert(extension, '宿主插件未加载');
        await extension.activate();
        const commands = await vscode.commands.getCommands(true);
        for (const name of ['highlight-words', 'rainbow-csv']) {
            const manifest = require(path.join(extension.extensionPath, 'vendor', name, 'package.json'));
            for (const entry of manifest.contributes.commands) assert(commands.includes(entry.command), entry.command);
        }
        record('全部 35 个公开命令注册');
        const text = await vscode.workspace.openTextDocument({ content: 'signal SIGNAL signal_next signal', language: 'plaintext' });
        const editor = await vscode.window.showTextDocument(text);
        editor.selection = new vscode.Selection(0, 0, 0, 6);
        await command('highlightwords.addHighlight');
        await command('hilightWordsExplore.focus');
        await command('highlightwords.findNext', { highlight: { expression: 'signal', wholeWord: true, ignoreCase: false } });
        assert.strictEqual(editor.selection.active.character, 26);
        await command('highlightwords.findNext', { highlight: { expression: 'signal', wholeWord: true, ignoreCase: false } });
        assert.strictEqual(editor.selection.active.character, 0);
        await command('highlightwords.removeAllHighlights');
        record('真实词语高亮、侧栏和回绕导航');

        const uri = vscode.Uri.joinPath(folder, 'table.csv');
        const csv = await vscode.workspace.openTextDocument(uri);
        let csvEditor = await vscode.window.showTextDocument(csv);
        assert.strictEqual(csv.languageId, 'csv');
        assert((await command('rainbow-csv.CSVLint')).is_ok);
        const hover = await command('vscode.executeHoverProvider', uri, new vscode.Position(1, 2));
        assert(hover.length > 0);
        await command('rainbow-csv.GoToColumn', { target_column: 2 });
        await command('rainbow-csv.ColumnEditSelect');
        assert(csvEditor.selections.length >= 3);
        await command('rainbow-csv.ToggleColumnTracking');
        await command('rainbow-csv.ToggleRowBackground');
        const original = csv.getText();
        await command('rainbow-csv.Align');
        assert.notStrictEqual(csv.getText(), original);
        await command('rainbow-csv.Shrink');
        assert.strictEqual(csv.getText(), original);
        await command('rainbow-csv.VirtualAlign');
        assert.strictEqual(csv.getText(), original);
        await command('rainbow-csv.VirtualShrink');
        record('CSV 语言、校验、悬停、列编辑、跟踪、背景和两种对齐');

        // 2026/09/21 新增：通过上游 Webview 测试协议执行真实查询和资源加载。
        for (const [backend, query, expected] of [
            ['js', 'SELECT a1, a2 WHERE Number(a2) >= 2 ORDER BY Number(a2) DESC', '乙,3\n甲,2'],
            ['python', 'SELECT a1, int(a2) * 2 WHERE int(a2) >= 2', '甲,4\n乙,6'],
        ]) {
            csvEditor = await vscode.window.showTextDocument(csv);
            await csv.save();
            await command('rainbow-csv.RBQL', {
                rbql_backend: backend, rbql_query: query, with_headers: true,
                integration_test_delay: 500, python_cmd: process.env.EDITOR_TOOLS_PYTHON || 'python3',
            });
            await waitFor(() => {
                const active = vscode.window.activeTextEditor?.document;
                return active && active !== csv && active.getText().replace(/\r\n/g, '\n').includes(expected);
            }, `${backend} Webview 查询结果`);
            const result = await command('rainbow-csv.InternalTest', { check_last_rbql_report: true });
            assert(!result.error_type && !result.error_msg, JSON.stringify(result));
            record(`RBQL ${backend} Webview 查询及实际结果`);
            await command('workbench.action.closeActiveEditor');
            await command('workbench.action.closeActiveEditor');
        }

        const dynamic = await vscode.workspace.openTextDocument({ content: 'name,value\n"a\nb",2\nx,3', language: 'plaintext' });
        await vscode.window.showTextDocument(dynamic);
        await command('rainbow-csv.RainbowSeparator', { integration_test: true });
        await waitFor(() => dynamic.languageId === 'dynamic csv', '动态分隔符 Webview');
        assert((await command('rainbow-csv.CSVLint')).is_ok);
        const tokens = await command('vscode.provideDocumentRangeSemanticTokens', dynamic.uri, new vscode.Range(0, 0, 3, 4));
        assert(tokens?.data?.length > 0, '动态 CSV 语义高亮未返回结果');
        const multi = await vscode.workspace.openTextDocument({ content: 'name||value\nx||2\ny||3', language: 'plaintext' });
        const multiEditor = await vscode.window.showTextDocument(multi);
        multiEditor.selection = new vscode.Selection(0, 4, 0, 6);
        await command('rainbow-csv.RainbowSeparator', { integration_test: true });
        await waitFor(() => multi.languageId === 'dynamic csv', '多字符分隔符');
        assert((await command('rainbow-csv.CSVLint')).is_ok);
        record('动态分隔符 Webview、多字符分隔、多行字段及语义高亮');
        fs.writeFileSync(report, JSON.stringify({ passed: true, checks }, null, 2));
    } catch (error) {
        fs.writeFileSync(report, JSON.stringify({ passed: false, checks, error: String(error.stack || error) }, null, 2));
        throw error;
    }
};
