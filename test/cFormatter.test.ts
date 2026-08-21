// =========================================================================
// 文件    : cFormatter.test.ts
// 描述    : C/C++ 格式化器回归测试
// 版本    : v1.1.0
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.1.0  2026/08/21  创建文件
// =========================================================================

import { formatC } from '../src/features/c/cFormatter';

describe('C/C++ formatter', () => {
    it('对齐连续的变量定义', () => {
        const input = [
            'uint8_t a = 0;',
            'const uint32_t *long_value = NULL;',
            'char name[16];',
        ].join('\n');

        expect(formatC(input)).toBe([
            'uint8_t        a = 0;',
            'const uint32_t *long_value = NULL;',
            'char           name[16];',
        ].join('\n'));
    });

    it('把多行函数调用整理为单行', () => {
        const input = [
            '    send_packet(',
            '        socket,',
            '        buffer,',
            '        length);',
        ].join('\n');

        expect(formatC(input)).toBe('    send_packet(socket, buffer, length);');
    });

    it('把赋值和成员函数的多行调用整理为单行', () => {
        const input = [
            'result = object.build(',
            '    first,',
            '    second);',
        ].join('\n');

        expect(formatC(input)).toBe('result = object.build(first, second);');
    });

    it('把控制条件中的多行函数调用整理为单行', () => {
        const input = [
            'if (is_ready(',
            '        device,',
            '        timeout))',
            '{',
            '    run();',
            '}',
        ].join('\n');

        expect(formatC(input)).toBe([
            'if (is_ready(device, timeout))',
            '{',
            '    run();',
            '}',
        ].join('\n'));
    });

    it('函数左花括号跟在签名最后一行', () => {
        const input = [
            'static int calculate(',
            '    int first,',
            '    int second)',
            '{',
            '    return first + second;',
            '}',
        ].join('\n');

        expect(formatC(input)).toBe([
            'static int calculate(',
            '    int first,',
            '    int second) {',
            '    return first + second;',
            '}',
        ].join('\n'));
    });

    it('不把控制语句的左花括号改成函数样式', () => {
        const input = ['if (ready)', '{', '    run();', '}'].join('\n');
        expect(formatC(input)).toBe(input);
    });

    it('保留 C++ 成员函数的多行签名并移动左花括号', () => {
        const input = [
            'Widget::Widget(',
            '    int width,',
            '    int height)',
            '{',
            '}',
        ].join('\n');

        expect(formatC(input)).toBe([
            'Widget::Widget(',
            '    int width,',
            '    int height) {',
            '}',
        ].join('\n'));
    });
});
