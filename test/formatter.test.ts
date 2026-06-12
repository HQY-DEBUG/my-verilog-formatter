// =========================================================================
// 文件    : formatter.test.ts
// 描述    : VerilogFormatter 单元测试
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建测试文件
// =========================================================================

// 运行前置条件：npm install && npm run compile
// 运行命令：    npx jest  （需安装 jest：npm install --save-dev jest ts-jest @types/jest）

import * as fs from 'fs';
import * as path from 'path';

// 直接引入格式化逻辑（绕开 vscode API 依赖，用 mock）
// 测试时将 vscode 模块 mock 掉
jest.mock('vscode', () => ({
    workspace: { getConfiguration: () => ({ get: (_: string, def: unknown) => def }) },
    Range: class { constructor(public s: unknown, public e: unknown) {} },
    TextEdit: { replace: (r: unknown, t: string) => ({ range: r, newText: t }) },
}), { virtual: true });

import { VerilogFormatter } from '../src/features/verilog/formatter';

const SAMPLES = path.join(__dirname, 'samples');

describe('VerilogFormatter', () => {
    const fmt = new VerilogFormatter() as unknown as {
        format: (code: string, cfg: object) => string;
    };

    const defaultCfg = { indentSize: 2, alignPortComment: true, newlineBeforeBegin: true };

    // ---- begin 另起一行 ----//
    test('begin 另起一行', () => {
        const input    = `always @(posedge clk) begin\n  cnt <= cnt + 1;\nend`;
        const expected = `always @(posedge clk)\nbegin\n  cnt <= cnt + 1;\nend`;
        expect(fmt['format'](input, defaultCfg)).toContain('begin\n');
    });

    // ---- 行尾空格清除 ----//
    test('行尾空格清除', () => {
        const input  = `wire valid;   \nreg  flag;  `;
        const result = fmt['format'](input, defaultCfg);
        result.split('\n').forEach(line => {
            expect(line).toBe(line.trimEnd());
        });
    });

    // ---- 信号声明对齐 ----//
    test('信号声明对齐', () => {
        const input  = `reg [3:0] cnt; // 计数器\nreg flag; // 标志位\nwire [7:0] data; // 总线`;
        const result = fmt['format'](input, defaultCfg);
        const lines  = result.split('\n').filter(l => l.trim());
        // 分号列应对齐（每行分号位置相同）
        const semicolonCols = lines.map(l => l.indexOf(';'));
        expect(new Set(semicolonCols).size).toBe(1);
    });

    // ---- case 标签下 begin/end 缩进 ----//
    test('case 标签下 begin/end 和 default 语句缩进', () => {
        const input = [
            'always @(*)',
            'begin',
            'case (state)',
            'S_INIT :',
            'begin',
            'next_state = S_FRAME;',
            'end',
            'default :',
            'next_state = S_INIT;',
            'endcase',
            'end',
        ].join('\n');
        const expected = [
            'always @(*)',
            '  begin',
            '    case (state)',
            '      S_INIT :',
            '        begin',
            '          next_state = S_FRAME;',
            '        end',
            '      default :',
            '        next_state = S_INIT;',
            '    endcase',
            '  end',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    // ---- generate 命名 begin 缩进 ----//
    test('generate 命名 begin 和 end else begin 缩进', () => {
        const input = [
            'generate',
            'if (XY2_100_MODE == "Master") begin : gen_master',
            'assign clk_o = clk_i;',
            'assign clk_tx = clk;',
            'end else begin : gen_slave',
            'assign clk_o = 1\'b0;',
            'assign clk_tx = ~clk_i;',
            'end',
            'endgenerate',
            'tx_data #(',
            '.DATA_WIDTH ( DATA_WIDTH )',
            ') u_tx_data (',
            '.clk ( clk_tx )',
            ');',
        ].join('\n');
        const expected = [
            'generate',
            '  if (XY2_100_MODE == "Master")',
            '    begin : gen_master',
            '      assign clk_o                   = clk_i;',
            '      assign clk_tx                  = clk;',
            '    end',
            '  else',
            '    begin : gen_slave',
            '      assign clk_o                   = 1\'b0;',
            '      assign clk_tx                  = ~clk_i;',
            '    end',
            'endgenerate',
            'tx_data #(',
            '.DATA_WIDTH ( DATA_WIDTH  )',
            ') u_tx_data (',
            '.clk ( clk_tx  )',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    // ---- assign 块注释不应污染后续缩进 ----//
    test('assign 行尾块注释不触发多行续行缩进', () => {
        const input = [
            'generate',
            'if (XY2_100_MODE == "Master")',
            'begin : gen_master_io',
            'assign sync_o    = tx_sync_o;',
            'assign cmd_o     = tx_cmd;',
            'assign status_o  = 1\'b0;       /* Master不输出status */',
            'assign rx_sync   = tx_sync_o;  /* RX用自己产生的sync判断帧 */',
            'assign rx_data_in = status_i;  /* RX接收slave返回的status */',
            'end',
            'else',
            'begin : gen_slave_io',
            'assign sync_o    = 1\'b0;       /* Slave不输出sync */',
            'assign cmd_o     = 1\'b0;       /* Slave不输出cmd */',
            'assign status_o  = tx_cmd;     /* Slave通过status线返回数据 */',
            'assign rx_sync   = sync_i;     /* RX用master发来的sync判断帧 */',
            'assign rx_data_in = cmd_i;     /* RX接收master发来的cmd数据 */',
            'end',
            'endgenerate',
            '',
            'tx_data #(',
            '.DATA_WIDTH   ( DATA_WIDTH       ),',
            '.XY2_100_MODE ( XY2_100_MODE     ),',
            '.FRAME_HEADER ( TX_FRAME_HEADER  )',
            ') u_tx_data (',
            '.clk           ( clk_tx         ),',
            '.rstn          ( rstn           ),',
            '.cmd           ( tx_cmd         )',
            ');',
        ].join('\n');
        const expected = [
            'generate',
            '  if (XY2_100_MODE == "Master")',
            '    begin : gen_master_io',
            '      assign sync_o                  = tx_sync_o;',
            '      assign cmd_o                   = tx_cmd;',
            '      assign status_o                = 1\'b0;       /* Master不输出status */',
            '      assign rx_sync                 = tx_sync_o;  /* RX用自己产生的sync判断帧 */',
            '      assign rx_data_in              = status_i;  /* RX接收slave返回的status */',
            '    end',
            '  else',
            '    begin : gen_slave_io',
            '      assign sync_o                  = 1\'b0;       /* Slave不输出sync */',
            '      assign cmd_o                   = 1\'b0;       /* Slave不输出cmd */',
            '      assign status_o                = tx_cmd;     /* Slave通过status线返回数据 */',
            '      assign rx_sync                 = sync_i;     /* RX用master发来的sync判断帧 */',
            '      assign rx_data_in              = cmd_i;     /* RX接收master发来的cmd数据 */',
            '    end',
            'endgenerate',
            '',
            'tx_data #(',
            '.DATA_WIDTH   ( DATA_WIDTH       ),',
            '.XY2_100_MODE ( XY2_100_MODE     ),',
            '.FRAME_HEADER ( TX_FRAME_HEADER  )',
            ') u_tx_data (',
            '.clk  ( clk_tx  ),',
            '.rstn ( rstn    ),',
            '.cmd  ( tx_cmd  )',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    // ---- assign 左值对齐 ----//
    test('连续单行 assign 的等号按左值列对齐', () => {
        const input = [
            '// ---- AXI-Stream输入接口握手信号 ----//',
            'assign m_axis_mm2s_tready = 1\'b1;',
            'assign axis_handshake  = m_axis_mm2s_tvalid & m_axis_mm2s_tready;',
        ].join('\n');
        const expected = [
            '// ---- AXI-Stream输入接口握手信号 ----//',
            'assign m_axis_mm2s_tready      = 1\'b1;',
            'assign axis_handshake          = m_axis_mm2s_tvalid & m_axis_mm2s_tready;',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    // ---- 过程赋值左值对齐 ----//
    test('连续非阻塞赋值的操作符按左值列对齐', () => {
        const input = [
            'always @(posedge clk or negedge rstn)',
            'begin',
            'if (!rstn)',
            'begin',
            'x_data <= \'d0;',
            'x_data_valid <= 1\'b0;',
            'y_data <= \'d0;',
            'y_data_valid <= 1\'b0;',
            'z_data <= \'d0;',
            'z_data_valid <= 1\'b0;',
            'end',
            'end',
        ].join('\n');
        const expected = [
            'always @(posedge clk or negedge rstn)',
            '  begin',
            '    if (!rstn)',
            '      begin',
            '        x_data       <= \'d0;',
            '        x_data_valid <= 1\'b0;',
            '        y_data       <= \'d0;',
            '        y_data_valid <= 1\'b0;',
            '        z_data       <= \'d0;',
            '        z_data_valid <= 1\'b0;',
            '      end',
            '  end',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    // ---- 样例文件对比（集成测试）----//
    test('样例文件格式化输出符合预期', () => {
        const input    = fs.readFileSync(path.join(SAMPLES, 'input_messy.v'), 'utf8');
        const expected = fs.readFileSync(path.join(SAMPLES, 'expected_output.v'), 'utf8');
        const result   = fmt['format'](input, defaultCfg);
        // 逐行比较（忽略行尾空格差异）
        const rLines = result.split('\n').map(l => l.trimEnd());
        const eLines = expected.split('\n').map(l => l.trimEnd());
        rLines.forEach((line, i) => {
            expect(line).toBe(eLines[i] ?? '');
        });
    });
});
