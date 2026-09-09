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

    it.each(['\n', '\r\n'])('应识别 VIO 和 ILA 的换行例化并覆盖整个端口列表（%j）', newline => {
        const text = [
            'module top;',
            'wire Velocity_sel;',
            'VPI_CONFIG config_ctrl',
            '(',
            '  .clk ( CLKIN ),',
            '  .inprobe0 ( re_max_accel ),',
            '  .outprobe4 ( Velocity_sel )',
            ');',
            'ILA_CAPTURE',
            '  capture_ctrl // 调试采样',
            '  /* 端口列表允许注释和空行 */',
            '',
            '(',
            '  .clk ( CLKIN ),',
            '  .probe0 ( {cnt_max, delay} )',
            ');',
            'cal_speed u10 (.clk(CLKIN));',
            'endmodule',
        ].join(newline);
        const symbols = new VerilogDocumentSymbolProvider().provideDocumentSymbols({ getText: () => text } as any);
        const instances = symbols[0].children.filter(sym => sym.detail === 'instantiation');

        expect(instances.map(sym => sym.name)).toEqual([
            'config_ctrl  (VPI_CONFIG)', 'capture_ctrl  (ILA_CAPTURE)', 'u10  (cal_speed)',
        ]);
        expect(instances[0].range.start.line).toBe(2);
        expect(instances[0].range.end.line).toBe(7);
        expect(instances[0].selectionRange.start.line).toBe(2);
        expect(instances[1].range.end.line).toBe(15);
        expect(instances[1].selectionRange.start.line).toBe(9);
        expect(symbols[0].range.end.line).toBe(17);
    });

    it('应兼容参数嵌套括号以及参数、实例名和端口左括号分别换行', () => {
        const text = [
            'module top;',
            'vio_0 #(',
            '  .WIDTH ($clog2(256)),',
            '  .LABEL ("忽略字符串中的 ); 和 //")',
            ')',
            'u_vio',
            '(',
            '  .probe_in0 ( fn(data) )',
            ');',
            'ila_0#(.WIDTH(8)) u_ila (.probe0(data));',
            'endmodule',
        ].join('\n');
        const symbols = new VerilogDocumentSymbolProvider().provideDocumentSymbols({ getText: () => text } as any);
        expect(symbols[0].children.map(sym => sym.name)).toEqual(['u_vio  (vio_0)', 'u_ila  (ila_0)']);
        expect(symbols[0].children[0].selectionRange.start.line).toBe(5);
        expect(symbols[0].children[0].range.end.line).toBe(8);
    });

    it('不应把注释、控制语句或缺少左括号的文本识别成调试实例', () => {
        const text = [
            'module top;',
            '/*',
            'vio_0 fake_vio (.clk(clk));',
            '*/',
            '// ila_0 fake_ila (.clk(clk));',
            'VPI_CONFIG incomplete',
            'wire data;',
            'always_ff @(posedge clk) begin',
            '  if (enable) sample(data);',
            'end',
            'function automatic sample(input data);',
            'endfunction',
            'ila_0 real_ila (.probe0(data));',
            'endmodule',
            'module other;',
            'wire other_signal;',
            'endmodule',
        ].join('\n');
        const symbols = new VerilogDocumentSymbolProvider().provideDocumentSymbols({ getText: () => text } as any);
        expect(symbols[0].children.filter(sym => sym.detail === 'instantiation').map(sym => sym.name))
            .toEqual(['real_ila  (ila_0)']);
        expect(symbols[1].children.map(sym => sym.name)).toEqual(['other_signal']);
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
