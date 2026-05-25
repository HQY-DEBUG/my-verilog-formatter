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

import { VerilogFormatter } from '../src/formatter';

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
