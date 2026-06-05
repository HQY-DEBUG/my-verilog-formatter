"use strict";
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
exports.parseRgLine = parseRgLine;
exports.groupByFile = groupByFile;
exports.scan = scan;
exports.scanFile = scanFile;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const ripgrep_1 = require("@vscode/ripgrep");
const todoConfig_1 = require("./todoConfig");
// ---- 解析单行 rg NDJSON ----//
function parseRgLine(raw, tags) {
    let obj;
    try {
        obj = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (obj.type !== 'match') {
        return null;
    }
    const data = obj.data;
    const filePath = data?.path?.text;
    const lineNumber = data?.line_number; // 1-based
    const lineText = data?.lines?.text ?? '';
    const submatches = data?.submatches ?? [];
    if (!filePath || !lineNumber || !submatches.length) {
        return null;
    }
    // rg submatches[0] 是完整匹配文本（含末尾分隔符），去除后缀得到纯标签名
    const rawMatch = submatches[0]?.match?.text ?? '';
    const matchedTag = rawMatch.replace(/[\s:：]+$/, '');
    if (!tags.includes(matchedTag)) {
        return null;
    }
    const col = submatches[0]?.start ?? 0;
    // 提取标签后的注释内容（跳过整个原始匹配长度，再去除剩余分隔符）
    const rest = lineText.slice(col + rawMatch.length).replace(/^[\s:：]+/, '').trimEnd();
    return {
        file: filePath,
        line: lineNumber - 1, // 转 0-based
        col,
        tag: matchedTag,
        text: rest,
    };
}
// ---- 按文件路径分组 ----//
function groupByFile(items) {
    const map = new Map();
    for (const item of items) {
        const list = map.get(item.file) ?? [];
        list.push(item);
        map.set(item.file, list);
    }
    return map;
}
// ---- 异步运行 rg，返回所有 TodoItem ----//
function runRg(args, cwd, tags, paths = ['.']) {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn(ripgrep_1.rgPath, [...args, ...paths], { cwd, shell: false });
        const items = [];
        let buf = '';
        proc.stdout.on('data', (chunk) => {
            buf += chunk.toString('utf8');
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                const item = parseRgLine(line, tags);
                // rg 以 cwd 运行时返回相对路径，转换为绝对路径
                if (item) {
                    if (!path.isAbsolute(item.file)) {
                        item.file = path.resolve(cwd, item.file);
                    }
                    items.push(item);
                }
            }
        });
        let stderrBuf = '';
        proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8'); });
        proc.on('error', reject);
        proc.on('close', () => {
            if (buf) {
                const item = parseRgLine(buf, tags);
                if (item) {
                    if (!path.isAbsolute(item.file)) {
                        item.file = path.resolve(cwd, item.file);
                    }
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
async function scan(workspaceFolders, config) {
    const args = (0, todoConfig_1.buildRgArgs)(config.tags, config.excludePatterns);
    const results = await Promise.all(workspaceFolders.map(folder => runRg(args, folder, config.tags)));
    return results.flat();
}
// ---- 单文件扫描（增量更新） ----//
async function scanFile(filePath, config) {
    const args = (0, todoConfig_1.buildRgArgs)(config.tags, config.excludePatterns);
    const dir = path.dirname(filePath);
    const file = path.basename(filePath);
    return runRg(args, dir, config.tags, [file]);
}
//# sourceMappingURL=todoScanner.js.map