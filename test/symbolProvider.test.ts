// =========================================================================
// 文件    : symbolProvider.test.ts
// 描述    : Verilog 大纲符号测试
// 版本    : v0.1.0
// 日期    : 2026/06/17
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/06/17  创建测试文件
// =========================================================================

import { VerilogDocumentSymbolProvider } from '../src/features/verilog/symbolProvider';
import * as fs from 'fs';
import * as path from 'path';

describe('VerilogDocumentSymbolProvider', () => {
    it('大纲 Provider 应覆盖所有 Verilog 语言 id', () => {
        const sourcePath = path.join(__dirname, '..', 'src', 'features', 'verilog', 'symbolProvider.ts');
        const sourceText = fs.readFileSync(sourcePath, 'utf8');

        expect(sourceText).toContain("language: 'verilog'");
        expect(sourceText).toContain("language: 'systemverilog'");
        expect(sourceText).toContain("language: 'verilog-hdl'");
        expect(sourceText).toContain("language: 'systemverilog-hdl'");
        expect(sourceText).toContain("pattern: '**/*.v'");
        expect(sourceText).toContain("pattern: '**/*.vh'");
        expect(sourceText).toContain("pattern: '**/*.sv'");
        expect(sourceText).toContain("pattern: '**/*.svh'");
    });

    it('应识别参数列表换行的模块例化', () => {
        const text = [
            'module top;',
            'data_split #(',
            '  .AXIS_DATA_WIDTH ( 64 ),',
            '  .AXIS_KEEP_WIDTH ( 8 )',
            ') u_data_split (',
            '  .clk ( clk )',
            ');',
            'endmodule',
        ].join('\n');
        const provider = new VerilogDocumentSymbolProvider();
        const document = { getText: () => text } as any;

        const symbols = provider.provideDocumentSymbols(document);
        const children = symbols[0].children;

        expect(children.some(sym => sym.name === 'u_data_split  (data_split)' && sym.detail === 'instantiation')).toBe(true);
    });
});
