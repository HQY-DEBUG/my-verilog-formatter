import { buildRgArgs, mergeTagConfig, DEFAULT_TAG_CONFIGS } from '../../src/features/todo/todoConfig';

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
        expect(globs.some(g => g.includes('node_modules'))).toBe(true);
    });
});

describe('mergeTagConfig', () => {
    it('自定义配置应覆盖默认配置', () => {
        const result = mergeTagConfig('TODO', { foreground: 'red' });
        expect(result.foreground).toBe('red');
        expect(result.icon).toBe(DEFAULT_TAG_CONFIGS['TODO'].icon);
    });
});
