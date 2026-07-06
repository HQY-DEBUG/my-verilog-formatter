// =========================================================================
// 文件    : instantiator.test.ts
// 描述    : 一键例化单元测试
// 版本    : v0.1.0
// 日期    : 2026/06/05
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/06/05  创建测试文件
// =========================================================================

let activeText = '';
let clipboardText = '';
const commands = new Map<string, (...args: unknown[]) => unknown>();

jest.mock('vscode', () => ({
    window: {
        get activeTextEditor() {
            return { document: { getText: () => activeText } };
        },
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn(),
    },
    env: {
        clipboard: {
            writeText: jest.fn(async (text: string) => {
                clipboardText = text;
            }),
        },
    },
    commands: {
        registerCommand: jest.fn((name: string, cb: (...args: unknown[]) => unknown) => {
            commands.set(name, cb);
            return { dispose: jest.fn() };
        }),
    },
}), { virtual: true });

import { registerInstantiatorCommands } from '../src/features/verilog/instantiator';

describe('registerInstantiatorCommands', () => {
    beforeEach(() => {
        activeText = '';
        clipboardText = '';
        commands.clear();
    });

    test('一键例化包含无行尾分隔符的最后一个端口', async () => {
        activeText = [
            'module interp_para (',
            '  input   wire         clk                    ,',
            '  input   wire         rstn                   ,',
            '  output  reg   [19:0] interp_para_v          ,',
            '  output  reg   [19:0] interp_ctrl',
            ');',
            'endmodule',
        ].join('\n');
        registerInstantiatorCommands({ subscriptions: [] } as never);

        await commands.get('verilogFormatter.instantiate')?.();

        expect(clipboardText).toContain('.interp_para_v');
        expect(clipboardText).toContain('.interp_ctrl');
    });

    test('一键例化参数默认值应去除行尾注释', async () => {
        activeText = [
            'module data_check #(',
            '  parameter DATA_WIDTH = 16 // 数据位宽',
            ') (',
            '  input wire clk,',
            '  input wire rstn,',
            '  input wire [DATA_WIDTH-1:0] s_axis_tdata',
            ');',
            'endmodule',
        ].join('\n');
        registerInstantiatorCommands({ subscriptions: [] } as never);

        await commands.get('verilogFormatter.instantiate')?.();

        expect(clipboardText).toMatch(/\.DATA_WIDTH\s+\(16\)/);
        expect(clipboardText).not.toContain('16 // 数据位宽');
    });

    test('一键例化包含 integer 类型参数', async () => {
        activeText = [
            'module fix_delay #(',
            '  parameter integer DATA_WIDTH = 16,',
            '  parameter integer TARGET_DELAY_CYCLES = 110*32,',
            '  parameter integer CLKS_PER_SAMPLE = 32',
            ') (',
            '  input wire clk,',
            '  input wire rstn',
            ');',
            'endmodule',
        ].join('\n');
        registerInstantiatorCommands({ subscriptions: [] } as never);

        await commands.get('verilogFormatter.instantiate')?.();

        expect(clipboardText).toContain('fix_delay #(');
        expect(clipboardText).toMatch(/\.DATA_WIDTH\s+\(16\),/);
        expect(clipboardText).toMatch(/\.TARGET_DELAY_CYCLES\s+\(110\*32\),/);
        expect(clipboardText).toMatch(/\.CLKS_PER_SAMPLE\s+\(32\)/);
    });

    test('一键例化包含带行尾注释且无分隔符的最后一个端口', async () => {
        activeText = [
            'module data_merge (',
            '  input  wire        ap_clk,       // 系统时钟',
            '  output reg         data_out_vld  // 输出有效',
            ');',
            'endmodule',
        ].join('\n');
        registerInstantiatorCommands({ subscriptions: [] } as never);

        await commands.get('verilogFormatter.instantiate')?.();

        expect(clipboardText).toContain('.data_out_vld');
    });
});
