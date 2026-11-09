// 查询单个文件的 Git 历史与只读快照；不依赖外部扩展，也不执行 checkout。
import { execFile } from 'child_process';
import * as path from 'path';
import { TextDecoder } from 'util';

export interface FileRevision {
    hash: string;
    filePath: string;
    deleted: boolean;
}

export interface FileCommit extends FileRevision {
    author: string;
    date: string;
    subject: string;
    previous?: FileRevision;
}

export interface FileHistory {
    repositoryRoot: string;
    commits: FileCommit[];
    hasMore: boolean;
}

export class GitHistoryService {
    constructor(private readonly executable: string | string[] = 'git') {}

    private run(directory: string, args: string[]): Promise<Buffer> {
        const candidates = typeof this.executable === 'string' ? [this.executable] : this.executable;
        return new Promise((resolve, reject) => {
            let index = 0;
            const launch = () => {
                execFile(candidates[index++], ['--no-pager', '--literal-pathspecs', '-C', directory, ...args], {
                    encoding: 'buffer', windowsHide: true, timeout: 30000, maxBuffer: 20 * 1024 * 1024,
                    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
                }, (error, stdout, stderr) => {
                    if (!error) { resolve(stdout); return; }
                    const code = (error as NodeJS.ErrnoException).code;
                    if (code === 'ENOENT' && index < candidates.length) { launch(); return; }
                    const message = code === 'ENOENT'
                        ? '找不到 Git，请安装 Git 或检查 VS Code 的 git.path 设置。'
                        : `Git 读取失败：${stderr.toString('utf8').trim() || error.message}`;
                    reject(Object.assign(new Error(message), { code }));
                });
            };
            launch();
        });
    }

    async getFileHistory(filename: string, limit = 100): Promise<FileHistory> {
        if (!path.isAbsolute(filename) || !Number.isSafeInteger(limit) || limit < 1) {
            throw new Error('文件路径或历史条数无效。');
        }
        const directory = path.dirname(filename);
        const rootOutput = await this.run(directory, ['rev-parse', '--show-toplevel']);
        const prefixOutput = await this.run(directory, ['rev-parse', '--show-prefix']);
        const repositoryRoot = rootOutput.toString('utf8').replace(/\r?\n$/, '');
        // Git 统一解析短路径、目录联接及符号链接，避免混用路径别名计算相对路径。
        const filePath = prefixOutput.toString('utf8').replace(/\r?\n$/, '') + path.basename(filename);
        let head: string;
        try {
            head = (await this.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'])).toString('utf8').trim();
        } catch (error) {
            // 空仓库的 HEAD 尚不存在；其他 Git 错误继续向上报告。
            if ((error as { code?: string | number }).code === 1) {
                return { repositoryRoot, commits: [], hasMore: false };
            }
            throw error;
        }
        const output = await this.run(repositoryRoot, ['-c', 'i18n.logOutputEncoding=utf-8',
            'log', '--follow', '--first-parent', '--root', '--diff-merges=first-parent', '--topo-order',
            '--no-ext-diff', '--no-textconv', '--no-color', '--no-show-signature',
            `--max-count=${limit + 1}`, '--format=%H%x00%an%x00%aI%x00%s%x00%P', '--name-status', '-z',
            head, '--', filePath]);
        // NUL 分隔元数据、状态和路径，保留中文、空格、换行及路径中的特殊字符。
        const tokens = output.toString('utf8').split('\0');
        const commits: FileCommit[] = [];
        let index = 0;
        while (index < tokens.length - 1) {
            const hash = tokens[index++];
            const author = tokens[index++];
            const date = tokens[index++];
            const subject = tokens[index++];
            const parent = tokens[index++].split(' ')[0];
            const status = tokens[index++].replace(/^\n/, '');
            const oldPath = tokens[index++];
            const revisionPath = /^[RC]/.test(status) ? tokens[index++] : oldPath;
            if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash) || !revisionPath) {
                throw new Error('无法解析 Git 文件历史。');
            }
            const previous = parent && !/^[AC]/.test(status)
                ? { hash: parent, filePath: oldPath, deleted: false } : undefined;
            commits.push({ hash, author, date, subject, filePath: revisionPath, deleted: status === 'D', previous });
        }
        return { repositoryRoot, commits: commits.slice(0, limit), hasMore: commits.length > limit };
    }

    async readRevision(repositoryRoot: string, hash: string, filePath: string, encoding = 'utf-8'): Promise<string> {
        if (!path.isAbsolute(repositoryRoot) || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash)
            || !filePath || filePath.includes('\0') || filePath.includes('\\') || path.posix.isAbsolute(filePath)
            || path.win32.isAbsolute(filePath) || filePath.split('/').includes('..')) {
            throw new Error('历史版本或仓库相对路径无效。');
        }
        const data = await this.run(repositoryRoot, ['show', '--no-ext-diff', '--no-textconv', `${hash}:${filePath}`]);
        const encodingNames: Record<string, string> = {
            utf8bom: 'utf-8', utf16le: 'utf-16le', utf16be: 'utf-16be',
            shiftjis: 'shift_jis', eucjp: 'euc-jp', euckr: 'euc-kr',
            cp950: 'big5', cp936: 'gbk', cp949: 'euc-kr', cp866: 'ibm866', cp874: 'windows-874',
            koi8r: 'koi8-r', koi8u: 'koi8-u', macroman: 'macintosh',
        };
        let decoderEncoding = encodingNames[encoding] || encoding;
        if (/^windows\d+$/.test(encoding)) { decoderEncoding = encoding.replace('windows', 'windows-'); }
        else if (/^iso8859\d+$/.test(encoding)) { decoderEncoding = encoding.replace('iso8859', 'iso-8859-'); }
        // 与编辑器一致，文件自身的 BOM 优先于 files.encoding 配置。
        if (data[0] === 0xff && data[1] === 0xfe) { decoderEncoding = 'utf-16le'; }
        else if (data[0] === 0xfe && data[1] === 0xff) { decoderEncoding = 'utf-16be'; }
        else if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) { decoderEncoding = 'utf-8'; }
        const text = new TextDecoder(decoderEncoding).decode(data);
        if (text.includes('\0')) { throw new Error('该历史版本是二进制文件，暂不支持文本查看和对比。'); }
        return text;
    }
}
