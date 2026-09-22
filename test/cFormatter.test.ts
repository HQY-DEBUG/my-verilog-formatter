// =========================================================================
// 文件    : cFormatter.test.ts
// 描述    : C/C++ 格式化器回归测试
// 版本    : v1.6.0
// 日期    : 2026/09/22
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.6.0  2026/09/22  验证定制对齐保留宏、注释和通用排版的换行
//  v1.4.10 2026/09/15  验证宏值注释和连续调用参数对齐，保留表达式及分组边界
//  v1.4.9  2026/09/15  验证函数内数组赋值、调用表达式及对齐分组边界
//  v1.4.8  2026/09/15  验证混合类型变量的赋值、分号和注释对齐及重复格式化
//  v1.4.2  2026/08/21  增加跨行控制条件单行化测试
//  v1.4.0  2026/08/21  增加函数体及嵌套代码块缩进测试
//  v1.3.3  2026/08/21  增加 static bool 单行函数签名测试
//  v1.3.2  2026/08/21  增加枚举左花括号同行测试
//  v1.3.1  2026/08/21  增加结构体左花括号同行测试
//  v1.3.0  2026/08/21  增加枚举项多列对齐测试
//  v1.2.2  2026/08/21  增加连续类型定义之间的空行测试
//  v1.2.0  2026/08/21  增加结构体成员多列对齐测试
//  v1.1.0  2026/08/21  创建文件
// =========================================================================

import { formatC } from '../src/features/c/cFormatter';

