// 覆盖 C 函数解析、头文件到实现、未保存缓冲区及跨文件作用域边界。
import * as vscode from 'vscode';
import * as path from 'path';
import { parseCFunctions } from '../src/features/c/cFunctionParser';
import { CDefinitionProvider, registerCFunctionNavigation } from '../src/features/c/cDefinitionProvider';

jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    const file = (name: string): any => ({ fsPath: name, path: name.replace(/\\/g, '/'), scheme: 'file',
        toString: () => name.replace(/\\/g, '/'), with: ({ path: next }: any) => file(next) });
    return { ...actual, Uri: { file },
        FileSystemError: class extends Error { code = 'FileNotFound'; },
        RelativePattern: class { constructor(public base: any, public pattern: string) {} },
        workspace: { ...actual.workspace, textDocuments: [], fs: { stat: jest.fn(), readFile: jest.fn() },
            findFiles: jest.fn(), getWorkspaceFolder: jest.fn() },
        languages: { registerDefinitionProvider: jest.fn(() => ({ dispose() {} })) },
        commands: { registerCommand: jest.fn(() => ({ dispose() {} })) },
    };
});

const root = path.resolve('test-c-project');
const uri = (name: string) => vscode.Uri.file(path.join(root, name));
const token = { isCancellationRequested: false } as vscode.CancellationToken;
function doc(name: string, text: string): vscode.TextDocument {
    const positionAt = (offset: number) => new vscode.Position(text.slice(0, offset).split('\n').length - 1,
        offset - text.lastIndexOf('\n', offset - 1) - 1);
    const offsetAt = (pos: vscode.Position) => text.split('\n').slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.character;
    return { uri: uri(name), positionAt, offsetAt,
        getText: (range?: vscode.Range) => range ? text.slice(offsetAt(range.start), offsetAt(range.end)) : text,
        getWordRangeAtPosition: (pos: vscode.Position) => {
            const offset = offsetAt(pos);
            const match = [...text.matchAll(/[A-Za-z_]\w*/g)].find(item => item.index! <= offset && item.index! + item[0].length >= offset);
            return match ? new vscode.Range(positionAt(match.index!), positionAt(match.index! + match[0].length)) : undefined;
        },
    } as vscode.TextDocument;
}

describe('C 函数解析', () => {
    it.each(['\n', '\r\n'])('识别 _Noreturn、多行参数、函数指针参数和属性（%j）', eol => {
        const text = ['_Noreturn void platform_fault_stop(', 'unsigned core, int error) { for (;;) {} }',
            'static inline const char *lookup(void (*callback)(int)) { return 0; }',
            'void wait(void) __attribute__((noreturn)) { for (;;) {} }',
            '__declspec(noinline) void run(void) { }'].join(eol);
        expect(parseCFunctions(text).map(fn => [fn.name, fn.isStatic])).toEqual([
            ['platform_fault_stop', false], ['lookup', true], ['wait', false], ['run', false],
        ]);
        for (const fn of parseCFunctions(text)) { expect(text.slice(fn.offset, fn.offset + fn.name.length)).toBe(fn.name); }
    });

    it('忽略原型、函数调用、宏续行、注释、字符串、控制块与函数指针变量', () => {
        const text = [
            'void declared(void);', 'typedef void (*Handler)(void);', 'void (*pointer)(void);',
            '#define FAKE(x) \\', 'void macro_fn(x) { }',
            '// void line_comment(void) {}', '/* void block_comment(void) {} */',
            'const char *s = "void string_fn(void) {}";',
            'void real(void) { called(); if (test()) { nested(); } }',
            'int value = factory();',
        ].join('\n');
        expect(parseCFunctions(text).map(fn => fn.name)).toEqual(['real']);
    });
});

