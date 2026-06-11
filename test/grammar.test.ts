// =========================================================================
// 文件    : grammar.test.ts
// 描述    : Verilog TextMate 语法配置测试
// 版本    : v0.1.0
// 日期    : 2026/06/11
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/06/11  创建测试文件
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';

describe('Verilog TextMate grammar', () => {
    it('普通标识符不应被全局标记为 variable/constant scope', () => {
        const grammarPath = path.join(__dirname, '..', 'resources', 'verilog', 'syntaxes', 'verilog.tmLanguage.json');
        const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8')) as {
            patterns: Array<{ include?: string }>;
            repository: Record<string, unknown>;
        };

        expect(grammar.patterns.map(p => p.include)).not.toContain('#identifier');
        expect(grammar.repository).not.toHaveProperty('identifier');
    });

    it('formatter 支持的 Verilog 语言都应绑定 grammar', () => {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const extensionPath = path.join(__dirname, '..', 'src', 'extension.ts');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
            contributes: { grammars: Array<{ language: string }> };
        };
        const extensionText = fs.readFileSync(extensionPath, 'utf8');
        const match = extensionText.match(/VERILOG_LANGS\s*=\s*\[([^\]]+)\]/);
        expect(match).not.toBeNull();
        const formatterLangs = [...match![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
        const grammarLangs = pkg.contributes.grammars.map(g => g.language);

        for (const lang of formatterLangs) {
            expect(grammarLangs).toContain(lang);
        }
    });
});
