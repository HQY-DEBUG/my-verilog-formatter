// 设置 CLANG_FORMAT_TEST_EXE 后，使用真实 clang-format 验证完整格式化链路。
import * as vscode from 'vscode';
import * as path from 'path';
import { CFormatter } from '../src/features/c/cFormatter';
import { runClangFormat } from '../src/features/c/clangFormat';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    extensions: { getExtension: () => undefined },
    TextEdit: { replace: (range: vscode.Range, newText: string) => ({ range, newText }) },
}));

const executable = process.env.CLANG_FORMAT_TEST_EXE;
const nativeTests = executable ? describe : describe.skip;
nativeTests('真实 clang-format 集成', () => {
    beforeEach(() => {
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: (key: string, defaultValue: unknown) => key === 'clangFormatPath' ? executable : defaultValue,
        } as any);
    });
    afterEach(() => jest.restoreAllMocks());

    async function format(text: string, filename = path.join(__dirname, 'example.cpp'), range?: vscode.Range): Promise<string> {
        const lines = text.split('\n');
        const doc = {
            getText: () => text, version: 1, languageId: 'cpp', fileName: filename,
            lineCount: lines.length,
            lineAt: (line: number) => ({ range: { end: new vscode.Position(line, lines[line].length) } }),
        } as unknown as vscode.TextDocument;
        const formatter = new CFormatter();
        const edits = range
            ? await formatter.provideDocumentRangeFormattingEdits(doc, range)
            : await formatter.provideDocumentFormattingEdits(doc);
        return edits.length ? edits[0].newText : text;
    }

    it('普通 C++ 布局遵循原生规则，短函数保持多行', async () => {
        const input = 'namespace sample{\nvoid run(int n){for(int i=0;i<n;++i){if(i%2==0){emit(i);}else{emit(-i);}}}\n}\n'
            + 'static void ps_led_flashing() { AlGpio_Hal_WritePin(GPIO, PL_LED_1, ~LedState); }\n';
        const output = await format(input);
        expect(output).toBe(await runClangFormat(input, path.join(__dirname, 'example.cpp')));
        expect(output).toContain('for (int i = 0; i < n; ++i)');
        expect(output).toContain('if (i % 2 == 0)');
        expect(output).toContain('static void ps_led_flashing() {\n    AlGpio_Hal_WritePin(GPIO, PL_LED_1, ~LedState);\n}');
        expect(await format(output)).toBe(output);
    });

    it('默认行宽 999999 保留带中文注释的声明、长调用和控制条件', async () => {
        const input = [
            'static volatile AL_U32 TimerCount = 0; // 中断写入、主循环读取，需要使用 volatile。',
            'void process_packet() {',
            'send_packet(first_very_long_argument_name, second_very_long_argument_name, third_very_long_argument_name);',
            'if (first_very_long_condition_name && second_very_long_condition_name && third_very_long_condition_name) {',
            'consume_packet();', '}', '}', '',
        ].join('\n');
        const output = await format(input);
        expect(output).toBe(await runClangFormat(input, path.join(__dirname, 'example.cpp')));
        expect(output).toContain(input.split('\n')[0]);
        expect(output).toContain('send_packet(first_very_long_argument_name, second_very_long_argument_name, third_very_long_argument_name);');
        expect(output).toContain('if (first_very_long_condition_name && second_very_long_condition_name && third_very_long_condition_name)');
        expect(await format(output)).toBe(output);
    });

    it.each(['\n', '\r\n'])('switch 的连续 case/default 缩进一级，分支语句再缩进一级（%j）', async eol => {
        const input = [
            'void handle_event(void) {',
            'switch (event->Event) {',
            'case AL_GBE_EVENT_RX_DONE:',
            'case AL_GBE_EVENT_RX_BUFFER_UNAVAILABLE:',
            'ethernetif_input(&g_platform_netif);',
            'break;',
            'case AL_GBE_EVENT_TX_DONE:',
            'case AL_GBE_EVENT_TX_BUFFER_UNAVAILABLE:',
            'if (AlGbe_Hal_ReleaseTxPacket(hdl) != ST_SUCCESS)',
            'g_gbe_error = 1;',
            'break;',
            'default:', '++g_gbe_other_event;', 'break;', '}', '}', '',
        ].join(eol);
        const expected = [
            'void handle_event(void) {',
            '    switch (event->Event) {',
            '        case AL_GBE_EVENT_RX_DONE:',
            '        case AL_GBE_EVENT_RX_BUFFER_UNAVAILABLE:',
            '            ethernetif_input(&g_platform_netif);',
            '            break;',
            '        case AL_GBE_EVENT_TX_DONE:',
            '        case AL_GBE_EVENT_TX_BUFFER_UNAVAILABLE:',
            '            if (AlGbe_Hal_ReleaseTxPacket(hdl) != ST_SUCCESS)',
            '                g_gbe_error = 1;',
            '            break;',
            '        default:', '            ++g_gbe_other_event;', '            break;', '    }', '}', '',
        ].join(eol);
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
    });

    it('嵌套 switch 的 case/default 分别跟随所属 switch 缩进', async () => {
        const input = 'void run() { switch (outer) { case 1: switch (inner) { case 2: work(); break; default: break; } break; default: break; } }\n';
        const output = await format(input);
        expect(output).toContain('\n        case 1:\n            switch (inner) {\n                case 2:\n                    work();');
        expect(output).toContain('\n                default:\n                    break;\n            }');
        expect(output).toContain('\n        default:\n            break;\n    }');
        expect(await format(output)).toBe(output);
    });

    it.each(['\n', '\r\n'])('匿名枚举成员一行一个，并保留枚举项对齐（%j）', async eol => {
        const input = `enum { BOOT_WAIT, BOOT_READY, BOOT_FAILED };${eol}`;
        const expected = [
            'enum {',
            '    BOOT_WAIT   ,',
            '    BOOT_READY  ,',
            '    BOOT_FAILED',
            '};', '',
        ].join(eol);
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
    });

    it.each([
        ['enum BootState', ''],
        ['typedef enum', ' BootState'],
        ['enum class BootState : unsigned', ''],
    ])('展开 %s 并保留赋值和行尾注释', async (declaration, suffix) => {
        const input = `${declaration} { BOOT_WAIT = 0, BOOT_READY = 1, BOOT_FAILED = 2 }${suffix}; // 状态\n`;
        const output = await format(input);
        const members = output.split('\n').filter(line => /^\s+BOOT_/.test(line));
        expect(members).toHaveLength(3);
        expect(members[0]).toMatch(/^\s+BOOT_WAIT\s*= 0\s*,$/);
        expect(members[1]).toMatch(/^\s+BOOT_READY\s*= 1\s*,$/);
        expect(members[2]).toMatch(/^\s+BOOT_FAILED\s*= 2\s*$/);
        expect(output).toContain(`}${suffix}; // 状态`);
        expect(await format(output)).toBe(output);
    });

    it('可以修改行宽设置，其他工程样式仍继承', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: (key: string, defaultValue: unknown) => key === 'clangFormatPath' ? executable
                : key === 'columnLimit' ? 48 : defaultValue,
        });
        const filename = path.join(__dirname, 'samples', 'c-clang-style', 'example.cpp');
        const input = 'void process_packet(){ send_packet(first_argument_name, second_argument_name, third_argument_name); }\n';
        const output = await format(input, filename);
        expect(output).toContain('void process_packet()\n{\n');
        expect(output).toMatch(/send_packet\([^;]*\n[^;]*\);/);
        expect(await format(output, filename)).toBe(output);
    });

    it.each(['\n', '\r\n'])('TX/RX 宏不吞并后续声明，Doxygen 分组不增加枚举缩进（%j）', async eol => {
        const macro = [
            '#define INCR_TX_DESC_INDEX(Index, Offset) do {\\',
            '    (Index) += (Offset);\\',
            '    if ((Index) >= (AL_U32)AL_GBE_TX_DESC_CNT) {\\',
            '        (Index) = ((Index) - (AL_U32)AL_GBE_TX_DESC_CNT);}\\',
            '} while (0)', '',
            '#define INCR_RX_DESC_INDEX(Index, Offset) do { \\',
            '    (Index) += (Offset); \\',
            '    if ((Index) >= (AL_U32)AL_GBE_RX_DESC_CNT) { \\',
            '        (Index) = ((Index) - (AL_U32)AL_GBE_RX_DESC_CNT); \\',
            '    } \\', '} while (0)',
        ].join(eol);
        const input = ['/**', ' * @defgroup GBE GBE driver', ' * @{', ' */',
            '    /* GBE error code define */', '    typedef enum {',
            '        AL_GBE_ERR_INVALID_DEVICE_ID = 0x100,', '        AL_GBE_ERR_CONFIG = 0x101,',
            '    } AL_GBE_ErrorCodeEnum;', '', macro, '',
            'AL_GBE_HwConfigStruct *AlGbe_Dev_LookupConfig(AL_U32 DevId);', '',
        ].join(eol);
        const output = await format(input);
        expect(output).toContain(`${eol}typedef enum {${eol}`);
        expect(output).toContain(macro);
        expect(output).toContain(`${eol}AL_GBE_HwConfigStruct *AlGbe_Dev_LookupConfig(AL_U32 DevId);`);
        expect(await format(output)).toBe(output);
    });

    it('通用格式化后仍保留变量、赋值和调用的多列对齐', async () => {
        const input = 'void run() {\nint x=1;\nlong longer=2;\nx=read(A);\nlonger=read(LONG);\nwrite(A,x);\nwrite(LONG,longer);\n}\n';
        const output = await format(input);
        expect(output).toContain('    int  x      = 1 ;\n    long longer = 2 ;');
        expect(output).toContain('    x      = read(A)    ;\n    longer = read(LONG) ;');
        expect(output).toContain('    write(A    , x      );\n    write(LONG , longer );');
        expect(await format(output)).toBe(output);
    });

    it('保留原始字符串内容和 clang-format off 区域', async () => {
        const disabled = '// clang-format off\nint x=1;\nlong longer=2;\n// clang-format on';
        const raw = 'R"tag(\nint a=1;\nlong value=2;\n)tag"';
        const input = `${disabled}\nconst char *text = ${raw};\n`;
        const output = await format(input);
        expect(output).toContain(disabled);
        expect(output).toContain(raw);
        expect(await format(output)).toBe(output);
    });

    it('clang-format 后继续对齐 typedef 别名、分号和块注释', async () => {
        const input = [
            'typedef uint8_t Xuint8; /**< unsigned 8-bit */',
            'typedef float Xfloat32; /**< 32-bit floating point */',
            'typedef unsigned long Xboolean; /**< boolean (XTRUE or XFALSE) */',
            '',
        ].join('\n');
        const expected = [
            'typedef uint8_t       Xuint8   ;  /**< unsigned 8-bit */',
            'typedef float         Xfloat32 ;  /**< 32-bit floating point */',
            'typedef unsigned long Xboolean ;  /**< boolean (XTRUE or XFALSE) */',
            '',
        ].join('\n');
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
        expect(await format(input.replace(/\n/g, '\r\n'))).toBe(expected.replace(/\n/g, '\r\n'));
    });

    it.each(['\n', '\r\n'])('展开并按列对齐超过二十项的命令表（%j）', async eol => {
        const entries: Array<[string, number]> = [
            ['PROTO_CMD_EXT_SET_CTRLMODE_L', 1], ['PROTO_CMD_EXT_SET_STARTADDR_L', 1],
            ['PROTO_CMD_JUMP_L', 8], ['PROTO_CMD_MARK_L', 8], ['PROTO_CMD_MARK_ARC', 8],
            ['PROTO_CMD_MARK_ELLIPSE', 9], ['PROTO_CMD_SCAN_L_DELAY_MODE', 5],
            ['PROTO_CMD_SCAN_L_JUMP_SPEED', 1], ['PROTO_CMD_SCAN_L_MARK_SPEED', 1],
            ['PROTO_CMD_SCAN_L_SCAN_DELAY', 3], ['PROTO_CMD_SCAN_L_SKY_MODE', 1],
            ['PROTO_CMD_SCAN_L_SKY_PARAM', 4], ['PROTO_CMD_SCAN_L_SKY_LIMIT', 1],
            ['PROTO_CMD_PROG_CONTINUE', 0], ['PROTO_CMD_PROG_LIST_JUMP', 2],
            ['PROTO_CMD_PROG_NEXT', 0], ['PROTO_CMD_PROG_NOP', 0],
            ['PROTO_CMD_PROG_REPEAT_START', 0], ['PROTO_CMD_PROG_REPEAT_END', 1],
            ['PROTO_CMD_PROG_DELAY', 1], ['PROTO_CMD_PROG_END', 0],
            ['PROTO_CMD_PROG_BREAKPOINT', 1], ['PROTO_CMD_LASL_OUT_TYPE', 1],
            ['PROTO_CMD_LASL_AUTO_PARAM', 4], ['PROTO_CMD_LASL_ENC_SPEED', 3],
            ['PROTO_CMD_LASL_DELAY', 2], ['PROTO_CMD_LASL_OUT_PIN', 1],
            ['PROTO_CMD_LASL_PULSE_CFG', 2], ['PROTO_CMD_LASL_VECTOR_CTRL', 2],
            ['PROTO_CMD_XFRL_SET_ANGLE', 3], ['PROTO_CMD_XFRL_SET_FSHIFT', 1],
            ['PROTO_CMD_XFRL_SET_FOFFSET', 1], ['PROTO_CMD_XFRL_SET_MATRIX', 6],
            ['PROTO_CMD_XFRL_SET_OFFSET', 6], ['PROTO_CMD_XFRL_SET_SCALE', 3],
            ['PROTO_CMD_LACL_ON_INTERVAL', 1], ['PROTO_CMD_LACL_START_PULSE', 2],
            ['PROTO_CMD_LACL_CTRL', 1],
        ];
        const header = 'static const ListCmdInfo g_cmd_info[] = {';
        const rows = entries.map(([name, value]) => `{ ${name}, ${value}u }`);
        const input = [header, '    ' + rows.join(', ') + ',', '};', ''].join(eol);
        const output = await format(input, path.join(__dirname, 'example.c'));
        const lines = output.split(eol);
        expect(lines).toHaveLength(entries.length + 3);
        expect(lines[0]).toBe(header);
        expect(lines[lines.length - 2]).toBe('};');
        const elements = lines.slice(1, -2);
        elements.forEach((line, index) => {
            expect(line.trim()).toMatch(new RegExp(`^\\{${entries[index][0]}, +${entries[index][1]}u\\},$`));
        });
        expect(new Set(elements.map(line => line.search(/\d+u/))).size).toBe(1);
        expect(new Set(elements.map(line => line.indexOf('}'))).size).toBe(1);
        expect(await format(output)).toBe(output);
        const multiline = [header, ...rows.map(row => `    ${row},`), '};', ''].join(eol);
        expect(await format(multiline)).toBe(output);
        expect(await format(input, undefined, new vscode.Range(0, 0, 3, 0))).toBe(output);
    });

    it('结构体数组换行时保留嵌套表达式、字符串及行尾注释', async () => {
        const input = 'const Entry entries[] = {\n{make(1, 2), "a,b"}, // 第一项\n{other(), "x"}\n};\n';
        const expected = 'const Entry entries[] = {\n    {make(1, 2), "a,b"}, // 第一项\n    {other(), "x"}\n};\n';
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
        const scalars = 'const int values[] = {1, 2, 3};\n';
        expect(await format(scalars)).toBe(scalars);
    });

    it('小型表格对齐不同宽度的字段并保持原有成员顺序', async () => {
        const input = 'const Entry entries[] = {{CMD_LONG, 1u}, {CMD, 100u}};\n';
        const expected = 'const Entry entries[] = {\n    {CMD_LONG, 1u  },\n    {CMD,      100u}\n};\n';
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
    });

    it.each(['\n', '\r\n'])('保留指定成员初始化的多行布局和内嵌单行数组（%j）', async eol => {
        const initializer = [
            'const NetConfig net_config = {',
            '    .ip_addr  = "192.168.1.10",',
            '    .netmask  = "255.255.255.0",',
            '    .gateway  = "192.168.1.1",',
            '    .mac      = {0x00, 0x0a, 0x35, 0x00, 0x01, 0x02},',
            '    .udp_port = 6001u',
            '};', '',
        ].join(eol);
        const input = initializer + `void run(){work(1,2);}${eol}`;
        const expected = initializer + ['void run() {', '    work(1, 2);', '}', ''].join(eol);
        const output = await format(input);
        expect(output).toBe(expected);
        expect(await format(output)).toBe(output);
        expect(await format(input, undefined, new vscode.Range(1, 0, 6, 0))).toBe(input);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: (key: string, defaultValue: unknown) => key === 'clangFormatPath' ? executable
                : key === 'columnLimit' ? 48 : defaultValue,
        });
        expect(await format(initializer)).toBe(initializer);
    });

    it('保留嵌套指定成员初始化中的注释、字符串和各层换行', async () => {
        const input = [
            'const Config config = {',
            '    .name = "text }, { // not comment",',
            '    .network = {',
            '        .port = 6001, /* 保留这一行 */',
            '        .flags = {1, 2}',
            '    }',
            '};', '',
        ].join('\n');
        expect(await format(input)).toBe(input);
        expect(await format(await format(input))).toBe(input);
    });

    it('不提前结束用户的 clang-format off 区域，单行初始化仍按通用规则处理', async () => {
        const disabled = [
            '// clang-format off', 'const Config x={', ' .value=1', '};',
            'int   keep=1;', '// clang-format on', '',
        ].join('\n');
        const input = disabled + 'const Config single={.value=1, .other=2};\n';
        const output = await format(input);
        expect(output.startsWith(disabled)).toBe(true);
        expect(output).toContain('const Config single = {.value = 1, .other = 2};');
        expect(await format(output)).toBe(output);
    });

    it.each(['\n', '\r\n'])('真实格式化将 Doxygen 展开为多行并保持重复格式化稳定（%j）', async eol => {
        const input = ['/** @brief FileSaveParams 命令参数，字段按协议顺序排列。 */',
            'typedef struct {', '    int value; /**< 参数值 */', '} FileSaveParams;', ''].join(eol);
        const expected = ['/**', ' * @brief FileSaveParams 命令参数，字段按协议顺序排列。', ' */',
            'typedef struct {', '    int value; /**< 参数值 */', '} FileSaveParams;', ''].join(eol);
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
    });

    it('真实格式化只展开选中的注释并保护禁用区域', async () => {
        const before = '/** @brief 区域外 */\nvoid first(void);\n\n';
        const selected = '/** @brief 区域内 */\nvoid second(void);\n';
        const after = '// clang-format off\n/** @brief 保持 */\n// clang-format on\n';
        const expected = before + '/**\n * @brief 区域内\n */\nvoid second(void);\n' + after;
        expect(await format(before + selected + after, undefined, new vscode.Range(3, 0, 4, 0))).toBe(expected);
        const full = await format(before + selected + after);
        expect(full.endsWith(after)).toBe(true);
        expect(await format(full)).toBe(full);
    });

    it('有限行宽时起止标记仍独占一行，选区行号随展开更新', async () => {
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: (key: string, fallback: unknown) => key === 'clangFormatPath' ? executable : key === 'columnLimit' ? 40 : fallback,
        } as any);
        const before = '/** @brief 区域外 */\nvoid first(void);\n';
        const comment = '/** @brief FileSaveParams 命令参数，字段按协议顺序排列。 */\n';
        const input = before + comment + 'int selected=1;\nint   outside=2;\n';
        const output = await format(input, undefined, new vscode.Range(2, 0, 4, 0));
        expect(output.startsWith(before + '/**\n * @brief FileSaveParams\n')).toBe(true);
        expect(output).toContain('\n */\nint selected = 1;\n');
        expect(output.endsWith('int   outside=2;\n')).toBe(true);
        const full = await format(input);
        expect(await format(full)).toBe(full);
    });

    it.each(['\n', '\r\n'])('真实 clang-format 后拆列对齐 static/struct/类型名（%j）', async eol => {
        const input = ['static udp_queue_t udp_queue;', 'static udp_queue_t udp_reply_queue;',
            'static struct udp_pcb *g_udp_pcb;', ''].join(eol);
        const expected = ['static        udp_queue_t  udp_queue       ;',
            'static        udp_queue_t  udp_reply_queue ;',
            'static struct udp_pcb     *g_udp_pcb       ;', ''].join(eol);
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
        expect(await format(input, undefined, new vscode.Range(0, 0, 3, 0))).toBe(expected);
    });

    it.each(['\n', '\r\n'])('真实 clang-format 后指针名称与普通成员名称对齐（%j）', async eol => {
        const input = ['typedef struct {', '    u32 total_packages;', '    u32 package_num;',
            '    const u8 *payload;', '    u32 payload_size;', '} FileParams;', ''].join(eol);
        const expected = ['typedef struct {', '    u32       total_packages ;', '    u32       package_num    ;',
            '    const u8 *payload        ;', '    u32       payload_size   ;', '} FileParams;', ''].join(eol);
        expect(await format(input)).toBe(expected);
        expect(await format(expected)).toBe(expected);
    });

    it('选区内的指针声明独立对齐，不调整选区外的声明', async () => {
        const before = 'int   outside=1;\nlong   count=2;\nvoid run(void) {\n';
        const input = before + 'const u8 *payload;\nu32 payload_size;\n}\n';
        const output = await format(input, undefined, new vscode.Range(3, 0, 5, 0));
        expect(output.startsWith(before)).toBe(true);
        expect(output).toContain('    const u8 *payload      ;\n    u32       payload_size ;');
    });

    it('选区保留完整函数上下文且不对齐区域外的变量', async () => {
        const input = 'int outside=1;\nlong another=2;\nvoid run() {\nint x=1;\nlong longer=2;\n}\n';
        const output = await format(input, undefined, new vscode.Range(3, 0, 5, 0));
        expect(output).toMatch(/^int outside=1;\nlong another=2;\n/);
        expect(output).toContain('    int  x      = 1 ;\n    long longer = 2 ;');
    });
});
