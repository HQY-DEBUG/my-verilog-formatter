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

    test('带 unpacked array 维度的信号声明参与对齐', () => {
        const input = [
            'reg run; // 工作使能',
            'reg [DLY_WIDTH-1:0] delay_cnt; // 时钟拍计数',
            'reg [ADDR_WIDTH-1:0] wr_ptr; // 写指针',
            'reg [DATA_WIDTH-1:0] ram_data [0:MEM_DEPTH-1]; // 数据缓冲',
        ].join('\n');
        const expected = [
            'reg                       run                         ; // 工作使能',
            'reg    [DLY_WIDTH-1:0]    delay_cnt                   ; // 时钟拍计数',
            'reg    [ADDR_WIDTH-1:0]   wr_ptr                      ; // 写指针',
            'reg    [DATA_WIDTH-1:0]   ram_data [0:MEM_DEPTH-1]    ; // 数据缓冲',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('端口声明的位宽列应与 signed 修饰符分列对齐', () => {
        const input = [
            'module data_proc #(',
            'parameter DATA_WIDTH = 20',
            ') (',
            'input wire clk,',
            'input wire signed [DATA_WIDTH-1:0] x_data,',
            'input wire [1:0] data_mode,',
            'output wire signed [DATA_WIDTH-1:0] x_data_out',
            ');',
        ].join('\n');
        const expected = [
            'module data_proc #(',
            '  parameter DATA_WIDTH = 20',
            ') (',
            '  input   wire                          clk       ,',
            '  input   wire  signed [DATA_WIDTH-1:0] x_data    ,',
            '  input   wire         [1:0]            data_mode ,',
            '  output  wire  signed [DATA_WIDTH-1:0] x_data_out',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
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
            '      S_INIT  :',
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

    test('case item 块式标签应按冒号列对齐', () => {
        const input = [
            'case (R_cmd_x[19:4])',
            'GAVLO_READY[19:4] :',
            'begin',
            'X_FK_STA <= GAVLO_READY;',
            'X_QZBK_STA <= GAVLO_READY;',
            'end',
            'GAVLO_POSITION[19:4] :',
            'begin',
            'X_FK_STA <= GAVLO_POSITION;',
            'X_QZBK_STA <= GAVLO_POSITION;',
            'end',
            'SN_LOW16BITS[19:4] :',
            'begin',
            'X_FK_STA <= SN_LOW16BITS;',
            'X_QZBK_STA <= SN_LOW16BITS;',
            'end',
            'FIRM_VERSION[19:4] :',
            'begin',
            'X_FK_STA <= FIRM_VERSION;',
            'X_QZBK_STA <= FIRM_VERSION;',
            'end',
            'endcase',
        ].join('\n');
        const expected = [
            'case (R_cmd_x[19:4])',
            '  GAVLO_READY[19:4]    :',
            '    begin',
            '      X_FK_STA   <= GAVLO_READY;',
            '      X_QZBK_STA <= GAVLO_READY;',
            '    end',
            '  GAVLO_POSITION[19:4] :',
            '    begin',
            '      X_FK_STA   <= GAVLO_POSITION;',
            '      X_QZBK_STA <= GAVLO_POSITION;',
            '    end',
            '  SN_LOW16BITS[19:4]   :',
            '    begin',
            '      X_FK_STA   <= SN_LOW16BITS;',
            '      X_QZBK_STA <= SN_LOW16BITS;',
            '    end',
            '  FIRM_VERSION[19:4]   :',
            '    begin',
            '      X_FK_STA   <= FIRM_VERSION;',
            '      X_QZBK_STA <= FIRM_VERSION;',
            '    end',
            'endcase',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('case item 单行赋值应按冒号列对齐', () => {
        const input = [
            'case (Y_FK_STA_d2)',
            'GAVLO_READY     :   Y_fankui <= gavlo_state;',
            'GAVLO_POSITION  :   Y_fankui <= 20\'hFFFFF - {AD_DATA1, 2\'b00};',
            'SN_LOW16BITS    :   Y_fankui <= SN_L16;',
            'ERROR_CODE      :   Y_fankui <= ERROR_C;',
            '//前瞻--反馈数据',
            'QZ_0x85260: Y_fankui <= QZ_0x85260_FKDA;',
            'QZ_0x8E000: Y_fankui <= QZ_0x8E000_FKDA;',
            '// QZ_0xBF090: Y_fankui <= QZ_0xBF090_FKDA;',
            'QZ_0xBF090: Y_fankui <= qz_0xbf090_fkda;',
            'QZ_0x85480: Y_fankui <= Velocity1;           //Mode2',
            'GAVLO_POSITION_INTERP : Y_fankui <= w_cmd_Y; //插值点反馈位置',
            'QZ_0xBF0C0: Y_fankui <= QZ_0xBF0C0_FKDA;',
            'QZ_0xBF040: Y_fankui <= QZ_0xBF040_FKDA;',
            'default         :   Y_fankui <= gavlo_state;',
            'endcase',
        ].join('\n');
        const expected = [
            'case (Y_FK_STA_d2)',
            '  GAVLO_READY           : Y_fankui <= gavlo_state;',
            '  GAVLO_POSITION        : Y_fankui <= 20\'hFFFFF - {AD_DATA1, 2\'b00};',
            '  SN_LOW16BITS          : Y_fankui <= SN_L16;',
            '  ERROR_CODE            : Y_fankui <= ERROR_C;',
            '  //前瞻--反馈数据',
            '  QZ_0x85260            : Y_fankui <= QZ_0x85260_FKDA;',
            '  QZ_0x8E000            : Y_fankui <= QZ_0x8E000_FKDA;',
            '  // QZ_0xBF090: Y_fankui <= QZ_0xBF090_FKDA;',
            '  QZ_0xBF090            : Y_fankui <= qz_0xbf090_fkda;',
            '  QZ_0x85480            : Y_fankui <= Velocity1; //Mode2',
            '  GAVLO_POSITION_INTERP : Y_fankui <= w_cmd_Y;   //插值点反馈位置',
            '  QZ_0xBF0C0            : Y_fankui <= QZ_0xBF0C0_FKDA;',
            '  QZ_0xBF040            : Y_fankui <= QZ_0xBF040_FKDA;',
            '  default               : Y_fankui <= gavlo_state;',
            'endcase',
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
            '      assign clk_o  = clk_i;',
            '      assign clk_tx = clk;',
            '    end',
            '  else',
            '    begin : gen_slave',
            '      assign clk_o  = 1\'b0;',
            '      assign clk_tx = ~clk_i;',
            '    end',
            'endgenerate',
            'tx_data #(',
            '  .DATA_WIDTH ( DATA_WIDTH  )',
            ') u_tx_data (',
            '  .clk ( clk_tx  )',
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
            '  .DATA_WIDTH   ( DATA_WIDTH       ),',
            '  .XY2_100_MODE ( XY2_100_MODE     ),',
            '  .FRAME_HEADER ( TX_FRAME_HEADER  )',
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
            '      assign sync_o     = tx_sync_o;',
            '      assign cmd_o      = tx_cmd;',
            '      assign status_o   = 1\'b0;       /* Master不输出status */',
            '      assign rx_sync    = tx_sync_o;  /* RX用自己产生的sync判断帧 */',
            '      assign rx_data_in = status_i;  /* RX接收slave返回的status */',
            '    end',
            '  else',
            '    begin : gen_slave_io',
            '      assign sync_o     = 1\'b0;       /* Slave不输出sync */',
            '      assign cmd_o      = 1\'b0;       /* Slave不输出cmd */',
            '      assign status_o   = tx_cmd;     /* Slave通过status线返回数据 */',
            '      assign rx_sync    = sync_i;     /* RX用master发来的sync判断帧 */',
            '      assign rx_data_in = cmd_i;     /* RX接收master发来的cmd数据 */',
            '    end',
            'endgenerate',
            '',
            'tx_data #(',
            '  .DATA_WIDTH   ( DATA_WIDTH       ),',
            '  .XY2_100_MODE ( XY2_100_MODE     ),',
            '  .FRAME_HEADER ( TX_FRAME_HEADER  )',
            ') u_tx_data (',
            '  .clk  ( clk_tx  ),',
            '  .rstn ( rstn    ),',
            '  .cmd  ( tx_cmd  )',
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
            'assign m_axis_mm2s_tready = 1\'b1;',
            'assign axis_handshake     = m_axis_mm2s_tvalid & m_axis_mm2s_tready;',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('等长连续 assign 不应补充额外对齐空格', () => {
        const input = [
            'assign m_xy2_tready_ox         = 1\'b1;',
            'assign m_xy2_tready_oy         = 1\'b1;',
            'assign m_xy2_tready_oz         = 1\'b1;',
        ].join('\n');
        const expected = [
            'assign m_xy2_tready_ox = 1\'b1;',
            'assign m_xy2_tready_oy = 1\'b1;',
            'assign m_xy2_tready_oz = 1\'b1;',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('连续 parameter 位宽声明应对齐名称和等号列', () => {
        const input = [
            '//前瞻握手命令对应的返回状态字',
            'parameter [19:0] QZ_0x85260_FKDA   = 20\'h00000;',
            'parameter [19:0] QZ_0x8E000_FKDA_1 = 20\'h28040;',
            'parameter [19:0] QZ_0xBF0C0_FKDA   = 20\'hBF0C0;',
            'parameter [19:0] QZ_0xBF0A0_FKDA= 20\'h00780;',
            'parameter [19:0] QZ_0xBF020_FKDA= 20\'h0B8E0;',
            'parameter [19:0] QZ_0x98B50_FKDA= 20\'h02050;',
        ].join('\n');
        const expected = [
            '//前瞻握手命令对应的返回状态字',
            'parameter [19:0] QZ_0x85260_FKDA   = 20\'h00000;',
            'parameter [19:0] QZ_0x8E000_FKDA_1 = 20\'h28040;',
            'parameter [19:0] QZ_0xBF0C0_FKDA   = 20\'hBF0C0;',
            'parameter [19:0] QZ_0xBF0A0_FKDA   = 20\'h00780;',
            'parameter [19:0] QZ_0xBF020_FKDA   = 20\'h0B8E0;',
            'parameter [19:0] QZ_0x98B50_FKDA   = 20\'h02050;',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('带注释的端口行应忽略被注释端口的长度', () => {
        const input = [
            'module rd26bhjc (',
            'input wire CLKIN, // 46.08 MHz 系统时钟',
            'input wire CLOCK_XY2_100, // XY2-100 时钟',
            '// input wire A_VERY_LONG_DISABLED_PORT, // 禁用端口',
            'output wire TEST1, // 测试信号 1',
            ');',
        ].join('\n');
        const expected = [
            'module rd26bhjc (',
            '  input   wire  CLKIN        , // 46.08 MHz 系统时钟',
            '  input   wire  CLOCK_XY2_100, // XY2-100 时钟',
            '  // input wire A_VERY_LONG_DISABLED_PORT, // 禁用端口',
            '  output  wire  TEST1        , // 测试信号 1',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('同一 parameter 语句的续行名称应与首行对齐', () => {
        const input = [
            'parameter IDLE = 5\'b00001,',
            'LOADBYTE = 5\'b00010,',
            'START = 5\'b00100,',
            'TRANSMIT = 5\'b01000,',
            'DONE = 5\'b10000;',
        ].join('\n');
        const expected = [
            'parameter IDLE     = 5\'b00001,',
            '          LOADBYTE = 5\'b00010,',
            '          START    = 5\'b00100,',
            '          TRANSMIT = 5\'b01000,',
            '          DONE     = 5\'b10000;',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('模块参数列表应对齐名称等号和值列', () => {
        const input = [
            'module data_gen #(',
            '  parameter MAX_DATA_NUM = 1048576, // 输出数据个数',
            '  parameter DATA_WIDTH = 20,        // 数据位宽',
            '  parameter CNT_WIDTH    = 32       // 计数器位宽',
            ') (',
            ');',
        ].join('\n');
        const expected = [
            'module data_gen #(',
            '  parameter MAX_DATA_NUM = 1048576, // 输出数据个数',
            '  parameter DATA_WIDTH   = 20     , // 数据位宽',
            '  parameter CNT_WIDTH    = 32       // 计数器位宽',
            ') (',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('模块参数列表应对齐逗号列', () => {
        const input = [
            'module fix_delay #(',
            '  parameter DATA_WIDTH = 16, // 数据位宽',
            '  parameter TARGET_DELAY_CYCLES = 110*32, // 固定延时窗口',
            '  parameter CLKS_PER_SAMPLE = 32 // 样本间隔拍数',
            ') (',
            ');',
        ].join('\n');
        const expected = [
            'module fix_delay #(',
            '  parameter DATA_WIDTH          = 16    , // 数据位宽',
            '  parameter TARGET_DELAY_CYCLES = 110*32, // 固定延时窗口',
            '  parameter CLKS_PER_SAMPLE     = 32      // 样本间隔拍数',
            ') (',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('例化参数和端口连接行应缩进两个空格', () => {
        const input = [
            'clk_gen #(',
            '.CLK_FREQ     ( 100  ), // 输入时钟频率 (MHz)',
            '.CLK_OUT_FREQ ( 2    )  // 输出时钟频率 (MHz)',
            ') u_xy2_clk_gen (',
            '.clk_in  ( ps_clk   ),',
            '.rstn    ( pl_rstn  ),',
            '.clk_out ( clk_xy2  )',
            ');',
        ].join('\n');
        const expected = [
            'clk_gen #(',
            '  .CLK_FREQ     ( 100  ), // 输入时钟频率 (MHz)',
            '  .CLK_OUT_FREQ ( 2    )  // 输出时钟频率 (MHz)',
            ') u_xy2_clk_gen (',
            '  .clk_in  ( ps_clk   ),',
            '  .rstn    ( pl_rstn  ),',
            '  .clk_out ( clk_xy2  )',
            ');',
        ].join('\n');

        expect(fmt['format'](input, defaultCfg)).toBe(expected);
    });

    test('例化端口连接块内注释行应跟随端口缩进', () => {
        const input = [
            'bram_ctrl #(',
            '  .MAX_DATA_NUM ( MAX_DATA_NUM  ),',
            '  .DATA_WIDTH   ( DATA_WIDTH    ),',
            '  .CNT_WIDTH    ( CNT_WIDTH     )',
            ') u_pang_bram (',
            '// Clock and Reset',
            '.clk           ( clk             ),',
            '.rstn          ( rstn            ),',
            '',
            '// AXI-Stream Slave 输入端',
            '.s_axis_tdata  ( pang_wr_tdata   ),',
            '.s_axis_tvalid ( pang_wr_tvalid  ),',
            '.s_axis_tready ( pang_wr_tready  ),',
            '',
            '// 数据计数',
            '.data_cnt      ( pang_data_num   )',
            ');',
        ].join('\n');
        const expected = [
            'bram_ctrl #(',
            '  .MAX_DATA_NUM ( MAX_DATA_NUM  ),',
            '  .DATA_WIDTH   ( DATA_WIDTH    ),',
            '  .CNT_WIDTH    ( CNT_WIDTH     )',
            ') u_pang_bram (',
            '  // Clock and Reset',
            '  .clk           ( clk             ),',
            '  .rstn          ( rstn            ),',
            '',
            '  // AXI-Stream Slave 输入端',
            '  .s_axis_tdata  ( pang_wr_tdata   ),',
            '  .s_axis_tvalid ( pang_wr_tvalid  ),',
            '  .s_axis_tready ( pang_wr_tready  ),',
            '',
            '  // 数据计数',
            '  .data_cnt      ( pang_data_num   )',
            ');',
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

    test('无 begin 的 if else 链保持单语句缩进', () => {
        const input = [
            '// 开始判断',
            'always @(posedge clk or negedge rstn)',
            'if(rstn ==1\'b0)',
            'start_ <= 1\'b0;',
            'else if (start && (start_r == 1\'b0))',
            'start_ <= 1\'b1;',
            'else if (stop && (stop_r == 1\'b0))',
            'start_ <= 1\'b0;',
            'else',
            'start_ <= start_;',
        ].join('\n');
        const expected = [
            '// 开始判断',
            'always @(posedge clk or negedge rstn)',
            '  if(rstn ==1\'b0)',
            '    start_ <= 1\'b0;',
            '  else if (start && (start_r == 1\'b0))',
            '    start_ <= 1\'b1;',
            '  else if (stop && (stop_r == 1\'b0))',
            '    start_ <= 1\'b0;',
            '  else',
            '    start_ <= start_;',
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
