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

import {
    VerilogDefinitionProvider,
    VerilogDocumentSymbolProvider,
    VerilogHoverProvider,
    VerilogSymbolIndex,
} from '../src/features/verilog/symbolProvider';
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

describe('VerilogDefinitionProvider', () => {
    function createDocument(filePath: string, text: string, word: string): any {
        const wordRange = { start: { line: 4, character: 4 }, end: { line: 4, character: 15 } };
        return {
            uri: { fsPath: filePath, scheme: 'file' },
            getWordRangeAtPosition: () => wordRange,
            getText: (range?: unknown) => range ? word : text,
        };
    }

    it('当前文件不在索引中时仍应跳转到当前缓冲区的端口声明', () => {
        const index = new VerilogSymbolIndex();
        index.updateFileFromText('E:\\project\\rxdydata.v', [
            'module rxdydata;',
            "reg frame_error = 1'b0;",
            'endmodule',
        ].join('\n'));

        const document = createDocument('E:\\external\\uart_recv.v', [
            'module uart_recv (',
            '  input  wire clk,',
            '  output reg  rx_valid,',
            '  output reg  frame_error',
            ');',
            '  always @(posedge clk)',
            "    frame_error <= 1'b0;",
            'endmodule',
        ].join('\n'), 'frame_error');

        const provider = new VerilogDefinitionProvider(index);
        const locations = provider.provideDefinition(document, { line: 6, character: 8 } as any);

        expect(locations).toHaveLength(1);
        expect(locations[0].uri.fsPath).toBe('E:\\external\\uart_recv.v');
        expect(locations[0].range.start.line).toBe(3);
    });

    it('悬停应优先显示当前缓冲区的端口声明', () => {
        const index = new VerilogSymbolIndex();
        index.updateFileFromText('E:\\project\\rxdydata.v', "reg frame_error = 1'b0;");
        const document = createDocument('E:\\external\\uart_recv.v', [
            'module uart_recv (',
            '  output reg frame_error',
            ');',
            'endmodule',
        ].join('\n'), 'frame_error');

        const provider = new VerilogHoverProvider(index);
        const hover = provider.provideHover(document, { line: 1, character: 15 } as any) as any;

        expect(hover.contents.value).toContain('frame_error** — port');
        expect(hover.contents.value).toContain('output reg frame_error');
        expect(hover.contents.value).not.toContain("reg frame_error = 1'b0;");
    });
});
