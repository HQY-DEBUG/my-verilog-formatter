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
import * as path from 'path';
import { rgPath }      from '@vscode/ripgrep';
import { buildRgArgs } from './todoConfig';
import type { TodoConfig } from './todoConfig';

// ---- 数据结构 ----//
export interface TodoItem {
    file : string;   // 绝对路径
    line : number;   // 0-based
    col  : number;   // 0-based
    tag  : string;
    text : string;   // 标签后的注释内容（已 trim）
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

    const matchedTag = submatches[0]?.match?.text as string;
    if (!tags.includes(matchedTag)) { return null; }

    const col  = submatches[0]?.start as number ?? 0;
    // 提取标签后的注释内容
    const rest = lineText.slice(col + matchedTag.length).replace(/^[\s:：]+/, '').trimEnd().replace(/\n$/, '');

    return {
        file : filePath,
        line : lineNumber - 1,   // 转 0-based
        col,
        tag  : matchedTag,
        text : rest,
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
function runRg(args: string[], cwd: string): Promise<TodoItem[]> {
    return new Promise((resolve, reject) => {
        // 从 -e pattern 中提取 tags 列表用于 parseRgLine 过滤
        const eIdx  = args.indexOf('-e');
        const pat   = eIdx >= 0 ? args[eIdx + 1] : '';
        const tagRe = /\\b\((.*?)\)/.exec(pat);
        const tagList: string[] = tagRe
            ? tagRe[1].split('|').map(t => t.replace(/\\/g, ''))
            : [];

        const proc  = cp.spawn(rgPath, [...args, '.'], { cwd, shell: false });
        const items: TodoItem[] = [];
        let   buf   = '';

        proc.stdout.on('data', (chunk: Buffer) => {
            buf += chunk.toString('utf8');
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                const item = parseRgLine(line, tagList);
                if (item) { items.push(item); }
            }
        });

        proc.on('error', reject);
        proc.on('close', () => {
            if (buf) {
                const item = parseRgLine(buf, tagList);
                if (item) { items.push(item); }
            }
            resolve(items);
        });
    });
}

// ---- 全量扫描工作区 ----//
export async function scan(workspaceFolders: string[], config: TodoConfig): Promise<TodoItem[]> {
    const args    = buildRgArgs(config.tags, config.excludePatterns);
    const results = await Promise.all(
        workspaceFolders.map(folder => runRg(args, folder))
    );
    return results.flat();
}

// ---- 单文件扫描（增量更新） ----//
export async function scanFile(filePath: string, config: TodoConfig): Promise<TodoItem[]> {
    const args = buildRgArgs(config.tags, config.excludePatterns);
    const dir  = path.dirname(filePath);
    const file = path.basename(filePath);
    return runRg([...args, file], dir);
}
