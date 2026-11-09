"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHistoryService = void 0;
// 查询单个文件的 Git 历史与只读快照；不依赖外部扩展，也不执行 checkout。
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const util_1 = require("util");
class GitHistoryService {
    constructor(executable = 'git') {
        this.executable = executable;
    }
    run(directory, args) {
        const candidates = typeof this.executable === 'string' ? [this.executable] : this.executable;
        return new Promise((resolve, reject) => {
            let index = 0;
            const launch = () => {
                (0, child_process_1.execFile)(candidates[index++], ['--no-pager', '--literal-pathspecs', '-C', directory, ...args], {
                    encoding: 'buffer', windowsHide: true, timeout: 30000, maxBuffer: 20 * 1024 * 1024,
                    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
                }, (error, stdout, stderr) => {
                    if (!error) {
                        resolve(stdout);
                        return;
                    }
                    const code = error.code;
                    if (code === 'ENOENT' && index < candidates.length) {
                        launch();
                        return;
                    }
                    const message = code === 'ENOENT'
                        ? '找不到 Git，请安装 Git 或检查 VS Code 的 git.path 设置。'
                        : `Git 读取失败：${stderr.toString('utf8').trim() || error.message}`;
                    reject(Object.assign(new Error(message), { code }));
                });
            };
            launch();
        });
    }
    async getFileHistory(filename, limit = 100) {
        if (!path.isAbsolute(filename) || !Number.isSafeInteger(limit) || limit < 1) {
            throw new Error('文件路径或历史条数无效。');
        }
        const repositoryRoot = (await this.run(path.dirname(filename), ['rev-parse', '--show-toplevel']))
            .toString('utf8').replace(/\r?\n$/, '');
        const filePath = path.relative(repositoryRoot, filename).split(path.sep).join('/');
        let head;
        try {
            head = (await this.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'])).toString('utf8').trim();
        }
        catch (error) {
            // 空仓库的 HEAD 尚不存在；其他 Git 错误继续向上报告。
            if (error.code === 1) {
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
        const commits = [];
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
    async readRevision(repositoryRoot, hash, filePath, encoding = 'utf-8') {
        if (!path.isAbsolute(repositoryRoot) || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash)
            || !filePath || filePath.includes('\0') || filePath.includes('\\') || path.posix.isAbsolute(filePath)
            || path.win32.isAbsolute(filePath) || filePath.split('/').includes('..')) {
            throw new Error('历史版本或仓库相对路径无效。');
        }
        const data = await this.run(repositoryRoot, ['show', '--no-ext-diff', '--no-textconv', `${hash}:${filePath}`]);
        const encodingNames = {
            utf8bom: 'utf-8', utf16le: 'utf-16le', utf16be: 'utf-16be',
            shiftjis: 'shift_jis', eucjp: 'euc-jp', euckr: 'euc-kr',
            cp950: 'big5', cp936: 'gbk', cp949: 'euc-kr', cp866: 'ibm866', cp874: 'windows-874',
            koi8r: 'koi8-r', koi8u: 'koi8-u', macroman: 'macintosh',
        };
        let decoderEncoding = encodingNames[encoding] || encoding;
        if (/^windows\d+$/.test(encoding)) {
            decoderEncoding = encoding.replace('windows', 'windows-');
        }
        else if (/^iso8859\d+$/.test(encoding)) {
            decoderEncoding = encoding.replace('iso8859', 'iso-8859-');
        }
        // 与编辑器一致，文件自身的 BOM 优先于 files.encoding 配置。
        if (data[0] === 0xff && data[1] === 0xfe) {
            decoderEncoding = 'utf-16le';
        }
        else if (data[0] === 0xfe && data[1] === 0xff) {
            decoderEncoding = 'utf-16be';
        }
        else if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
            decoderEncoding = 'utf-8';
        }
        const text = new util_1.TextDecoder(decoderEncoding).decode(data);
        if (text.includes('\0')) {
            throw new Error('该历史版本是二进制文件，暂不支持文本查看和对比。');
        }
        return text;
    }
}
exports.GitHistoryService = GitHistoryService;
//# sourceMappingURL=gitHistoryService.js.map