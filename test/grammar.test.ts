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
    function loadGrammar(fileName: string): {
        scopeName: string;
        fileTypes: string[];
        patterns: Array<{ include?: string }>;
        repository: Record<string, any>;
    } {
        const grammarPath = path.join(__dirname, '..', 'resources', 'verilog', 'syntaxes', fileName);
        return JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
    }

    function loadVerilogGrammar(): {
        patterns: Array<{ include?: string }>;
        repository: Record<string, any>;
    } {
        return loadGrammar('verilog.tmLanguage.json');
    }

    it('普通标识符不应被全局标记为 variable/constant scope', () => {
        const grammar = loadVerilogGrammar();

        expect(grammar.patterns.map(p => p.include)).not.toContain('#identifier');
        expect(grammar.repository).not.toHaveProperty('identifier');
    });

    it('attribute 规则不应匹配 always @(*) 灵敏度列表', () => {
        const grammar = loadVerilogGrammar();
        const begin = new RegExp(grammar.repository.attribute.begin);

        expect(begin.test('(*)')).toBe(false);
        expect(begin.test('(* mark_debug = "true" *)')).toBe(true);
    });

    it('数字规则应匹配无位宽进制字面量', () => {
        const grammar = loadVerilogGrammar();
        const numberRules = grammar.repository.number.patterns as Array<{ match: string }>;
        const matchesNumber = (text: string): boolean => numberRules.some(rule => new RegExp(rule.match).test(text));

        expect(matchesNumber("'d0")).toBe(true);
        expect(matchesNumber("'b0")).toBe(true);
        expect(matchesNumber("'hFF")).toBe(true);
        expect(matchesNumber("8'd0")).toBe(true);
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

    it('应注册 Anlogic ADC 与 SDC 约束语言和 grammar', () => {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
            activationEvents: string[];
            contributes: {
                languages: Array<{ id: string; extensions: string[] }>;
                grammars: Array<{ language: string; scopeName: string; path: string }>;
            };
        };

        for (const expected of [
            { id: 'anlogic-adc', extension: '.adc', scopeName: 'source.adc' },
            { id: 'sdc', extension: '.sdc', scopeName: 'source.sdc' },
        ]) {
            expect(pkg.activationEvents).toContain(`onLanguage:${expected.id}`);
            expect(pkg.contributes.languages).toContainEqual(expect.objectContaining({
                id: expected.id,
                extensions: expect.arrayContaining([expected.extension]),
            }));
            expect(pkg.contributes.grammars).toContainEqual(expect.objectContaining({
                language: expected.id,
                scopeName: expected.scopeName,
            }));
        }
    });

    it('Anlogic ADC grammar 应识别引脚约束命令、属性和管脚号', () => {
        const grammar = loadGrammar('adc.tmLanguage.json');

        expect(grammar.scopeName).toBe('source.adc');
        expect(new RegExp(grammar.repository.command.match).test('set_pin_assignment')).toBe(true);
        expect(new RegExp(grammar.repository.property.match).test('DRIVESTRENGTH')).toBe(true);
        expect(new RegExp(grammar.repository.pin.match).test('P54')).toBe(true);
    });

    it('SDC grammar 应识别时序命令、对象查询和选项', () => {
        const grammar = loadGrammar('sdc.tmLanguage.json');

        expect(grammar.scopeName).toBe('source.sdc');
        expect(new RegExp(grammar.repository.command.match).test('create_generated_clock')).toBe(true);
        expect(new RegExp(grammar.repository.collection_command.match).test('get_ports')).toBe(true);
        expect(new RegExp(grammar.repository.option.match).test('-divide_by')).toBe(true);
    });
});
