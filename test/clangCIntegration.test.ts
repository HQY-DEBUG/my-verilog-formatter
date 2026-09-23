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

    it('普通 C++ 空格、块缩进和花括号布局与原生结果一致', async () => {
        const input = 'namespace sample{\nvoid run(int n){for(int i=0;i<n;++i){if(i%2==0){emit(i);}else{emit(-i);}}}\n}\n';
        const output = await format(input);
        expect(output).toBe(await runClangFormat(input, path.join(__dirname, 'example.cpp')));
        expect(output).toContain('for (int i = 0; i < n; ++i)');
        expect(output).toContain('if (i % 2 == 0)');
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

    it('选区保留完整函数上下文且不对齐区域外的变量', async () => {
        const input = 'int outside=1;\nlong another=2;\nvoid run() {\nint x=1;\nlong longer=2;\n}\n';
        const output = await format(input, undefined, new vscode.Range(3, 0, 5, 0));
        expect(output).toMatch(/^int outside=1;\nlong another=2;\n/);
        expect(output).toContain('    int  x      = 1 ;\n    long longer = 2 ;');
    });
});
