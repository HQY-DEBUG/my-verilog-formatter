// =========================================================================
// 文件    : extension.test.ts
// 描述    : 扩展入口配置测试
// 版本    : v1.1.0
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
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
        };
        const readme = fs.readFileSync(readmePath, 'utf8');
        expect(pkg.name).toBe('hanxuyao-plugin');
        expect(pkg.displayName).toBe('hanxuyao-plugin');
        expect(pkg.version).toBe('1.1.0');
        expect(readme).toContain(`> 版本：v${pkg.version}　日期：2026/08/21`);
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
});
