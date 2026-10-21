// =========================================================================
// 文件    : extension.test.ts
// 描述    : 扩展入口配置测试
// 版本    : v2.2.5
// 日期    : 2026/10/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v2.2.5  2026/10/21  执行真实 C/C++ 输入事件逻辑，验证自动补全及参数提示
//  v1.4.5  2026/09/11  校验版本清单与说明一致，支持后续自动发布升版
//  v1.4.4  2026/09/11  同步 MATLAB 内置集成版本
//  v1.4.2  2026/08/21  同步跨行控制条件单行化功能版本
//  v1.4.1  2026/08/21  校验 C/C++ 自动建议及参数提示触发器
//  v1.4.0  2026/08/21  同步 C/C++ 缩进重算功能版本
//  v1.3.4  2026/08/21  校验 VSIX 发布流程包含 ripgrep 平台依赖
//  v1.3.3  2026/08/21  同步单行函数左花括号修复版本
//  v1.3.2  2026/08/21  同步枚举左花括号同行功能版本
//  v1.3.1  2026/08/21  同步结构体左花括号同行功能版本
//  v1.3.0  2026/08/21  同步枚举多列对齐功能版本
//  v1.2.2  2026/08/21  同步类型定义空行功能版本
//  v1.2.1  2026/08/21  校验插件专用格式化命令及快捷键
//  v1.2.0  2026/08/21  同步结构体多列对齐功能版本
//  v1.1.1  2026/08/21  校验 README 有序功能介绍及版本同步
//  v1.1.0  2026/08/21  增加插件名称及 C/C++ 激活事件测试
//  v0.1.0  2026/06/11  创建测试文件
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

describe('extension formatter languages', () => {
    it('扩展名称与 README 版本应保持同步', () => {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const readmePath = path.join(__dirname, '..', 'README.md');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
            name: string;
            displayName: string;
            version: string;
            scripts: { package: string };
            activationEvents: string[];
            contributes: {
                commands: Array<{ command: string }>;
                keybindings: Array<{ command: string; key: string }>;
            };
        };
        const readme = fs.readFileSync(readmePath, 'utf8');
        expect(pkg.name).toBe('hanxuyao-plugin');
        expect(pkg.displayName).toBe('hanxuyao-plugin');
        const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
        expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(lock.version).toBe(pkg.version);
        expect(lock.packages[''].version).toBe(pkg.version);
        const readmeVersion = readme.match(/^> 版本：v(\d+\.\d+\.\d+)　日期：\d{4}\/\d{2}\/\d{2}$/m);
        expect(readmeVersion?.[1]).toBe(pkg.version);
        expect(readme).toMatch(/1\. 代码格式化：[\s\S]*2\. 工程浏览：[\s\S]*3\. 代码生成：/);
        expect(pkg.activationEvents).toContain('onCommand:verilogFormatter.formatDocument');
        expect(pkg.contributes.commands).toContainEqual(expect.objectContaining({
            command: 'verilogFormatter.formatDocument',
        }));
        expect(pkg.contributes.keybindings).toContainEqual(expect.objectContaining({
            command: 'verilogFormatter.formatDocument',
            key: 'ctrl+alt+f',
        }));
        expect(pkg.scripts.package).toBe('vsce package');
        expect(readme).not.toContain('vsce package --no-dependencies');
    });

    it('formatter 注册语言应都有对应 activation event', () => {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const extensionPath = path.join(__dirname, '..', 'src', 'extension.ts');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { activationEvents: string[] };
        const extensionText = fs.readFileSync(extensionPath, 'utf8');
        const matches = [...extensionText.matchAll(/(?:VERILOG|C|MATLAB)_LANGS\s*=\s*\[([^\]]+)\]/g)];
        expect(matches).toHaveLength(3);
        const langs = matches.flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));

        for (const lang of langs) {
            expect(pkg.activationEvents).toContain(`onLanguage:${lang}`);
        }
    });

});

describe('C/C++ 自动建议事件', () => {
    let handler: (event: any) => void;
    let api: any;
    let document: any;

    beforeEach(() => {
        jest.useFakeTimers();
        document = { languageId: 'c' };
        api = {
            window: { activeTextEditor: { document } },
            workspace: { onDidChangeTextDocument: (callback: typeof handler) => { handler = callback; } },
            commands: { executeCommand: jest.fn().mockResolvedValue(undefined) },
        };
        // 运行入口中的真实注册语句，避免为测试重写一份自动触发逻辑，也不启动无关服务。
        const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const source = ts.createSourceFile('extension.ts', text, ts.ScriptTarget.ES2020, true);
        const activate = source.statements.find(node => ts.isFunctionDeclaration(node)
            && node.name?.text === 'activate') as ts.FunctionDeclaration;
        const statements = activate.body!.statements;
        const start = statements.findIndex(node => ts.isVariableStatement(node)
            && node.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'cSuggestTimer'));
        expect(start).toBeGreaterThanOrEqual(0);
        const registration = statements.slice(start, start + 2).map(node => node.getText(source)).join('\n');
        const script = ts.transpileModule(registration, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
        new Function('vscode', 'context', 'C_LANGS', script)(api, { subscriptions: [] }, ['c', 'cpp']);
    });

    afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

    const change = (text: string, changedDocument: any) => ({ document: changedDocument, contentChanges: [{ text }] });

    it.each(['c', 'cpp'])('%s 单字符输入延迟触发自动建议，不发送手动补全命令', language => {
        document.languageId = language;
        handler(change('x', document));
        jest.advanceTimersByTime(119);
        expect(api.commands.executeCommand).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(api.commands.executeCommand).toHaveBeenCalledTimes(1);
        expect(api.commands.executeCommand).toHaveBeenCalledWith('editor.action.triggerSuggest', { auto: true });
    });

    it('快速连续输入只在最后一次输入后请求建议', () => {
        handler(change('a', document));
        jest.advanceTimersByTime(80);
        handler(change('b', document));
        jest.advanceTimersByTime(80);
        expect(api.commands.executeCommand).not.toHaveBeenCalled();
        jest.advanceTimersByTime(40);
        expect(api.commands.executeCommand).toHaveBeenCalledTimes(1);
    });

    it('左括号立即请求参数提示，不变更参数提示命令', () => {
        handler(change('(', document));
        expect(api.commands.executeCommand).toHaveBeenCalledWith('editor.action.triggerParameterHints');
        jest.runAllTimers();
        expect(api.commands.executeCommand).toHaveBeenCalledTimes(1);
    });

    it('其他语言、其他文档、空变化及批量粘贴不触发建议', () => {
        handler(change('x', { languageId: 'c' }));
        handler({ document, contentChanges: [] });
        handler(change('pasted_text', document));
        handler(change(' ', document));
        document.languageId = 'verilog';
        handler(change('x', document));
        jest.runAllTimers();
        expect(api.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('等待期间切换编辑器不会在新文档弹出建议', () => {
        handler(change('x', document));
        api.window.activeTextEditor = { document: { languageId: 'c' } };
        jest.runAllTimers();
        expect(api.commands.executeCommand).not.toHaveBeenCalled();
    });
});
