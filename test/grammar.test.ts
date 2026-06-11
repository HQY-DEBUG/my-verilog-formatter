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
});
