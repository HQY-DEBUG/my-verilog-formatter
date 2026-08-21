// =========================================================================
// 文件    : cFormatter.test.ts
// 描述    : C/C++ 格式化器回归测试
// 版本    : v1.3.0
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.3.0  2026/08/21  增加枚举项多列对齐测试
//  v1.2.2  2026/08/21  增加连续类型定义之间的空行测试
//  v1.2.0  2026/08/21  增加结构体成员多列对齐测试
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

    it('按类型、名称、分号和注释对齐结构体成员', () => {
        const input = [
            'typedef struct ListMem',
            '{',
            '    uint32_t total_pos; // 总 storage positions 数',
            '    ListRegion list1; // List1',
            '    ListRegion list2; // List2（size=0 表示未启用）',
            '    ListRegion list3; // List3 - 受保护区，由剩余空间自动派生',
            '    ListPointer in_ptr; // 输入指针',
            '    ListPointer out_ptr; // 输出指针',
            '    ListId curr_load_list; // 当前加载中的 List',
            '    ListId curr_exec_list; // 当前执行中的 List',
            '    CmdBuffer cmd; // 命令缓存',
            '    ListMemAppendDiag append_diag; // 最近一次追加命令的诊断信息',
            '    ListStatus list_status; // List 状态',
            '    ExecStatus exec_status; // 执行状态',
            '} ListMem;',
        ].join('\n');

        expect(formatC(input)).toBe([
            'typedef struct ListMem',
            '{',
            '    uint32_t          total_pos      ;  // 总 storage positions 数',
            '    ListRegion        list1          ;  // List1',
            '    ListRegion        list2          ;  // List2（size=0 表示未启用）',
            '    ListRegion        list3          ;  // List3 - 受保护区，由剩余空间自动派生',
            '    ListPointer       in_ptr         ;  // 输入指针',
            '    ListPointer       out_ptr        ;  // 输出指针',
            '    ListId            curr_load_list ;  // 当前加载中的 List',
            '    ListId            curr_exec_list ;  // 当前执行中的 List',
            '    CmdBuffer         cmd            ;  // 命令缓存',
            '    ListMemAppendDiag append_diag    ;  // 最近一次追加命令的诊断信息',
            '    ListStatus        list_status    ;  // List 状态',
            '    ExecStatus        exec_status    ;  // 执行状态',
            '} ListMem;',
        ].join('\n'));
        expect(formatC(formatC(input))).toBe(formatC(input));
    });

    it('在类型定义结束与后续注释之间增加一个空行', () => {
        const input = [
            'typedef struct ListCmd',
            '{',
            '    ListCmdType type;',
            '} ListCmd;',
            '// List 区域判定',
            'typedef struct ListRegion',
            '{',
            '    ListId id;',
            '} ListRegion;',
        ].join('\n');

        const expected = [
            'typedef struct ListCmd',
            '{',
            '    ListCmdType type;',
            '} ListCmd;',
            '',
            '// List 区域判定',
            'typedef struct ListRegion',
            '{',
            '    ListId id;',
            '} ListRegion;',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('按名称、赋值、逗号和注释对齐枚举项', () => {
        const input = [
            'typedef enum',
            '{',
            '    APPEND_OK = 0, // 追加成功',
            '    APPEND_INVALID_STATE, // 状态无效',
            '    APPEND_NO_POSITION,',
            '    APPEND_NO_CMD_SLOT',
            '} ListMemAppendError;',
        ].join('\n');

        const expected = [
            'typedef enum',
            '{',
            '    APPEND_OK            = 0 ,  // 追加成功',
            '    APPEND_INVALID_STATE     ,  // 状态无效',
            '    APPEND_NO_POSITION       ,',
            '    APPEND_NO_CMD_SLOT',
            '} ListMemAppendError;',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
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
