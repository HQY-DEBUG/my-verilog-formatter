// =========================================================================
// 文件    : todoConfig.test.ts
// 描述    : todoConfig 模块单元测试
// 版本    : v1.0
// 日期    : 2026/05/28
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/05/28    创建文件
// =========================================================================

import { buildRgArgs, mergeTagConfig, DEFAULT_TAG_CONFIGS, getTodoConfig } from '../../src/features/todo/todoConfig';

describe('buildRgArgs', () => {
    it('应包含 --json 和 -n 参数', () => {
        const args = buildRgArgs(['TODO', 'FIXME'], ['**/node_modules/**']);
        expect(args).toContain('--json');
        expect(args).toContain('-n');
    });

    it('应将 tags 构造为正则 pattern', () => {
        const args = buildRgArgs(['TODO', 'FIXME'], []);
        const eIdx = args.indexOf('-e');
        expect(eIdx).toBeGreaterThan(-1);
        expect(args[eIdx + 1]).toContain('TODO');
        expect(args[eIdx + 1]).toContain('FIXME');
    });

    it('应包含 --glob 排除参数', () => {
        const args = buildRgArgs(['TODO'], ['**/node_modules/**', '**/.git/**']);
        const globs = args.filter((_, i) => args[i - 1] === '--glob');
        expect(globs.some(g => g === '!**/node_modules/**')).toBe(true);
    });
});

describe('mergeTagConfig', () => {
    it('自定义配置应覆盖默认配置', () => {
        const result = mergeTagConfig('TODO', { foreground: 'red' });
        expect(result.foreground).toBe('red');
        expect(result.icon).toBe(DEFAULT_TAG_CONFIGS['TODO'].icon);
    });
});

describe('getTodoConfig', () => {
    it('应返回包含默认标签的配置对象', () => {
        const cfg = getTodoConfig();
        expect(cfg.tags).toEqual(['TODO', 'FIXME', 'NOTE', 'HACK']);
        expect(cfg.showInStatusBar).toBe(true);
        expect(cfg.highlightEnabled).toBe(true);
        expect(cfg.excludePatterns).toContain('**/node_modules/**');
    });
});
