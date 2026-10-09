// 在隔离的 VS Code 测试宿主中验证折叠菜单及命令，确认只改变视图、不修改文档。
const assert = require('assert');
const fs = require('fs');
const vscode = require('vscode');

exports.run = async () => {
    const checks = [];
    const report = process.env.FOLDING_SMOKE_REPORT;
    let subscription;
    try {
        const extension = vscode.extensions.getExtension('hanxuyao.hanxuyao-plugin');
        assert(extension);
        await extension.activate();
        const contribution = extension.packageJSON.contributes;
        assert(contribution.submenus.some(item => item.id === 'verilogFormatter.codeFolding'));
        assert(contribution.menus['editor/context'].some(item => item.submenu === 'verilogFormatter.codeFolding' && item.when === 'foldingEnabled'));
        const commands = contribution.menus['verilogFormatter.codeFolding'].map(item => item.command);
        assert.deepStrictEqual(commands, ['verilogFormatter.fold', 'verilogFormatter.unfold', 'verilogFormatter.foldAll', 'verilogFormatter.unfoldAll']);
        assert(commands.every(command => contribution.commands.some(item => item.command === command)));
        const registered = await vscode.commands.getCommands(true);
        assert(commands.every(command => registered.includes(command)));
        checks.push('右键子菜单与四个插件命令已注册');

        const source = ['void first() {', '    if (ready) {', '        work();', '    }', '}', '',
            'void second() {', '    work();', '}', ''].join('\n');
        const document = await vscode.workspace.openTextDocument({ language: 'cpp', content: source });
        const editor = await vscode.window.showTextDocument(document);
        const version = document.version;
        const dirty = document.isDirty;
        let changes = 0;
        subscription = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === document) { changes++; }
        });
        const select = line => { editor.selection = new vscode.Selection(line, 0, line, 0); };
        const nextLine = async line => {
            select(line);
            await vscode.commands.executeCommand('cursorDown');
            return editor.selection.active.line;
        };
        // 等待首次折叠模型就绪；不向测试文档插入 region 标记或改写缩进。
        let ready = false;
        for (let attempt = 0; attempt < 40; attempt++) {
            select(0);
            await vscode.commands.executeCommand('verilogFormatter.fold');
            if (await nextLine(0) > 1) { ready = true; break; }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert(ready, '当前代码块未折叠');
        assert.strictEqual(await nextLine(6), 7, '当前块折叠不应同时折叠其他函数');
        select(0);
        await vscode.commands.executeCommand('verilogFormatter.unfold');
        assert.strictEqual(await nextLine(0), 1);
        checks.push('当前代码块折叠与展开');

        await vscode.commands.executeCommand('verilogFormatter.foldAll');
        assert(await nextLine(0) > 1);
        assert(await nextLine(6) > 7);
        await vscode.commands.executeCommand('verilogFormatter.unfoldAll');
        assert.strictEqual(await nextLine(0), 1);
        assert.strictEqual(await nextLine(6), 7);
        checks.push('全部折叠与全部展开');
        assert.strictEqual(document.getText(), source);
        assert.strictEqual(document.version, version);
        assert.strictEqual(document.isDirty, dirty);
        assert.strictEqual(changes, 0);
        checks.push('文档内容、版本、修改状态保持不变');
        fs.writeFileSync(report, JSON.stringify({ passed: true, checks }, null, 2));
    } catch (error) {
        fs.writeFileSync(report, JSON.stringify({ passed: false, checks, error: String(error.stack || error) }, null, 2));
        throw error;
    } finally {
        subscription?.dispose();
    }
};
