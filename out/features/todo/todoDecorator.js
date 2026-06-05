"use strict";
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
exports.TodoDecorator = void 0;
const vscode = __importStar(require("vscode"));
const todoConfig_1 = require("./todoConfig");
// ---- 构建 DecorationRenderOptions ----//
function buildDecorOptions(cfg) {
    const opts = {
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
class TodoDecorator {
    constructor(context) {
        this.context = context;
        this.decorTypes = new Map();
    }
    // ---- 为当前编辑器应用高亮 ----//
    apply(editor, items) {
        const config = (0, todoConfig_1.getTodoConfig)();
        if (!config.highlightEnabled) {
            this.clear(editor);
            return;
        }
        // 按 tag 分组
        const byTag = new Map();
        for (const item of items.filter(i => i.file === editor.document.uri.fsPath)) {
            const arr = byTag.get(item.tag) ?? [];
            const tagLen = item.tag.length;
            const start = new vscode.Position(item.line, item.col);
            const end = new vscode.Position(item.line, item.col + tagLen);
            const range = new vscode.Range(start, end);
            arr.push({ range, hoverMessage: `**${item.tag}**: ${item.text}` });
            byTag.set(item.tag, arr);
        }
        // 为每个 tag 创建/更新 decoration type
        for (const [tag, decorOpts] of byTag) {
            const tagCfg = (0, todoConfig_1.mergeTagConfig)(tag, config.customHighlight[tag] ?? {});
            const existing = this.decorTypes.get(tag);
            if (existing) {
                existing.dispose();
            }
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
    clear(editor) {
        for (const dtype of this.decorTypes.values()) {
            editor.setDecorations(dtype, []);
        }
    }
    dispose() {
        for (const dtype of this.decorTypes.values()) {
            dtype.dispose();
        }
        this.decorTypes.clear();
    }
}
exports.TodoDecorator = TodoDecorator;
//# sourceMappingURL=todoDecorator.js.map