describe('C/C++ formatter', () => {
    it.each(['\n', '\r\n'])('保留 TX/RX 续行宏及后续函数声明（%j）', eol => {
        const input = [
            '/* Helper macros for TX descriptor handling */',
            '#define INCR_TX_DESC_INDEX(Index, Offset) do {\\',
            '    (Index) += (Offset);\\',
            '    if ((Index) >= (AL_U32)AL_GBE_TX_DESC_CNT) {\\',
            '        (Index) = ((Index) - (AL_U32)AL_GBE_TX_DESC_CNT);}\\',
            '} while (0)',
            '',
            '/* Helper macros for RX descriptor handling */',
            '#define INCR_RX_DESC_INDEX(Index, Offset) do { \\',
            '    (Index) += (Offset); \\',
            '    if ((Index) >= (AL_U32)AL_GBE_RX_DESC_CNT) { \\',
            '        (Index) = ((Index) - (AL_U32)AL_GBE_RX_DESC_CNT); \\',
            '    } \\',
            '} while (0)',
            '',
            'AL_GBE_HwConfigStruct *AlGbe_Dev_LookupConfig(AL_U32 DevId);',
            '',
            'AL_S32 AlGbe_Dev_Init(AL_GBE_DevStruct *Gbe, AL_GBE_HwConfigStruct *HwConfig,',
            '                     AL_GBE_InitStruct *InitConfig, AL_GBE_MacDmaConfigStruct *MacDmaConfig);',
        ].join(eol);
        expect(formatC(input)).toBe(input);
        expect(formatC(formatC(input))).toBe(input);
    });

    it('宏内跨行条件、调用和声明保持原样，宏外保留通用换行', () => {
        const macro = [
            '# define UPDATE(x) do { \\',
            '    if ((x) && \\',
            '        ready()) { \\',
            '        send( \\',
            '            x); \\',
            '        value = factor * \\',
            '            read(x); \\',
            '    } \\',
            '    int last = 1; \\',
            '    int longer = 2; \\',
            '} while (0)',
        ].join('\n');
        const input = `${macro}\n\nvoid run()\n{\nsend(\n    value);\n}`;
        const expected = input;
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('宏内未配对的括号不改变外部代码的缩进层级', () => {
        const macro = '#define OPEN_SCOPE \\\n    {';
        const input = `void run() {\n${macro}\n    run_step();\n}`;
        const expected = `void run() {\n${macro}\n    run_step();\n}`;
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('Doxygen 分组中的花括号不使顶层枚举多缩进一层', () => {
        const input = [
            '/**',
            ' * @defgroup GBE GBE driver',
            ' * @{',
            ' */',
            '#define AL_GBE_CRC_PAD_INSERT 0x04000000U',
            '',
            '/* GBE error code define */',
            'typedef enum {',
            '    AL_GBE_ERR_INVALID_DEVICE_ID = 0x100,',
            '    AL_GBE_ERR_CONFIG = 0x101,',
            '} AL_GBE_ErrorCodeEnum;',
        ].join('\n');
        const output = formatC(input);
        expect(output).toContain('\n/* GBE error code define */\ntypedef enum {\n');
        expect(output).toContain('\n    AL_GBE_ERR_CONFIG');
        expect(output).toContain('\n} AL_GBE_ErrorCodeEnum;');
        expect(formatC(output)).toBe(output);
    });

    it('对齐连续的变量定义', () => {
        const input = [
            'uint8_t a = 0;',
            'const uint32_t *long_value = NULL;',
            'char name[16];',
        ].join('\n');

        expect(formatC(input)).toBe([
            'uint8_t        a           = 0    ;',
            'const uint32_t *long_value = NULL ;',
            'char           name[16]           ;',
        ].join('\n'));
        expect(formatC(formatC(input))).toBe(formatC(input));
    });

    it('对齐混合类型全局变量的名称、等号、初始值、分号和注释', () => {
        const input = [
            'double      g_accel_accel =DEFAULT_ACCEL_ACCEL;',
            'uint32_t    g_merge_weight =    DEFAULT_MERGE_WEIGHT  ;',
            'uint32_t    g_data_proc_mode = DEFAULT_DATA_PROC_MODE;',
            'static bool g_update_flash = false; // 是否需要更新参数组到 Flash 的标志，由 GPIO 触发',
            'static bool g_update_flash_last =false; // 上一次更新状态',
            'bool        g_data_through =  false;',
        ].join('\n');
        const expected = [
            'double      g_accel_accel       = DEFAULT_ACCEL_ACCEL    ;',
            'uint32_t    g_merge_weight      = DEFAULT_MERGE_WEIGHT   ;',
            'uint32_t    g_data_proc_mode    = DEFAULT_DATA_PROC_MODE ;',
            'static bool g_update_flash      = false                  ;  // 是否需要更新参数组到 Flash 的标志，由 GPIO 触发',
            'static bool g_update_flash_last = false                  ;  // 上一次更新状态',
            'bool        g_data_through      = false                  ;',
        ].join('\n');

        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
        expect(formatC(input.replace(/\n/g, '\r\n'))).toBe(expected.replace(/\n/g, '\r\n'));
    });

    it('保留初始值内部空格和比较表达式并分别对齐独立声明组', () => {
        const input = [
            'void run() {',
            '    const char *label =  "a  =  b"  ; // 文本',
            '    bool ready =count == limit;',
            '',
            '    int x =1;',
            '    int total =  20;',
            '    // 独立声明',
            '    int single = 3;',
            '}',
        ].join('\n');
        const expected = [
            'void run() {',
            '    const char *label = "a  =  b"      ;  // 文本',
            '    bool       ready  = count == limit ;',
            '',
            '    int x     = 1  ;',
            '    int total = 20 ;',
            '    // 独立声明',
            '    int single = 3;',
            '}',
        ].join('\n');

        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('对齐函数内数组元素的寄存器读取赋值', () => {
        const input = [
            'static int read_and_apply_parameters(void) {',
            '    uint32_t values[INTERP_VALUE_COUNT];',
            '',
            '    values[INTERP_VALUE_ACCEL_ACCEL] = platform_read32(SYS_CTRL_BASE + SYS_CTRL_RD_ACCEL_ACCEL);',
            '    values[INTERP_VALUE_SCALE_SPEED_LIMIT] =platform_read32(SYS_CTRL_BASE + SYS_CTRL_RD_SCALE_SPEED_LIMIT); // 限速',
            '    values[INTERP_VALUE_MAX_ACCEL] =  platform_read32(SYS_CTRL_BASE + SYS_CTRL_RD_MAX_ACCEL); // 最大加速度',
            '',
            '    if (validate_parameter_values(values) != 0) {',
            '        return -1;',
            '    }',
            '    apply_parameter_values(values);',
            '}',
        ].join('\n');
        const expected = [
            'static int read_and_apply_parameters(void) {',
            '    uint32_t values[INTERP_VALUE_COUNT];',
            '',
            '    values[INTERP_VALUE_ACCEL_ACCEL]       = platform_read32(SYS_CTRL_BASE + SYS_CTRL_RD_ACCEL_ACCEL)       ;',
            '    values[INTERP_VALUE_SCALE_SPEED_LIMIT] = platform_read32(SYS_CTRL_BASE + SYS_CTRL_RD_SCALE_SPEED_LIMIT) ;  // 限速',
            '    values[INTERP_VALUE_MAX_ACCEL]         = platform_read32(SYS_CTRL_BASE + SYS_CTRL_RD_MAX_ACCEL)         ;  // 最大加速度',
            '',
            '    if (validate_parameter_values(values) != 0) {',
            '        return -1;',
            '    }',
            '    apply_parameter_values(values);',
            '}',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
        expect(formatC(input.replace(/\n/g, '\r\n'))).toBe(expected.replace(/\n/g, '\r\n'));
    });

    it('按缩进、空行和控制语句分组，不把无花括号的条件赋值与后续语句对齐', () => {
        const input = [
            'void run() {',
            '    if (ready)',
            '        values[LONG_INDEX] = read32(BASE);',
            '    x = read32(BASE);',
            '    longer = read32(OFFSET);',
            '',
            '    y = 1;',
            '    z = 2;',
            '    // 下一组',
            '    if (ready) {',
            '        state.x = 1;',
            '        state->longer = 20;',
            '    }',
            '}',
        ].join('\n');
        const expected = [
            'void run() {',
            '    if (ready)',
            '        values[LONG_INDEX] = read32(BASE);',
            '    x      = read32(BASE)   ;',
            '    longer = read32(OFFSET) ;',
            '',
            '    y = 1 ;',
            '    z = 2 ;',
            '    // 下一组',
            '    if (ready) {',
            '        state.x       = 1  ;',
            '        state->longer = 20 ;',
            '    }',
            '}',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('保留赋值表达式中的字符串、比较运算和多参数调用', () => {
        const input = [
            'void run() {',
            '    text = "https://a;b=1";',
            '    ready = count == limit;',
            '    value = read32(BASE, OFFSET);',
            '}',
        ].join('\n');
        const expected = [
            'void run() {',
            '    text  = "https://a;b=1"      ;',
            '    ready = count == limit       ;',
            '    value = read32(BASE, OFFSET) ;',
            '}',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('跳过注释内赋值、比较语句、复合赋值和一行多条语句', () => {
        const input = [
            'void run() {',
            '    /*',
            '    values[A] = read32(BASE);',
            '    values[LONG_INDEX] = read32(OFFSET);',
            '    */',
            '    x == 1;',
            '    longer != 2;',
            '    x += 1;',
            '    longer += 2;',
            '    x = 1; next = 2;',
            '    longer = 3; next = 4;',
            '    /* 保留前置注释 */ x = read32(BASE);',
            '    /* 保留前置注释 */ longer = read32(OFFSET);',
            '}',
        ].join('\n');
        expect(formatC(input)).toBe(input);
    });

    it('对齐通用排版后的赋值，保留 C++ 原始字符串内容', () => {
        const input = [
            'void run() {',
            '    values[A] = read32(BASE, OFFSET);',
            '    values[LONG_INDEX] = read32(BASE, LONG_OFFSET);',
            '',
            '    text = R"tag(a " = ; // b)tag";',
            '    other = "short";',
            '}',
        ].join('\n');
        const output = formatC(input);
        const assignments = output.split('\n').filter(line => line.trim().startsWith('values['));
        expect(assignments).toHaveLength(2);
        expect(assignments[0].indexOf('=')).toBe(assignments[1].indexOf('='));
        expect(assignments[0].indexOf(';')).toBe(assignments[1].indexOf(';'));
        expect(output).toContain('read32(BASE, OFFSET)');
        expect(output).toContain('R"tag(a " = ; // b)tag"');
        expect(formatC(output)).toBe(output);
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

    it('对齐连续同名调用的参数、逗号、右括号和行尾注释', () => {
        const input = [
            'void write_feedback(void) {',
            '    write_reg(A, x); // 短参数',
            '    write_reg(LONG, value); // 长参数',
            '}',
        ].join('\n');
        const expected = [
            'void write_feedback(void) {',
            '    write_reg(A    , x     );  // 短参数',
            '    write_reg(LONG , value );  // 长参数',
            '}',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
        expect(formatC(input.replace(/\n/g, '\r\n'))).toBe(expected.replace(/\n/g, '\r\n'));
    });

    it('对齐寄存器回传调用并保留类型转换和计算表达式', () => {
        const input = [
            'static void write_interp_param_feedback(void) {',
            '    write_reg(SYS_CTRL_BASE + SYS_CTRL_WR_ACCEL_ACCEL, (u32)g_accel_accel);',
            '    write_reg(SYS_CTRL_BASE + SYS_CTRL_WR_DECEL_SCALE, (u32)(g_decel_scale * INTERP_RATIO_SCALE));',
            '    write_reg(SYS_CTRL_BASE + SYS_CTRL_WR_INTERP_PARA_UPDATE_EN, (u32)g_interp_para_update);',
            '    write_reg(SYS_CTRL_BASE + SYS_CTRL_WR_INTERP_PARA_V, 0U);',
            '}',
        ].join('\n');
        const output = formatC(input);
        const calls = output.split('\n').filter(line => line.trim().startsWith('write_reg('));
        expect(calls).toHaveLength(4);
        expect(new Set(calls.map(line => line.indexOf(','))).size).toBe(1);
        expect(new Set(calls.map(line => line.indexOf(');'))).size).toBe(1);
        expect(output).toContain('(u32)(g_decel_scale * INTERP_RATIO_SCALE)');
        expect(formatC(output)).toBe(output);
    });

    it('拆分参数时保留嵌套调用、数组下标、初始化列表和字符串内的逗号', () => {
        const input = [
            'send(select(A, B), values[index(1, 2)], "a,b//c");',
            'send(f(), Point{1, 2}, R"tag(x,y)tag");',
        ].join('\n');
        const output = formatC(input);
        expect(output).toContain('select(A, B)');
        expect(output).toContain('values[index(1, 2)]');
        expect(output).toContain('Point{1, 2}');
        expect(output).toContain('"a,b//c"');
        expect(output).toContain('R"tag(x,y)tag"');
        const lines = output.split('\n');
        expect(lines[0].indexOf(');')).toBe(lines[1].indexOf(');'));
        expect(formatC(output)).toBe(output);
    });

    it('连续调用按函数名、参数数量、缩进及空行分组', () => {
        const input = [
            'void run() {',
            '    if (ready)',
            '        write_reg(LONG, value);',
            '    write_reg(A, x);',
            '    other_reg(LONG, value);',
            '    other_reg(x);',
            '',
            '    other_reg(LONG);',
            '    // 下一组',
            '    other_reg(x);',
            '    write_reg(A) /* 分号前注释 */;',
            '    write_reg(LONG) /* 保留注释 */;',
            '    /*',
            '    write_reg(A, x);',
            '    write_reg(LONG, value);',
            '    */',
            '}',
        ].join('\n');
        expect(formatC(input)).toBe(input);
    });

    it('对齐通用排版后的参数，并跳过模板实参和一行多条语句', () => {
        const input = [
            'write_reg(A, x);',
            'write_reg(LONG, value);',
            '',
            'write_reg(A, pair<int, int>());',
            'write_reg(LONG, pair<int, int>());',
            'write_reg(A, x); next();',
            'write_reg(LONG, value); next();',
        ].join('\n');
        const expected = [
            'write_reg(A    , x     );',
            'write_reg(LONG , value );',
            '',
            'write_reg(A, pair<int, int>());',
            'write_reg(LONG, pair<int, int>());',
            'write_reg(A, x); next();',
            'write_reg(LONG, value); next();',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('多列对齐不合并通用排版保留的跨行函数调用', () => {
        const input = [
            '    send_packet(',
            '        socket,',
            '        buffer,',
            '        length);',
        ].join('\n');

        expect(formatC(input)).toBe(input);
    });

    it('多列对齐不合并赋值和成员函数的跨行调用', () => {
        const input = [
            'result = object.build(',
            '    first,',
            '    second);',
        ].join('\n');

        expect(formatC(input)).toBe(input);
    });

    it('多列对齐不合并赋值表达式的跨行计算', () => {
        const input = [
            'plan->accel[i] = direction * peak_accel *',
            '   s_curve_weight(i, step_num, selected_ramp) /',
            '   (double)selected_ramp;',
        ].join('\n');

        expect(formatC(input)).toBe(input);
    });

    it('对齐连续宏定义的宏体列', () => {
        const input = [
            '#define reg_write8 AL_REG8_WRITE(reg_addr, value)',
            '#define reg_write16 AL_REG16_WRITE(reg_addr, value)',
            '#define reg_write32 AL_REG32_WRITE(reg_addr, value)',
            '#define reg_write64 AL_REG64_WRITE(reg_addr, value)',
            '#define reg_read8 AL_REG8_READ(reg_addr)',
            '#define reg_read16 AL_REG16_READ(reg_addr)',
            '#define reg_read32 AL_REG32_READ(reg_addr)',
            '#define reg_read64 AL_REG64_READ(reg_addr)',
        ].join('\n');

        expect(formatC(input)).toBe([
            '#define reg_write8  AL_REG8_WRITE(reg_addr, value)',
            '#define reg_write16 AL_REG16_WRITE(reg_addr, value)',
            '#define reg_write32 AL_REG32_WRITE(reg_addr, value)',
            '#define reg_write64 AL_REG64_WRITE(reg_addr, value)',
            '#define reg_read8   AL_REG8_READ(reg_addr)',
            '#define reg_read16  AL_REG16_READ(reg_addr)',
            '#define reg_read32  AL_REG32_READ(reg_addr)',
            '#define reg_read64  AL_REG64_READ(reg_addr)',
        ].join('\n'));
    });

    it('将带注释和无注释的寄存器宏定义一起对齐', () => {
        const input = [
            '#define SYS_CTRL_RD_ACCEL_ACCEL            0x4000U       // data_in_1：加速加速度',
            '#define SYS_CTRL_RD_INTERP_PARA_UPDATE_EN 0x4024U // data_in_10：参数更新',
            '#define SYS_CTRL_RD_MAX_ACCEL    0x402CU    // data_in_12：最大加速度',
            '#define SYS_CTRL_RD_MERGE_CMD_DELAY 0x4040U',
            '#define SYS_CTRL_RD_MERGE_THRED 0x4044U',
        ].join('\n');
        const output = formatC(input);
        const lines = output.split('\n');
        expect(new Set(lines.map(line => line.indexOf('0x'))).size).toBe(1);
        expect(new Set(lines.filter(line => line.includes('//')).map(line => line.indexOf('//'))).size).toBe(1);
        expect(lines[1]).toBe('#define SYS_CTRL_RD_INTERP_PARA_UPDATE_EN 0x4024U  // data_in_10：参数更新');
        expect(lines[3].endsWith('0x4040U')).toBe(true);
        expect(formatC(output)).toBe(output);
        expect(formatC(input.replace(/\n/g, '\r\n'))).toBe(output.replace(/\n/g, '\r\n'));
    });

    it('统一宏指令空格并按不同长度的宏值对齐两种行尾注释', () => {
        const input = [
            '#define    A 0x1U // 短值',
            '#define LONG_NAME (BASE + 4U) /* 表达式 */',
            '#define B 0x4000U',
        ].join('\n');
        const expected = [
            '#define A         0x1U         // 短值',
            '#define LONG_NAME (BASE + 4U)  /* 表达式 */',
            '#define B         0x4000U',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('保留宏值字符串内的注释符号、空格和函数宏签名', () => {
        const input = [
            '#define URL "https://host/a  b" // 地址',
            '#define RAW R"tag(a " // b)tag" // 原始文本',
            '#define PICK(x) ((x) + 1) // 函数宏',
        ].join('\n');
        const output = formatC(input);
        expect(output).toContain('"https://host/a  b"');
        expect(output).toContain('R"tag(a " // b)tag"');
        expect(output).toContain('#define PICK(x) ((x) + 1)');
        const lines = output.split('\n');
        expect(new Set(lines.map(line => line.lastIndexOf('//'))).size).toBe(1);
        expect(formatC(output)).toBe(output);
    });

    it('在空行和条件编译处分组，跳过多行宏及注释中的宏定义', () => {
        const input = [
            '#define A 1 // 一',
            '#define LONG_NAME 2 // 二',
            '',
            '#ifdef ENABLED',
            '#define B 3 // 三',
            '#define CC 4 // 四',
            '#endif',
            '#define MULTI(x) \\',
            '((x) + 1)',
            '/*',
            '#define OLD 1 // 历史文本',
            '#define OLD_LONG 2 // 历史文本',
            '*/',
        ].join('\n');
        const expected = [
            '#define A         1  // 一',
            '#define LONG_NAME 2  // 二',
            '',
            '#ifdef ENABLED',
            '#define B  3  // 三',
            '#define CC 4  // 四',
            '#endif',
            '#define MULTI(x) \\',
            '((x) + 1)',
            '/*',
            '#define OLD 1 // 历史文本',
            '#define OLD_LONG 2 // 历史文本',
            '*/',
        ].join('\n');
        expect(formatC(input)).toBe(expected);
        expect(formatC(expected)).toBe(expected);
    });

    it('对齐连续函数式宏定义的宏体列', () => {
        const input = [
            '#define write_reg(base_addr, offset, val) AL_REG32_WRITE((base_addr) + (offset), val)',
            '#define read_reg(base_addr, offset) AL_REG32_READ((base_addr) + (offset))',
        ].join('\n');

        expect(formatC(input)).toBe([
            '#define write_reg(base_addr, offset, val) AL_REG32_WRITE((base_addr) + (offset), val)',
            '#define read_reg(base_addr, offset)       AL_REG32_READ((base_addr) + (offset))',
        ].join('\n'));
    });

    it('不把普通函数调用后的代码块误识别为函数定义', () => {
        const input = ['foo()', '{', '    run();', '}'].join('\n');
        expect(formatC(input)).toBe(input);
    });

    it('不把控制语句的左花括号改成函数样式', () => {
        const input = ['if (ready)', '{', '    run();', '}'].join('\n');
        expect(formatC(input)).toBe(input);
    });
});
