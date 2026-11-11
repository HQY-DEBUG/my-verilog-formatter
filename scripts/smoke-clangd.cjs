// 在隔离 VS Code 宿主中验证内置 clangd 的类型跳转和成员补全。
const assert = require('assert');
const fs = require('fs');
const vscode = require('vscode');

exports.run = async () => {
    const report = process.env.CLANGD_SMOKE_REPORT;
    const checks = [];
    try {
        const extension = vscode.extensions.getExtension('hanxuyao.hanxuyao-plugin');
        assert(extension, '未发现待测扩展');
        await extension.activate();
        assert(!vscode.extensions.getExtension('ms-vscode.cpptools')?.isActive, '外部 C/C++ 扩展不应运行');
        assert(!vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd')?.isActive, '外部 clangd 扩展不应运行');
        for (const file of [process.env.CLANGD_SMOKE_FILE, process.env.CLANGD_SMOKE_CPP]) {
            const uri = vscode.Uri.file(file);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            assert.strictEqual(vscode.workspace.getConfiguration('editor', document).get('wordBasedSuggestions'), 'off');
            const line = document.lineAt(2).text;
            const position = new vscode.Position(2, line.indexOf('g_mtd_status.') + 'g_mtd_status.'.length);
            let labels = [];
            for (let attempt = 0; attempt < 100; attempt++) {
                const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, position, '.');
                labels = (result?.items ?? []).map(item => typeof item.label === 'string' ? item.label.trim() : item.label.label.trim());
                if (labels.includes('curr_x') && labels.includes('curr_y')) { break; }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            assert(labels.includes('curr_x') && labels.includes('curr_y'), `成员补全失败：${labels.join(', ')}`);
            assert(!labels.includes('g_mtd_status'), '成员补全混入全局变量');
            checks.push(`${document.languageId} 结构体成员补全`);
            const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', uri, { tabSize: 4, insertSpaces: true });
            assert(edits?.length, '插件内置 C/C++ 格式化未返回修改');
            let formatted = document.getText();
            for (const edit of [...edits].sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start))) {
                formatted = formatted.slice(0, document.offsetAt(edit.range.start)) + edit.newText + formatted.slice(document.offsetAt(edit.range.end));
            }
            assert(formatted.includes('void run(void) {\n    g_mtd_status.'), `插件格式化规则未应用：${formatted}`);
            checks.push(`${document.languageId} 内置格式化`);
            editor.selection = new vscode.Selection(1, 3, 1, 3);
            await vscode.commands.executeCommand('verilogFormatter.c.goToFunction');
            assert.strictEqual(vscode.window.activeTextEditor.document.uri.fsPath.toLowerCase(), process.env.CLANGD_SMOKE_HEADER.toLowerCase(), 'F4 未跳转至头文件');
            assert.strictEqual(vscode.window.activeTextEditor.selection.active.line, 0, 'F4 未跳转至类型定义');
            checks.push(`${document.languageId} 跨文件类型定义跳转`);
        }
        fs.writeFileSync(report, JSON.stringify({ ok: true, checks }, null, 2));
    } catch (error) {
        fs.writeFileSync(report, JSON.stringify({ ok: false, checks, error: error.stack || String(error) }, null, 2));
        throw error;
    }
};
