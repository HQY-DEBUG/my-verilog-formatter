// =========================================================================
// 文件    : todoDecorator.ts
// 描述    : 编辑器行内高亮装饰器，为 TODO 标签添加颜色/图标/ruler 标记
// 版本    : v1.0
// 日期    : 2026/05/28
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/05/28    创建文件
// =========================================================================

import * as vscode from 'vscode';
import { getTodoConfig, mergeTagConfig } from './todoConfig';
import type { TodoItem } from './todoScanner';
import type { TagConfig } from './todoConfig';

type DecorMap = Map<string, vscode.TextEditorDecorationType>;

// ---- 构建 DecorationRenderOptions ----//
function buildDecorOptions(cfg: TagConfig): vscode.DecorationRenderOptions {
    const opts: vscode.DecorationRenderOptions = {
        overviewRulerLane: vscode.OverviewRulerLane.Right,
    };

    if (cfg.foreground) {
        opts.color = cfg.foreground;
    }
    if (cfg.background) {
        opts.backgroundColor = cfg.background;
    }
    if (cfg.rulerColour) {
        opts.overviewRulerColor = cfg.rulerColour;
    }
    if (cfg.gutterIcon) {
        // gutterIconPath 需要实际 SVG/PNG 文件的 Uri，暂不支持 ThemeIcon
        // 用户如需 gutter 图标，可将图标文件放入 resources/gutter/ 目录
    }

    return opts;
}

// ---- 主类 ----//
export class TodoDecorator {
    private decorTypes: DecorMap = new Map();

    constructor(private readonly context: vscode.ExtensionContext) {}

    // ---- 为当前编辑器应用高亮 ----//
    apply(editor: vscode.TextEditor, items: TodoItem[]): void {
        const config = getTodoConfig();
        if (!config.highlightEnabled) {
            this.clear(editor);
            return;
        }

        // 按 tag 分组
        const byTag = new Map<string, vscode.DecorationOptions[]>();
        for (const item of items.filter(i => i.file === editor.document.uri.fsPath)) {
            const arr = byTag.get(item.tag) ?? [];
            const tagLen  = item.tag.length;
            const start   = new vscode.Position(item.line, item.col);
            const end     = new vscode.Position(item.line, item.col + tagLen);
            const range   = new vscode.Range(start, end);
            arr.push({ range, hoverMessage: `**${item.tag}**: ${item.text}` });
            byTag.set(item.tag, arr);
        }

        // 为每个 tag 创建/更新 decoration type
        for (const [tag, decorOpts] of byTag) {
            const tagCfg  = mergeTagConfig(tag, config.customHighlight[tag] ?? {});
            const existing = this.decorTypes.get(tag);
            if (existing) { existing.dispose(); }
            const dtype = vscode.window.createTextEditorDecorationType(buildDecorOptions(tagCfg));
            this.decorTypes.set(tag, dtype);
            editor.setDecorations(dtype, decorOpts);
        }

        // 清除本次没有匹配的 tag 的旧装饰
        for (const [tag, dtype] of this.decorTypes) {
            if (!byTag.has(tag)) {
                editor.setDecorations(dtype, []);
            }
        }
    }

    // ---- 清除所有装饰 ----//
    clear(editor: vscode.TextEditor): void {
        for (const dtype of this.decorTypes.values()) {
            editor.setDecorations(dtype, []);
        }
    }

    dispose(): void {
        for (const dtype of this.decorTypes.values()) { dtype.dispose(); }
        this.decorTypes.clear();
    }
}
