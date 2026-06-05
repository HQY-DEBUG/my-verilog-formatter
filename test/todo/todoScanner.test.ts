// =========================================================================
// 文件    : todoScanner.test.ts
// 描述    : todoScanner 模块单元测试
// 版本    : v1.1
// 日期    : 2026/06/05
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.1    26/06/05    新增 charCol Unicode 字节偏移转换测试
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
                // rg submatches[0] 是完整匹配文本（含分隔符 :）
                submatches: [{ match: { text: 'TODO:' }, start: 5, end: 10 }],
            },
        });
        const item = parseRgLine(line, ['TODO', 'FIXME']);
        expect(item).not.toBeNull();
        expect(item!.tag).toBe('TODO');
        expect(item!.line).toBe(9); // 0-based
        expect(item!.text).toBe('fix this');
        expect(item!.file).toBe('/workspace/main.c');
    });

    it('ASCII 行 col 与 charCol 应相等', () => {
        // ASCII-only 行：字节偏移 == 字符偏移
        const line = JSON.stringify({
            type: 'match',
            data: {
                path: { text: '/a.ts' },
                line_number: 1,
                lines: { text: '    // TODO: ascii only\n' },
                submatches: [{ match: { text: 'TODO:' }, start: 7, end: 12 }],
            },
        });
        const item = parseRgLine(line, ['TODO']);
        expect(item).not.toBeNull();
        expect(item!.col).toBe(7);
        expect(item!.charCol).toBe(7); // 纯 ASCII，字节 == 字符
    });

    it('Unicode 行 charCol 应按字符偏移而非字节偏移', () => {
        // "// 注释 TODO:" —— "注释" 各占 3 字节，// 和空格是 ASCII
        // 实际：'// ' (3 bytes) + '注' (3) + '释' (3) + ' ' (1) = 10 bytes before TODO
        const lineText = '// 注释 TODO: something\n';
        // 计算实际字节偏移
        const byteOffset = Buffer.byteLength('// 注释 ', 'utf8'); // 3+3+3+1 = 10
        const line = JSON.stringify({
            type: 'match',
            data: {
                path: { text: '/b.ts' },
                line_number: 1,
                lines: { text: lineText },
                submatches: [{ match: { text: 'TODO:' }, start: byteOffset, end: byteOffset + 5 }],
            },
        });
        const item = parseRgLine(line, ['TODO']);
        expect(item).not.toBeNull();
        expect(item!.col).toBe(byteOffset);           // 原始字节偏移保留
        expect(item!.charCol).toBe('// 注释 '.length); // 字符偏移 = 6（JS string length）
        expect(item!.charCol).toBeLessThan(item!.col); // 字符数 < 字节数（有中文）
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
                submatches: [{ match: { text: 'HACK ' }, start: 3, end: 8 }],
            },
        });
        expect(parseRgLine(line, ['TODO', 'FIXME'])).toBeNull();
    });
});

describe('groupByFile', () => {
    it('应按文件路径分组', () => {
        const items: TodoItem[] = [
            { file: '/a.c', line: 0, col: 0, charCol: 0, tag: 'TODO',  text: 'one'   },
            { file: '/b.c', line: 1, col: 0, charCol: 0, tag: 'FIXME', text: 'two'   },
            { file: '/a.c', line: 5, col: 0, charCol: 0, tag: 'NOTE',  text: 'three' },
        ];
        const groups = groupByFile(items);
        expect(groups.get('/a.c')).toHaveLength(2);
        expect(groups.get('/b.c')).toHaveLength(1);
    });
});
