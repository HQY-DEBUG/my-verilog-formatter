// =========================================================================
// 文件    : extension.test.ts
// 描述    : 扩展入口配置测试
// 版本    : v1.4.1
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
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
        expect(pkg.version).toBe('1.4.1');
        expect(readme).toContain(`> 版本：v${pkg.version}　日期：2026/08/21`);
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
        const matches = [...extensionText.matchAll(/(?:VERILOG|C)_LANGS\s*=\s*\[([^\]]+)\]/g)];
        expect(matches).toHaveLength(2);
        const langs = matches.flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));

        for (const lang of langs) {
            expect(pkg.activationEvents).toContain(`onLanguage:${lang}`);
        }
    });

    it('C/C++ 输入应主动触发语言服务器建议和参数提示', () => {
        const extensionPath = path.join(__dirname, '..', 'src', 'extension.ts');
        const extensionText = fs.readFileSync(extensionPath, 'utf8');
        expect(extensionText).toContain('onDidChangeTextDocument');
        expect(extensionText).toContain("executeCommand('editor.action.triggerSuggest')");
        expect(extensionText).toContain("executeCommand('editor.action.triggerParameterHints')");
    });
});
