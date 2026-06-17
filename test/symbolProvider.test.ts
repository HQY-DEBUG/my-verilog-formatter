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

describe('VerilogDocumentSymbolProvider', () => {
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
