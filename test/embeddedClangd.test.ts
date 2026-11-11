// 验证随插件分发的 clangd 能独立解析类型定义和结构体成员补全。
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';

const windowsTest = process.platform === 'win32' ? it : it.skip;

windowsTest('不依赖其他扩展时解析 C 类型定义并补全结构体成员', async () => {
    const executable = path.resolve('out/clangd/clangd_23.1.0/bin/clangd.exe');
    expect(fs.existsSync(executable)).toBe(true);
    const server = spawn(executable, ['--background-index=0'], { windowsHide: true });
    const connection = createMessageConnection(new StreamMessageReader(server.stdout), new StreamMessageWriter(server.stdin));
    connection.listen();
    const root = pathToFileURL(path.resolve('test/samples')).href;
    const uri = pathToFileURL(path.resolve('test/samples/embedded_clangd_test.c')).href;
    const line = 'void run(void) { g_mtd_status.';
    const text = ['typedef struct { int curr_x; int curr_y; } MtdStatus;', 'MtdStatus g_mtd_status;', line + '; }', ''].join('\n');
    try {
        await connection.sendRequest('initialize', { processId: process.pid, rootUri: root, capabilities: {}, workspaceFolders: null });
        await connection.sendNotification('initialized', {});
        await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'c', version: 1, text } });
        const definition: any = await connection.sendRequest('textDocument/definition', { textDocument: { uri }, position: { line: 1, character: 3 } });
        expect(definition.length).toBeGreaterThan(0);
        expect(definition[0].uri).toBe(uri);
        expect(definition[0].range.start.line).toBe(0);
        const completion: any = await connection.sendRequest('textDocument/completion', { textDocument: { uri }, position: { line: 2, character: line.length } });
        const items = Array.isArray(completion) ? completion : completion.items;
        const labels = items.map((item: { label: string }) => item.label.trim());
        expect(labels).toEqual(expect.arrayContaining(['curr_x', 'curr_y']));
        expect(labels).not.toContain('g_mtd_status');
    } finally {
        await connection.sendRequest('shutdown');
        await connection.sendNotification('exit');
        connection.dispose();
        server.kill();
    }
}, 30000);
