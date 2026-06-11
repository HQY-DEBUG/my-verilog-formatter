// =========================================================================
// 文件    : todoScanner.ts
// 描述    : 调用 ripgrep 扫描工作区，解析 NDJSON 输出，返回 TodoItem[]
// 版本    : v1.0
// 日期    : 2026/05/28
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/05/28    创建文件
// =========================================================================

import * as cp   from 'child_process';
import * as fs   from 'fs';
import * as path from 'path';
import { buildRgArgs } from './todoConfig';
import type { TodoConfig } from './todoConfig';

// @vscode/ripgrep 自 1.16+ 改为 ESM 模块，TS commonjs 编译后 require() 会抛
// ERR_REQUIRE_ESM；TS 也会把原生 import() 降级为 require()。用 new Function
// 包一层保留真正的动态 import，使其能在 Node 中加载 ESM 模块。
const nativeDynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
let rgPathCache: string | undefined;

export function resolvePlatformRgPath(
    rootDir: string = path.resolve(__dirname, '..', '..', '..'),
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch
): string | undefined {
    const binaryName = platform === 'win32' ? 'rg.exe' : 'rg';
    const packageName = `@vscode/ripgrep-${platform}-${arch}`;
    const directPath = path.join(rootDir, 'node_modules', '@vscode', `ripgrep-${platform}-${arch}`, 'bin', binaryName);
    if (fs.existsSync(directPath)) { return directPath; }

    try {
        const resolved = require.resolve(`${packageName}/bin/${binaryName}`, { paths: [rootDir] });
        return fs.existsSync(resolved) ? resolved : undefined;
    } catch {
        return undefined;
    }
}

async function getRgPath(): Promise<string> {
    if (rgPathCache) { return rgPathCache; }
    try {
        const mod = await nativeDynamicImport('@vscode/ripgrep');
        if (typeof mod.rgPath === 'string' && fs.existsSync(mod.rgPath)) {
            const importedRgPath = mod.rgPath as string;
            rgPathCache = importedRgPath;
            return importedRgPath;
        }
    } catch {
        // 安装后的 VSIX 可能只包含平台包，回退到显式路径解析。
    }

    const platformRgPath = resolvePlatformRgPath();
    if (!platformRgPath) {
        throw new Error('未找到 ripgrep 可执行文件，请确认 @vscode/ripgrep 平台依赖已随插件安装');
    }
    rgPathCache = platformRgPath;
    return rgPathCache;
}

// ---- 数据结构 ----//
export interface TodoItem {
    file   : string;   // 绝对路径
    line   : number;   // 0-based
    col    : number;   // 0-based，UTF-8 字节偏移（rg 原始值）
    charCol: number;   // 0-based，UTF-16 字符偏移（VS Code Range 使用）
    tag    : string;
    text   : string;   // 标签后的注释内容（已 trim）
}

// ---- 将 UTF-8 字节偏移转换为 UTF-16 字符偏移 ----//
function byteOffsetToCharOffset(line: string, byteOffset: number): number {
    // lineText 在 JSON 里已解码为 JS 字符串；重新编码为 UTF-8，截取前 byteOffset 字节，
    // 再解码得到前缀字符串，其 .length 即 UTF-16 字符数（即 VS Code 期望的列偏移）。
    try {
        const prefix = Buffer.from(line, 'utf8').slice(0, byteOffset).toString('utf8');
        return prefix.length;
    } catch {
        return byteOffset; // 回退：ASCII-only 时字节偏移 == 字符偏移
    }
}

// ---- 解析单行 rg NDJSON ----//
export function parseRgLine(raw: string, tags: string[]): TodoItem | null {
    let obj: any;
    try { obj = JSON.parse(raw); } catch { return null; }
    if (obj.type !== 'match') { return null; }

    const data       = obj.data;
    const filePath   = data?.path?.text as string;
    const lineNumber = data?.line_number as number;     // 1-based
    const lineText   = (data?.lines?.text as string) ?? '';
    const submatches = (data?.submatches as any[]) ?? [];

    if (!filePath || !lineNumber || !submatches.length) { return null; }

    // rg submatches[0] 是完整匹配文本（含末尾分隔符），去除后缀得到纯标签名
    const rawMatch   = submatches[0]?.match?.text as string ?? '';
    const matchedTag = rawMatch.replace(/[\s:：]+$/, '');
    if (!tags.includes(matchedTag)) { return null; }

    const col  = submatches[0]?.start as number ?? 0;
    // 将 UTF-8 字节偏移转换为 VS Code 期望的 UTF-16 字符偏移
    const charCol = byteOffsetToCharOffset(lineText, col);
    // 提取标签后的注释内容（跳过整个原始匹配长度，再去除剩余分隔符）
    const rest = lineText.slice(charCol + rawMatch.length).replace(/^[\s:：]+/, '').trimEnd();

    return {
        file   : filePath,
        line   : lineNumber - 1,   // 转 0-based
        col,
        charCol,
        tag    : matchedTag,
        text   : rest,
    };
}

// ---- 按文件路径分组 ----//
export function groupByFile(items: TodoItem[]): Map<string, TodoItem[]> {
    const map = new Map<string, TodoItem[]>();
    for (const item of items) {
        const list = map.get(item.file) ?? [];
        list.push(item);
        map.set(item.file, list);
    }
    return map;
}

// ---- 异步运行 rg，返回所有 TodoItem ----//
async function runRg(args: string[], cwd: string, tags: string[], paths: string[] = ['.']): Promise<TodoItem[]> {
    const rgPath = await getRgPath();
    return new Promise((resolve, reject) => {
        const proc  = cp.spawn(rgPath, [...args, ...paths], { cwd, shell: false });
        const items: TodoItem[] = [];
        let   buf   = '';

        proc.stdout.on('data', (chunk: Buffer) => {
            buf += chunk.toString('utf8');
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                const item = parseRgLine(line, tags);
                // rg 以 cwd 运行时返回相对路径，转换为绝对路径
                if (item) {
                    if (!path.isAbsolute(item.file)) { item.file = path.resolve(cwd, item.file); }
                    items.push(item);
                }
            }
        });

        let stderrBuf = '';
        proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString('utf8'); });
        proc.on('error', reject);
        proc.on('close', () => {
            if (buf) {
                const item = parseRgLine(buf, tags);
                if (item) {
                    if (!path.isAbsolute(item.file)) { item.file = path.resolve(cwd, item.file); }
                    items.push(item);
                }
            }
            if (stderrBuf.trim()) {
                console.warn('[TodoScanner] rg stderr:', stderrBuf.trim());
            }
            resolve(items);
        });
    });
}

// ---- 全量扫描工作区 ----//
export async function scan(workspaceFolders: string[], config: TodoConfig): Promise<TodoItem[]> {
    const args    = buildRgArgs(config.tags, config.excludePatterns);
    const results = await Promise.all(
        workspaceFolders.map(folder => runRg(args, folder, config.tags))
    );
    return results.flat();
}

// ---- 单文件扫描（增量更新） ----//
export async function scanFile(filePath: string, config: TodoConfig): Promise<TodoItem[]> {
    const args = buildRgArgs(config.tags, config.excludePatterns);
    const dir  = path.dirname(filePath);
    const file = path.basename(filePath);
    return runRg(args, dir, config.tags, [file]);
}
