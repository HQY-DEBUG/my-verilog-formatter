// =========================================================================
// 文件    : todoTreeProvider.test.ts
// 描述    : TodoTreeProvider 和 pathStartsWith 单元测试
// 版本    : v1.0
// 日期    : 2026/06/05
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/06/05    创建文件
// =========================================================================

// 必须在 import 之前声明 mock，避免 @vscode/ripgrep (ESM) 导致解析失败
jest.mock('@vscode/ripgrep', () => ({ rgPath: '/usr/bin/rg' }));

import * as path from 'path';
import { pathStartsWith } from '../../src/features/todo/todoTreeProvider';
import { TodoTreeProvider } from '../../src/features/todo/todoTreeProvider';
import type { TodoItem } from '../../src/features/todo/todoScanner';
import * as vscode from 'vscode';

// ---- pathStartsWith 测试 ----//
describe('pathStartsWith', () => {
    const sep = path.sep;

    it('子路径应匹配父路径', () => {
        const parent = `e:${sep}myfile${sep}my-verilog-formatter`;
        const child  = `e:${sep}myfile${sep}my-verilog-formatter${sep}src${sep}foo.ts`;
        expect(pathStartsWith(child, parent)).toBe(true);
    });

    it('路径大小写不敏感（Windows 驱动器字母）', () => {
        const parent = `E:${sep}myfile${sep}project`;
        const child  = `e:${sep}myfile${sep}project${sep}src${sep}foo.ts`;
        expect(pathStartsWith(child, parent)).toBe(true);
    });

    it('不应匹配同级目录（避免 /foo 匹配 /foobar）', () => {
        const parent = `e:${sep}myfile${sep}project`;
        const child  = `e:${sep}myfile${sep}project-backup${sep}foo.ts`;
        expect(pathStartsWith(child, parent)).toBe(false);
    });

    it('完全相同路径视为匹配', () => {
        const p = `e:${sep}myfile${sep}project`;
        expect(pathStartsWith(p, p)).toBe(true);
    });

    it('不同根路径不匹配', () => {
        const parent = `e:${sep}myfile${sep}project`;
        const child  = `e:${sep}other${sep}project${sep}foo.ts`;
        expect(pathStartsWith(child, parent)).toBe(false);
    });
});

// ---- TodoTreeProvider 树视图逻辑测试 ----//
describe('TodoTreeProvider - tree mode', () => {
    const WORKSPACE = `e:${path.sep}myfile${path.sep}project`;
    const FILE_A    = path.join(WORKSPACE, 'src', 'main.ts');
    const FILE_B    = path.join(WORKSPACE, 'lib', 'util.ts');

    const ITEMS: TodoItem[] = [
        { file: FILE_A, line: 9,  col: 3, tag: 'TODO',  text: 'fix this' },
        { file: FILE_A, line: 20, col: 3, tag: 'FIXME', text: 'broken'   },
        { file: FILE_B, line: 4,  col: 0, tag: 'NOTE',  text: 'info'     },
    ];

    function makeProvider(): TodoTreeProvider {
        // mock workspaceState
        const fakeContext = {
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
            },
        } as unknown as vscode.ExtensionContext;

        // mock workspaceFolders
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: WORKSPACE } },
        ];

        const provider = new TodoTreeProvider(fakeContext);
        // 直接注入测试数据（绕过 rg 调用）
        (provider as any).allItems = ITEMS;
        (provider as any).byFile   = new Map([
            [FILE_A, ITEMS.filter(i => i.file === FILE_A)],
            [FILE_B, ITEMS.filter(i => i.file === FILE_B)],
        ]);
        return provider;
    }

    it('树模式根节点应为文件节点', async () => {
        const provider = makeProvider();
        provider.setViewMode('tree');
        const roots = await provider.getChildren(undefined) as any[];
        expect(roots).toBeDefined();
        expect(roots.length).toBeGreaterThan(0);
        expect(roots.every((n: any) => n.nodeType === 'file')).toBe(true);
    });

    it('文件节点子节点应为 TODO 条目', async () => {
        const provider = makeProvider();
        provider.setViewMode('tree');
        const roots = await provider.getChildren(undefined) as any[];
        const fileNodeA = roots.find((n: any) => n.filePath === FILE_A);
        expect(fileNodeA).toBeDefined();
        const children = await provider.getChildren(fileNodeA) as any[];
        expect(children).toHaveLength(2);
        expect(children.map((c: any) => c.todoItem.tag).sort()).toEqual(['FIXME', 'TODO']);
    });

    it('平铺模式根节点应直接返回所有 TODO 条目', async () => {
        const provider = makeProvider();
        provider.setViewMode('flat');
        const roots = await provider.getChildren(undefined) as any[];
        expect(roots).toHaveLength(3);
        expect(roots.every((n: any) => n.nodeType === 'item')).toBe(true);
    });

    it('tags 模式根节点应按 tag 分组', async () => {
        const provider = makeProvider();
        provider.setViewMode('tags');
        const roots = await provider.getChildren(undefined) as any[];
        const tagNames = roots.map((n: any) => n.tagName).sort();
        expect(tagNames).toEqual(['FIXME', 'NOTE', 'TODO']);
    });

    it('驱动器大小写不同时树模式仍能正确过滤文件', async () => {
        // 模拟 workspace folder 大写，item 路径小写（Windows 常见场景）
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: WORKSPACE.replace(/^e:/, 'E:') } },  // 大写 E
        ];
        const fakeContext = {
            workspaceState: { get: () => undefined, update: () => Promise.resolve() },
        } as unknown as vscode.ExtensionContext;
        const provider = new TodoTreeProvider(fakeContext);
        // item.file 保持小写 e:（模拟 path.resolve 的结果）
        (provider as any).allItems = ITEMS;
        (provider as any).byFile   = new Map([
            [FILE_A, ITEMS.filter(i => i.file === FILE_A)],
            [FILE_B, ITEMS.filter(i => i.file === FILE_B)],
        ]);
        provider.setViewMode('tree');
        const roots = await provider.getChildren(undefined) as any[];
        // 应该找到文件节点，而不是空数组
        expect(roots.length).toBeGreaterThan(0);
    });
});
