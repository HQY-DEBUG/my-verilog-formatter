// 验证 clang-format 进程边界、错误传播和完整文档/选区入口。
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import { execFile } from 'child_process';
import { runClangFormat } from '../src/features/c/clangFormat';
import { CFormatter, formatC } from '../src/features/c/cFormatter';

jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn() }));
jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    extensions: { getExtension: jest.fn() },
    TextEdit: { replace: (range: vscode.Range, newText: string) => ({ range, newText }) },
}));

function document(text: string): vscode.TextDocument {
    const lines = text.split('\n');
    return {
        getText: () => text, version: 1, languageId: 'cpp', fileName: path.resolve('example.cpp'),
        lineCount: lines.length,
        lineAt: (line: number) => ({ range: { end: new vscode.Position(line, lines[line].length) } }),
    } as unknown as vscode.TextDocument;
}

afterEach(() => { jest.restoreAllMocks(); jest.resetAllMocks(); });

describe('clang-format 进程', () => {
    function processResult(error: Error | null, output: string, stderr = ''): PassThrough {
        const stdin = new PassThrough();
        (execFile as unknown as jest.Mock).mockImplementation((_exe, _args, _options, callback) => {
            process.nextTick(() => callback(error, output, stderr));
            return { stdin };
        });
        return stdin;
    }

    it('源码从标准输入传递，保留参数边界并使用工程配置及 LLVM 后备样式', async () => {
        const stdin = processResult(null, 'int x = 1;\n');
        const filename = path.resolve('带 空格', 'a.cpp');
        const output = await runClangFormat('int x=1;\n', filename, { start: 2, end: 4 });
        expect(output).toBe('int x = 1;\n');
        expect(stdin.read().toString()).toBe('int x=1;\n');
        const [exe, args, options] = (execFile as unknown as jest.Mock).mock.calls[0];
        expect(exe).toBe('clang-format');
        expect(args).toContain(`--assume-filename=${filename}`);
        expect(args).toContain('--lines=2:4');
        expect(args).toContain('--fallback-style=LLVM');
        const style = JSON.parse(args.find((arg: string) => arg.startsWith('--style=')).slice(8));
        expect(style).toEqual({ BasedOnStyle: 'InheritParentConfig', IndentWidth: 4, SkipMacroDefinitionBody: true });
        expect(options).toMatchObject({ windowsHide: true, timeout: 10000 });
        expect(options.shell).toBeUndefined();
    });

    it('优先使用用户配置的绝对路径', async () => {
        const executable = path.resolve('tools', 'clang-format');
        jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({ get: () => executable } as any);
        processResult(null, '');
        await runClangFormat('', 'test.cpp');
        expect((execFile as unknown as jest.Mock).mock.calls[0][0]).toBe(executable);
    });

    it('自动复用 C/C++ 扩展的 LLVM 程序', async () => {
        const extensionPath = path.resolve('extensions', 'cpptools');
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ extensionPath });
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        processResult(null, '');
        await runClangFormat('', 'test.cpp');
        expect((execFile as unknown as jest.Mock).mock.calls[0][0])
            .toBe(path.join(extensionPath, 'LLVM', 'bin', process.platform === 'win32' ? 'clang-format.exe' : 'clang-format'));
    });

    it('可执行文件或配置错误向上传播，不返回局部格式化结果', async () => {
        processResult(new Error('exit 1'), 'partial', 'invalid style');
        await expect(runClangFormat('int x;', 'test.cpp')).rejects.toThrow('invalid style');
    });

    it('拒绝相对路径并报告标准输入错误', async () => {
        const config = jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({ get: () => './tool' } as any);
        await expect(runClangFormat('', 'test.cpp')).rejects.toThrow('绝对路径');
        expect(execFile).not.toHaveBeenCalled();
        config.mockRestore();
        const stdin = new PassThrough();
        (execFile as unknown as jest.Mock).mockReturnValue({ stdin });
        const pending = runClangFormat('int x;', 'test.cpp');
        stdin.emit('error', new Error('EPIPE'));
        await expect(pending).rejects.toThrow('EPIPE');
    });
});

describe('C/C++ 格式化入口', () => {
    it('只在 clang-format 输出上应用约定对齐，不重新压缩换行', async () => {
        const baseline = 'void run()\n{\n    int x = 1;\n    long longer = 2;\n    send(\n        first_argument,\n        second_argument);\n}\n';
        const clang = jest.fn().mockResolvedValue(baseline);
        const doc = document('void run(){int x=1; long longer=2;}');
        const edits = await new CFormatter(clang).provideDocumentFormattingEdits(doc);
        expect(clang).toHaveBeenCalledWith(doc.getText(), doc.fileName, undefined);
        expect(edits[0].newText).toContain('    int  x      = 1 ;\n    long longer = 2 ;');
        expect(edits[0].newText).toContain('send(\n        first_argument,\n        second_argument);');
        expect(edits[0].newText).toContain('void run()\n{');
    });

    it('选区传入完整上下文，选区外不执行定制对齐', async () => {
        const original = 'int outside=1;\nlong another=2;\nvoid run(){\nint x=1;\nlong longer=2;\n}\n';
        const baseline = 'int outside=1;\nlong another=2;\nvoid run(){\n    int x = 1;\n    long longer = 2;\n}\n';
        const clang = jest.fn().mockResolvedValue(baseline);
        const doc = document(original);
        const edits = await new CFormatter(clang).provideDocumentRangeFormattingEdits(doc, new vscode.Range(3, 0, 5, 0));
        expect(clang).toHaveBeenCalledWith(original, doc.fileName, { start: 4, end: 5 });
        expect(edits[0].newText).toMatch(/^int outside=1;\nlong another=2;\nvoid run\(\)\{/);
        expect(edits[0].newText).toContain('    int  x      = 1 ;\n    long longer = 2 ;');
    });

    it('等待期间文档发生变化时丢弃过期结果', async () => {
        const doc = document('int x=1;');
        const clang = jest.fn().mockImplementation(async () => {
            (doc as any).version++;
            return 'int x = 1;';
        });
        expect(await new CFormatter(clang).provideDocumentFormattingEdits(doc)).toEqual([]);
    });

    it('部分宏选区也保留宏体，不把最后一行当作普通声明对齐', () => {
        const code = '#define DECLARE \\\n    int x; \\\n    int longer;\nint normal;';
        expect(formatC(code, { start: 2, end: 4 })).toBe(code);
    });

    it('后处理遵守 clang-format off 并保留多行注释和原始字符串', () => {
        const code = [
            '// clang-format off', 'int x=1;', 'long longer=2;', '// clang-format on',
            '/*', 'int x=1;', 'long longer=2;', '*/',
            'const char *text = R"tag(', 'int x=1;', 'long longer=2;', ')tag";',
        ].join('\n');
        expect(formatC(code)).toBe(code);
    });
});
