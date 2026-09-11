const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

async function waitFor(check, label, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) { return; }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('等待超时：' + label);
}

exports.run = async () => {
    const checks = [];
    const report = process.env.MATLAB_SMOKE_REPORT;
    const extension = vscode.extensions.getExtension('hanxuyao.hanxuyao-plugin');
    assert(extension, '未加载宿主插件');
    await extension.activate();
    // Windows 模块缓存区分路径大小写，必须读取宿主实际加载的实例。
    const runtimePath = Object.keys(require.cache).find(file => file.toLowerCase().endsWith('out\\matlab\\out\\extension.js'));
    const runtime = runtimePath ? require.cache[runtimePath].exports : {};
    try {
        assert(runtime.extension, '内置运行时未激活');
        const commands = await vscode.commands.getCommands(true);
        const upstream = require(path.join(extension.extensionPath, 'vendor/matlab/package.json'));
        for (const entry of upstream.contributes.commands) {
            assert(commands.includes(entry.command), '命令未注册：' + entry.command);
        }
        checks.push('全部 MATLAB 命令已注册');
        const folder = vscode.workspace.workspaceFolders[0].uri;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, 'codex_smoke.m'));
        assert.strictEqual(doc.languageId, 'matlab');
        await vscode.window.showTextDocument(doc);
        checks.push('.m 语言识别');

        const mvm = runtime.extension.mvm;
        await vscode.commands.executeCommand('matlab.openCommandWindow');
        await waitFor(() => mvm.getMatlabState() === 'connected', 'MATLAB 连接', 120000);
        const arithmetic = await mvm.feval('plus', 1, [20, 22]);
        assert.deepStrictEqual(arithmetic.result, [42]);
        checks.push('MATLAB 实际连接和计算');

        await vscode.commands.executeCommand('matlab.runFile');
        await waitFor(async () => {
            const result = await mvm.feval('evalin', 1, ['base', "exist('codex_smoke_result', 'var')"]);
            return result.result?.[0] === 1;
        }, '运行文件');
        const result = await mvm.feval('evalin', 1, ['base', 'codex_smoke_result']);
        assert.deepStrictEqual(result.result, [42]);
        checks.push('运行文件并核对工作区结果');

        const config = vscode.workspace.getConfiguration('MATLAB');
        await config.update('formatter', 'mathworks', vscode.ConfigurationTarget.Workspace);
        await waitFor(async () => {
            const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', doc.uri, { tabSize: 4, insertSpaces: true });
            return edits && edits.length > 0;
        }, 'MathWorks 格式化');
        checks.push('MathWorks 文档格式化');
        await config.update('formatter', 'hanxuyao', vscode.ConfigurationTarget.Workspace);
        const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', doc.uri, { tabSize: 4, insertSpaces: true });
        assert(edits?.length > 0);
        checks.push('自定义格式化切换');
        await vscode.commands.executeCommand('workspaceBrowserSidebarView.focus');
        checks.push('打开变量工作区视图');
        fs.writeFileSync(report, JSON.stringify({ passed: true, checks, release: mvm.getMatlabRelease() }, null, 2));
    } catch (error) {
        fs.writeFileSync(report, JSON.stringify({ passed: false, checks, error: String(error.stack || error) }, null, 2));
        throw error;
    } finally {
        await runtime.deactivate();
    }
};
