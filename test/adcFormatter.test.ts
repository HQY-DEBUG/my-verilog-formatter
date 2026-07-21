import { formatAdc } from '../src/features/verilog/adcFormatter';

jest.mock('vscode', () => ({
    Range: class { constructor(public start: unknown, public end: unknown) {} },
    TextEdit: { replace: (range: unknown, newText: string) => ({ range, newText }) },
}), { virtual: true });

describe('AdcFormatter', () => {
    test('对齐信号名称与属性列', () => {
        const input = [
            'set_pin_assignment { CLKIN } { LOCATION = P54; IOSTANDARD = LVCMOS33; }',
            'set_pin_assignment { UART_OUT } { LOCATION=P10; IOSTANDARD=LVCMOS33; DRIVESTRENGTH=8; }',
            'set_pin_assignment { TXB_OE } { LOCATION = P4; IOSTANDARD = LVCMOS33; DRIVESTRENGTH = 8; }',
        ].join('\n');
        const expected = [
            'set_pin_assignment { CLKIN    } { LOCATION = P54; IOSTANDARD = LVCMOS33; }',
            'set_pin_assignment { UART_OUT } { LOCATION = P10; IOSTANDARD = LVCMOS33; DRIVESTRENGTH = 8; }',
            'set_pin_assignment { TXB_OE   } { LOCATION = P4;  IOSTANDARD = LVCMOS33; DRIVESTRENGTH = 8; }',
        ].join('\n');

        expect(formatAdc(input)).toBe(expected);
    });

    test('保留空行、注释和无法识别的语句', () => {
        const input = [
            '# 时钟与复位',
            'set_pin_assignment { CLKIN } { LOCATION=P54; IOSTANDARD=LVCMOS33; } # 64 MHz',
            '',
            'unknown_command { KEEP_ME }',
        ].join('\n');
        const expected = [
            '# 时钟与复位',
            'set_pin_assignment { CLKIN } { LOCATION = P54; IOSTANDARD = LVCMOS33; } # 64 MHz',
            '',
            'unknown_command { KEEP_ME }',
        ].join('\n');

        expect(formatAdc(input)).toBe(expected);
    });

    test('重复格式化结果保持不变', () => {
        const input = [
            'set_pin_assignment { CLKIN } { LOCATION=P54; IOSTANDARD=LVCMOS33; }',
            'set_pin_assignment { UART_OUT } { LOCATION=P10; IOSTANDARD=LVCMOS33; DRIVESTRENGTH=8; }',
        ].join('\n');
        const formatted = formatAdc(input);

        expect(formatAdc(formatted)).toBe(formatted);
    });
});