describe('C 定义跳转', () => {
    let disk: Map<string, string>;
    beforeEach(() => {
        jest.clearAllMocks();
        disk = new Map();
        (vscode.workspace as any).textDocuments = [];
        (vscode.workspace.fs.stat as jest.Mock).mockImplementation(async target => {
            if (!disk.has(target.toString())) { throw new vscode.FileSystemError(); }
            return { mtime: 1, size: disk.get(target.toString())!.length };
        });
        (vscode.workspace.fs.readFile as jest.Mock).mockImplementation(async target => Buffer.from(disk.get(target.toString())!));
        (vscode.workspace.findFiles as jest.Mock).mockImplementation(async () => [...disk.keys()].map(vscode.Uri.file));
        (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue({ uri: vscode.Uri.file(root) });
    });
    const add = (name: string, text: string) => disk.set(uri(name).toString(), text);
    const lookup = (document: vscode.TextDocument, name = 'platform_fault_stop', provider = new CDefinitionProvider()) =>
        provider.provideDefinition(document, document.positionAt(document.getText().indexOf(name) + 2), token);

    it('从截图形式的头文件声明跳到同名 C 文件的函数体，返回准确行列', async () => {
        const header = doc('board/app_platform.h', '_Noreturn void platform_fault_stop(unsigned core, int error);');
        add('board/app_platform.c', '// 中文说明\r\n\r\n_Noreturn void platform_fault_stop(unsigned core, int error) { for (;;) {} }');
        add('backup/app_platform.c', 'void platform_fault_stop(void) {}');
        const result = await lookup(header);
        expect(result).toHaveLength(1);
        expect(result[0].uri.toString()).toBe(uri('board/app_platform.c').toString());
        expect(result[0].range.start).toEqual(new vscode.Position(2, 15));
        expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
    });

    it('优先当前未保存实现，不回到原型或其他工程', async () => {
        const current = doc('main.c', 'void run(void);\nvoid start(void) { run(); }\nvoid run(void) {}');
        add('other.c', 'void run(void) {}');
        const result = await lookup(current, 'run');
        expect(result).toHaveLength(1);
        expect(result[0].range.start.line).toBe(2);
        expect(vscode.workspace.fs.stat).not.toHaveBeenCalled();
    });

    it('同名源文件读取未保存缓冲区而不是旧磁盘内容', async () => {
        const header = doc('api.h', 'void run(void);');
        add('api.c', 'void old(void) {}');
        (vscode.workspace as any).textDocuments = [doc('api.c', '\nvoid run(void) {}')];
        const result = await lookup(header, 'run');
        expect(result[0].range.start.line).toBe(1);
    });

    it('搜索工作区时排除其他 C 文件和未包含头文件的静态函数，保留多个外部实现', async () => {
        const current = doc('main.c', 'void start(void) { run(); }');
        add('private.c', 'static void run(void) {}');
        add('private.h', 'static inline void run(void) {}');
        add('first.c', 'void run(void) {}');
        add('second.c', 'void run(void) {}');
        const result = await lookup(current, 'run');
        expect(result.map(item => item.uri.toString())).toEqual([uri('first.c').toString(), uri('second.c').toString()]);
    });

    it('支持直接包含头文件里的 static inline 函数', async () => {
        add('inline.h', 'static inline void run(void) {}');
        const result = await lookup(doc('main.c', '#include "inline.h"\nvoid start(void) { run(); }'), 'run');
        expect(result).toHaveLength(1);
    });

    it('未打开工作区时仍支持同目录配对文件', async () => {
        (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);
        add('api.c', 'void run(void) {}');
        expect(await lookup(doc('api.h', 'void run(void);'), 'run')).toHaveLength(1);
        expect(await lookup(doc('unpaired.h', 'void missing(void);'), 'missing')).toEqual([]);
    });

    it.each(['// run()', 'const char *s = "run()";', '#define CALL run()'])('注释、字面量和宏不跳转：%s', async text => {
        add('api.c', 'void run(void) {}');
        expect(await lookup(doc('api.h', text), 'run')).toEqual([]);
    });

    it('取消查询时不读取文件；读取错误会传播', async () => {
        const current = doc('api.h', 'void run(void);');
        expect(await new CDefinitionProvider().provideDefinition(current, new vscode.Position(0, 6),
            { isCancellationRequested: true } as any)).toEqual([]);
        expect(vscode.workspace.fs.stat).not.toHaveBeenCalled();
        (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error('permission denied'));
        await expect(lookup(current, 'run')).rejects.toThrow('permission denied');
    });

    it('磁盘更新后刷新缓存', async () => {
        const provider = new CDefinitionProvider();
        const header = doc('api.h', 'void run(void);');
        add('api.c', 'void run(void) {}');
        expect((await lookup(header, 'run', provider))[0].range.start.line).toBe(0);
        add('api.c', '\nvoid run(void) {}');
        expect((await lookup(header, 'run', provider))[0].range.start.line).toBe(1);
    });

    it('注册 C 和按 C++ 识别的 .h 文件以及独立查找命令', () => {
        registerCFunctionNavigation({ subscriptions: [] } as any);
        expect(vscode.languages.registerDefinitionProvider).toHaveBeenCalledWith(expect.arrayContaining([
            { language: 'cpp', scheme: 'file', pattern: '**/*.{c,h}' },
        ]), expect.any(CDefinitionProvider));
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith('verilogFormatter.c.goToFunction', expect.any(Function));
    });
});
