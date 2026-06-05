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

import * as vscode from 'vscode';

// ---- 类型定义 ----//
export interface TagConfig {
    icon        : string;
    iconColour  : string;
    foreground  : string;
    background  : string;
    gutterIcon  : boolean;
    rulerColour : string;
    highlightType: 'tag' | 'text' | 'line' | 'none';
}

export interface TodoConfig {
    tags            : string[];
    excludePatterns : string[];
    showInStatusBar : boolean;
    highlightEnabled: boolean;
    defaultHighlight: Partial<TagConfig>;
    customHighlight : Record<string, Partial<TagConfig>>;
}

export const DEFAULT_TAG_CONFIGS: Record<string, TagConfig> = {
    'TODO' : { icon: '$(circle-outline)', iconColour: '#3794FF', foreground: '#3794FF', background: '', gutterIcon: false, rulerColour: '#3794FF', highlightType: 'text' },
    'FIXME': { icon: '$(error)',          iconColour: '#F44747', foreground: '#F44747', background: '', gutterIcon: false, rulerColour: '#F44747', highlightType: 'text' },
    'NOTE' : { icon: '$(info)',           iconColour: '#4EC9B0', foreground: '#4EC9B0', background: '', gutterIcon: false, rulerColour: '#4EC9B0', highlightType: 'text' },
    'HACK' : { icon: '$(warning)',        iconColour: '#CE9178', foreground: '#CE9178', background: '', gutterIcon: false, rulerColour: '#CE9178', highlightType: 'text' },
};

const FALLBACK_TAG_CONFIG: TagConfig = {
    icon: '$(tag)', iconColour: '#CCCCCC', foreground: '#CCCCCC',
    background: '', gutterIcon: false, rulerColour: '#CCCCCC', highlightType: 'text',
};

// ---- 合并 TagConfig ----//
export function mergeTagConfig(tag: string, custom?: Partial<TagConfig>): TagConfig {
    const base = DEFAULT_TAG_CONFIGS[tag] ?? FALLBACK_TAG_CONFIG;
    return { ...base, ...(custom ?? {}) };
}

// ---- 读取 VS Code 配置 ----//
export function getTodoConfig(): TodoConfig {
    const cfg = vscode.workspace.getConfiguration('verilogFormatter.todo');
    return {
        tags            : cfg.get<string[]>('tags',             ['TODO', 'FIXME', 'NOTE', 'HACK']),
        excludePatterns : cfg.get<string[]>('excludePatterns',  ['**/node_modules/**', '**/.git/**', '**/out/**']),
        showInStatusBar : cfg.get<boolean>('showInStatusBar',   true),
        highlightEnabled: cfg.get<boolean>('highlightEnabled',  true),
        defaultHighlight: cfg.get<Partial<TagConfig>>('defaultHighlight', {}),
        customHighlight : cfg.get<Record<string, Partial<TagConfig>>>('customHighlight', {}),
    };
}

// ---- 构造 ripgrep 参数 ----//
export function buildRgArgs(tags: string[], excludePatterns: string[]): string[] {
    // 转义正则特殊字符，构造 (TAG1|TAG2|...) 模式
    // 要求冒号必须存在，避免 'TODO'/'FIXME' 字符串字面量被误匹配
    const escaped = tags.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = `\\b(${escaped.join('|')})\\b\\s*[：:]`;

    const args: string[] = [
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
