// =========================================================================
// 文件    : todoScanner.test.ts
// 描述    : todoScanner 模块单元测试
// 版本    : v1.0
// 日期    : 2026/05/28
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/05/28    创建文件
// =========================================================================

jest.mock('@vscode/ripgrep', () => ({ rgPath: '/usr/bin/rg' }));

import { parseRgLine, groupByFile } from '../../src/features/todo/todoScanner';
import type { TodoItem } from '../../src/features/todo/todoScanner';

describe('parseRgLine', () => {
    it('应解析合法的 rg match 行', () => {
        const line = JSON.stringify({
            type: 'match',
            data: {
                path: { text: '/workspace/main.c' },
                line_number: 10,
                lines: { text: '  // TODO: fix this\n' },
                submatches: [{ match: { text: 'TODO' }, start: 5, end: 9 }],
            },
        });
        const item = parseRgLine(line, ['TODO', 'FIXME']);
        expect(item).not.toBeNull();
        expect(item!.tag).toBe('TODO');
        expect(item!.line).toBe(9); // 0-based
        expect(item!.text).toBe('fix this');
        expect(item!.file).toBe('/workspace/main.c');
    });

    it('应忽略非 match 类型行', () => {
        const line = JSON.stringify({ type: 'begin', data: { path: { text: '/foo.c' } } });
        expect(parseRgLine(line, ['TODO'])).toBeNull();
    });

    it('应忽略不在 tags 列表中的匹配', () => {
        const line = JSON.stringify({
            type: 'match',
            data: {
                path: { text: '/workspace/main.c' },
                line_number: 5,
                lines: { text: '// HACK something\n' },
                submatches: [{ match: { text: 'HACK' }, start: 3, end: 7 }],
            },
        });
        expect(parseRgLine(line, ['TODO', 'FIXME'])).toBeNull();
    });
});

describe('groupByFile', () => {
    it('应按文件路径分组', () => {
        const items: TodoItem[] = [
            { file: '/a.c', line: 0, col: 0, tag: 'TODO', text: 'one' },
            { file: '/b.c', line: 1, col: 0, tag: 'FIXME', text: 'two' },
            { file: '/a.c', line: 5, col: 0, tag: 'NOTE', text: 'three' },
        ];
        const groups = groupByFile(items);
        expect(groups.get('/a.c')).toHaveLength(2);
        expect(groups.get('/b.c')).toHaveLength(1);
    });
});
