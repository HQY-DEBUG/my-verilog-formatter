// 使用真实 Git 仓库验证历史查询、重命名追踪和只读内容访问。
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitHistoryService } from '../src/features/gitHistory/gitHistoryService';

describe('文件 Git 历史', () => {
    let root: string;
    let service: GitHistoryService;
    let first: string;
    let second: string;
    let renamed: string;
    let latest: string;
    const originalName = '旧 文件 [1].txt';
    const currentName = '中文 & 文件 [1].txt';

    function git(...args: string[]): string {
        return execFileSync('git', ['-C', root, '-c', 'user.name=历史测试',
            '-c', 'user.email=history@example.invalid', '-c', 'commit.gpgSign=false',
            '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', windowsHide: true });
    }

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'formatter-git-history-'));
        git('init', '-q');
        fs.writeFileSync(path.join(root, originalName), '第一版\n');
        git('add', '--', originalName);
        git('commit', '-qm', '初始版本');
        first = git('rev-parse', 'HEAD').trim();
        fs.writeFileSync(path.join(root, originalName), '第二版\n');
        git('commit', '-qam', '更新内容');
        second = git('rev-parse', 'HEAD').trim();
        git('mv', '--', originalName, currentName);
        git('commit', '-qm', '重命名文件');
        renamed = git('rev-parse', 'HEAD').trim();
        fs.writeFileSync(path.join(root, currentName), '第三版\n');
        git('commit', '-qam', '最新内容');
        latest = git('rev-parse', 'HEAD').trim();
    });

    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

    beforeEach(() => {
        service = new GitHistoryService();
    });

    it('按时间倒序查询并跨重命名保留各版本的实际文件路径', async () => {
        const history = await service.getFileHistory(path.join(root, currentName));
        expect(history.commits.map((commit: any) => [commit.hash, commit.subject, commit.filePath]))
            .toEqual([
                [latest, '最新内容', currentName], [renamed, '重命名文件', currentName],
                [second, '更新内容', originalName], [first, '初始版本', originalName],
            ]);
        expect(history.commits[0].author).toBe('历史测试');
        expect(history.commits[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(history.hasMore).toBe(false);
    });

    it('分页能判断是否还有记录，加载更多后仍能追踪旧路径', async () => {
        const page = await service.getFileHistory(path.join(root, currentName), 2);
        expect(page.commits.map((commit: any) => commit.hash)).toEqual([latest, renamed]);
        expect(page.hasMore).toBe(true);
        const all = await service.getFileHistory(path.join(root, currentName), 4);
        expect(all.commits.map((commit: any) => commit.hash)).toEqual([latest, renamed, second, first]);
        expect(all.hasMore).toBe(false);
    });

    it('读取重命名前后的历史内容，不改动工作区和暂存区', async () => {
        fs.writeFileSync(path.join(root, currentName), '尚未提交的内容\n');
        const before = git('status', '--porcelain=v1');
        expect(await service.readRevision(root, first, originalName)).toBe('第一版\n');
        expect(await service.readRevision(root, latest, currentName)).toBe('第三版\n');
        expect(fs.readFileSync(path.join(root, currentName), 'utf8')).toBe('尚未提交的内容\n');
        expect(git('status', '--porcelain=v1')).toBe(before);
    });

    it('未跟踪文件没有历史，路径中的通配符不会匹配其他文件', async () => {
        expect((await service.getFileHistory(path.join(root, '*.txt'))).commits).toEqual([]);
        expect((await service.getFileHistory(path.join(root, 'new.txt'))).commits).toEqual([]);
    });

    it('空仓库没有提交时返回空历史', async () => {
        const emptyRoot = path.join(root, 'empty');
        fs.mkdirSync(emptyRoot);
        execFileSync('git', ['init', '-q', emptyRoot], { windowsHide: true });
        expect((await service.getFileHistory(path.join(emptyRoot, 'new.txt'))).commits).toEqual([]);
    });

    it('拒绝非法版本和逃出仓库的路径，不把输入当 Git 选项', async () => {
        await expect(service.readRevision(root, '--help', currentName)).rejects.toThrow();
        await expect(service.readRevision(root, first, '../outside.txt')).rejects.toThrow();
        await expect(service.readRevision(root, first, '/outside.txt')).rejects.toThrow();
    });

    it('按编辑器编码读取 UTF-16 和 Windows 代码页，拒绝二进制内容', async () => {
        fs.writeFileSync(path.join(root, 'wide.txt'), Buffer.from('宽字符\n', 'utf16le'));
        fs.writeFileSync(path.join(root, 'western.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
        fs.writeFileSync(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
        git('add', '--', 'wide.txt', 'western.txt', 'binary.bin');
        git('commit', '-qm', '添加不同编码的文件');
        const hash = git('rev-parse', 'HEAD').trim();
        expect(await service.readRevision(root, hash, 'wide.txt', 'utf16le')).toBe('宽字符\n');
        expect(await service.readRevision(root, hash, 'western.txt', 'windows1252')).toBe('café');
        await expect(service.readRevision(root, hash, 'binary.bin')).rejects.toThrow(/二进制/);
    });

    it('删除提交有明确标记，空文本文件仍可读取', async () => {
        fs.writeFileSync(path.join(root, 'empty.txt'), '');
        git('add', '--', 'empty.txt');
        git('commit', '-qm', '添加空文件');
        const added = git('rev-parse', 'HEAD').trim();
        git('rm', '--', 'empty.txt');
        git('commit', '-qm', '删除空文件');
        const history = await service.getFileHistory(path.join(root, 'empty.txt'));
        expect(history.commits.map((commit: any) => commit.deleted)).toEqual([true, false]);
        expect(await service.readRevision(root, added, 'empty.txt')).toBe('');
    });

    it('记录冲突解决的合并提交，并用第一父提交作为上一个版本', async () => {
        const mergeRoot = path.join(root, 'merge');
        fs.mkdirSync(mergeRoot);
        const mergeGit = (...args: string[]) => execFileSync('git', ['-C', mergeRoot,
            '-c', 'user.name=测试', '-c', 'user.email=history@example.invalid',
            '-c', 'commit.gpgSign=false', ...args], { encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
        mergeGit('init', '-q', '-b', 'main');
        fs.writeFileSync(path.join(mergeRoot, 'shared.txt'), 'base\n');
        mergeGit('add', 'shared.txt'); mergeGit('commit', '-qm', 'base');
        mergeGit('checkout', '-qb', 'side');
        fs.writeFileSync(path.join(mergeRoot, 'shared.txt'), 'side\n');
        mergeGit('commit', '-qam', 'side');
        mergeGit('checkout', '-q', 'main');
        fs.writeFileSync(path.join(mergeRoot, 'shared.txt'), 'main\n');
        mergeGit('commit', '-qam', 'main');
        const mainParent = mergeGit('rev-parse', 'HEAD').trim();
        expect(() => mergeGit('merge', 'side')).toThrow();
        fs.writeFileSync(path.join(mergeRoot, 'shared.txt'), 'resolved\n');
        mergeGit('add', 'shared.txt'); mergeGit('commit', '-qm', 'resolve conflict');
        const mergeHash = mergeGit('rev-parse', 'HEAD').trim();
        const history = await service.getFileHistory(path.join(mergeRoot, 'shared.txt'));
        expect(history.commits[0]).toMatchObject({ hash: mergeHash, subject: 'resolve conflict',
            previous: { hash: mainParent, filePath: 'shared.txt' } });
        expect(await service.readRevision(mergeRoot, history.commits[0].hash, 'shared.txt')).toBe('resolved\n');
        expect(await service.readRevision(mergeRoot, history.commits[0].previous!.hash, 'shared.txt')).toBe('main\n');
    });

    it('用户关闭根提交显示时，仍保留文件首次添加版本', async () => {
        git('config', 'log.showRoot', 'false');
        try {
            const history = await service.getFileHistory(path.join(root, currentName));
            expect(history.commits.map(commit => commit.hash)).toContain(first);
        } finally { git('config', '--unset', 'log.showRoot'); }
    });

    it('侧分支重命名后合并时沿主线追踪路径，不把重命名显示成删除', async () => {
        const mergeRoot = path.join(root, 'rename-merge');
        fs.mkdirSync(mergeRoot);
        const mergeGit = (...args: string[]) => execFileSync('git', ['-C', mergeRoot,
            '-c', 'user.name=测试', '-c', 'user.email=history@example.invalid',
            '-c', 'commit.gpgSign=false', ...args], { encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
        mergeGit('init', '-q', '-b', 'main');
        const lines = Array.from({ length: 20 }, (_, index) => `line ${index}\n`);
        fs.writeFileSync(path.join(mergeRoot, 'old.txt'), lines.join(''));
        mergeGit('add', 'old.txt'); mergeGit('commit', '-qm', 'initial');
        const initial = mergeGit('rev-parse', 'HEAD').trim();
        mergeGit('checkout', '-qb', 'side');
        mergeGit('mv', 'old.txt', 'new.txt'); mergeGit('commit', '-qm', 'rename');
        const sideLines = [...lines]; sideLines[0] = 'side change\n';
        fs.writeFileSync(path.join(mergeRoot, 'new.txt'), sideLines.join(''));
        mergeGit('commit', '-qam', 'side change');
        mergeGit('checkout', '-q', 'main');
        const mainLines = [...lines]; mainLines[19] = 'main change\n';
        fs.writeFileSync(path.join(mergeRoot, 'old.txt'), mainLines.join(''));
        mergeGit('commit', '-qam', 'main change');
        const parent = mergeGit('rev-parse', 'HEAD').trim();
        mergeGit('merge', '--no-ff', '-m', 'merge renamed file', 'side');
        const merged = mergeGit('rev-parse', 'HEAD').trim();
        const history = await service.getFileHistory(path.join(mergeRoot, 'new.txt'));
        expect(history.commits.map(commit => [commit.hash, commit.filePath, commit.deleted])).toEqual([
            [merged, 'new.txt', false], [parent, 'old.txt', false], [initial, 'old.txt', false],
        ]);
        expect(history.commits[0].previous).toEqual({ hash: parent, filePath: 'old.txt', deleted: false });
    });

    it('非 Git 目录和缺失的 Git 可执行文件明确报错', async () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'formatter-no-git-'));
        try {
            await expect(service.getFileHistory(path.join(outside, 'file.txt'))).rejects.toThrow();
            await expect(new GitHistoryService(path.join(outside, 'missing-git'))
                .getFileHistory(path.join(root, currentName))).rejects.toThrow(/Git/);
        } finally { fs.rmSync(outside, { recursive: true, force: true }); }
    });

    it('git.path 候选列表跳过不存在的程序后仍能读取历史', async () => {
        const candidates = new GitHistoryService([path.join(root, 'missing-git'), 'git']);
        expect((await candidates.getFileHistory(path.join(root, currentName))).commits[0].hash).toBe(latest);
    });

    it.each([
        ['shiftjis', [0x82, 0xa0], 'あ'], ['eucjp', [0xa4, 0xa2], 'あ'], ['cp950', [0xa4, 0xa4], '中'],
    ])('兼容 VS Code 的 %s 编码名称', async (encoding, bytes, expected) => {
        fs.writeFileSync(path.join(root, 'encoded.txt'), Buffer.from(bytes as number[]));
        git('add', '--', 'encoded.txt'); git('commit', '-qm', `编码 ${encoding}`);
        const hash = git('rev-parse', 'HEAD').trim();
        expect(await service.readRevision(root, hash, 'encoded.txt', encoding as string)).toBe(expected);
    });

    it.each([
        [[0xff, 0xfe, 0x2d, 0x4e], '中'], [[0xfe, 0xff, 0x4e, 0x2d], '中'],
        [[0xef, 0xbb, 0xbf, 0x41], 'A'],
    ])('历史文件有 BOM 时优先识别编码，覆盖默认 UTF-8 设置 %j', async (bytes, expected) => {
        fs.writeFileSync(path.join(root, 'bom.txt'), Buffer.from(bytes as number[]));
        git('add', '--', 'bom.txt'); git('commit', '-qm', 'BOM 编码');
        const hash = git('rev-parse', 'HEAD').trim();
        expect(await service.readRevision(root, hash, 'bom.txt', 'utf8')).toBe(expected);
        expect(await service.readRevision(root, hash, 'bom.txt', 'gbk')).toBe(expected);
    });
});
