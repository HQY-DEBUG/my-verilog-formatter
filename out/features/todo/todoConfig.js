"use strict";
// =========================================================================
// 文件    : todoConfig.ts
// 描述    : TODO 扫描配置类型定义、读取、rg 参数构造
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
exports.DEFAULT_TAG_CONFIGS = void 0;
exports.mergeTagConfig = mergeTagConfig;
exports.getTodoConfig = getTodoConfig;
exports.buildRgArgs = buildRgArgs;
const vscode = __importStar(require("vscode"));
exports.DEFAULT_TAG_CONFIGS = {
    'TODO': { icon: '$(circle-outline)', iconColour: '#3794FF', foreground: '#3794FF', background: '', gutterIcon: false, rulerColour: '#3794FF', highlightType: 'text' },
    'FIXME': { icon: '$(error)', iconColour: '#F44747', foreground: '#F44747', background: '', gutterIcon: false, rulerColour: '#F44747', highlightType: 'text' },
    'NOTE': { icon: '$(info)', iconColour: '#4EC9B0', foreground: '#4EC9B0', background: '', gutterIcon: false, rulerColour: '#4EC9B0', highlightType: 'text' },
    'HACK': { icon: '$(warning)', iconColour: '#CE9178', foreground: '#CE9178', background: '', gutterIcon: false, rulerColour: '#CE9178', highlightType: 'text' },
};
const FALLBACK_TAG_CONFIG = {
    icon: '$(tag)', iconColour: '#CCCCCC', foreground: '#CCCCCC',
    background: '', gutterIcon: false, rulerColour: '#CCCCCC', highlightType: 'text',
};
// ---- 合并 TagConfig ----//
function mergeTagConfig(tag, custom) {
    const base = exports.DEFAULT_TAG_CONFIGS[tag] ?? FALLBACK_TAG_CONFIG;
    return { ...base, ...(custom ?? {}) };
}
// ---- 读取 VS Code 配置 ----//
function getTodoConfig() {
    const cfg = vscode.workspace.getConfiguration('verilogFormatter.todo');
    return {
        tags: cfg.get('tags', ['TODO', 'FIXME', 'NOTE', 'HACK']),
        excludePatterns: cfg.get('excludePatterns', ['**/node_modules/**', '**/.git/**', '**/out/**']),
        showInStatusBar: cfg.get('showInStatusBar', true),
        highlightEnabled: cfg.get('highlightEnabled', true),
        defaultHighlight: cfg.get('defaultHighlight', {}),
        customHighlight: cfg.get('customHighlight', {}),
    };
}
// ---- 构造 ripgrep 参数 ----//
function buildRgArgs(tags, excludePatterns) {
    // 转义正则特殊字符，构造 (TAG1|TAG2|...) 模式
    // 要求冒号必须存在，避免 'TODO'/'FIXME' 字符串字面量被误匹配
    const escaped = tags.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = `\\b(${escaped.join('|')})\\b\\s*[：:]`;
    const args = [
        '--json',
        '-n',
        '--case-sensitive',
        '-e', pattern,
    ];
    for (const g of excludePatterns) {
        args.push('--glob', `!${g}`);
    }
    return args;
}
//# sourceMappingURL=todoConfig.js.map