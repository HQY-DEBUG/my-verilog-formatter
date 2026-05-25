// =========================================================================
// 文件    : formatter.ts
// 描述    : Verilog 格式化核心逻辑
// 版本    : v0.2.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.2.0  2026/05/25  根据代码风格规范实现各格式化规则
//  v0.1.0  2026/05/25  创建文件，搭建基础框架
// =========================================================================

import * as vscode from 'vscode';

// ---- 配置项类型 ----//
interface FormatterConfig {
    indentSize: number;             // 缩进空格数
    alignPortComment: boolean;      // 是否对齐行尾注释
    newlineBeforeBegin: boolean;    // begin 是否另起一行
}

// begin/end 嵌套栈条目：记录 begin 所在的视觉列，以及进入前的 contentIndent
interface StackEntry {
    beginIndent: number;            // begin 行的实际缩进量
    parentContentIndent: number;    // 进入此 begin 前的 contentIndent
}

export class VerilogFormatter
    implements
        vscode.DocumentFormattingEditProvider,
        vscode.DocumentRangeFormattingEditProvider
{
    // ---- 整文档格式化 ----//
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions
    ): vscode.TextEdit[] {
        const config = this.getConfig(options);
        const original = document.getText();
        const formatted = this.format(original, config);
        if (formatted === original) { return []; }
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(original.length)
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }

    // ---- 区域格式化 ----//
    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions
    ): vscode.TextEdit[] {
        const config = this.getConfig(options);
        const original = document.getText(range);
        const formatted = this.format(original, config);
        if (formatted === original) { return []; }
        return [vscode.TextEdit.replace(range, formatted)];
    }

    // ---- 读取插件配置 ----//
    private getConfig(options: vscode.FormattingOptions): FormatterConfig {
        const cfg = vscode.workspace.getConfiguration('verilogFormatter');
        return {
            indentSize:         cfg.get<number>('indentSize',         options.tabSize ?? 2),
            alignPortComment:   cfg.get<boolean>('alignPortComment',  true),
            newlineBeforeBegin: cfg.get<boolean>('newlineBeforeBegin', true),
        };
    }

    // ---- 格式化主入口 ----//
    private format(code: string, config: FormatterConfig): string {
        let r = code;
        r = this.normalizeLineEndings(r);
        r = this.expandTabs(r, config.indentSize);
        if (config.newlineBeforeBegin) {
            r = this.splitBeginToNewline(r);
        }
        r = this.reindent(r, config.indentSize);
        r = this.alignSignalDeclarations(r);
        r = this.alignPortDeclarations(r);
        if (config.alignPortComment) {
            r = this.alignTrailingComments(r);
        }
        r = this.trimTrailingWhitespace(r);
        return r;
    }

    // ---- 统一换行符为 LF ----//
    private normalizeLineEndings(code: string): string {
        return code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // ---- 将 Tab 替换为空格 ----//
    private expandTabs(code: string, indentSize: number): string {
        const sp = ' '.repeat(indentSize);
        return code.split('\n').map(line => line.replace(/\t/g, sp)).join('\n');
    }

    // ---- begin 另起一行 ----//
    // 将 "keyword ... begin" 拆为两行，begin 独占一行且与关键字同缩进
    private splitBeginToNewline(code: string): string {
        const lines = code.split('\n');
        const result: string[] = [];

        for (const line of lines) {
            const indent   = (line.match(/^(\s*)/) ?? ['', ''])[1];
            const stripped = line.trim();
            // 去掉行尾注释后分析结构
            const noComment = stripped.replace(/\/\/.*$/, '').trimEnd();

            // "end else begin" → end / else / begin（三行）
            if (/^end\s+else\s+begin\s*$/.test(noComment)) {
                result.push(indent + 'end', indent + 'else', indent + 'begin');
                continue;
            }

            // "keyword ... begin" → keyword ... / begin（两行）
            if (/\bbegin\s*$/.test(noComment)) {
                const beforeBegin = noComment.replace(/\s*begin\s*$/, '').trimEnd();
                if (beforeBegin.length > 0) {
                    result.push(indent + beforeBegin, indent + 'begin');
                    continue;
                }
            }

            result.push(line);
        }

        return result.join('\n');
    }

    // ---- 重新计算缩进（基于 begin/end 栈）----//
    //
    // 缩进规则：
    //   · begin 行：缩进 = 父关键字缩进 + indentSize（由 pendingExtra 触发）
    //   · begin 内容：缩进 = begin 缩进 + indentSize
    //   · end* 行：缩进还原到对应 begin 相同的列
    //   · if/else/always/for/initial 后无 begin 时，下一行临时 +indentSize
    //   · endmodule 始终输出在第 0 列
    private reindent(code: string, indentSize: number): string {
        const lines  = code.split('\n');
        const result: string[] = [];
        const sp     = (n: number) => ' '.repeat(Math.max(0, n));

        let contentIndent = 0;          // 当前作用域内代码行的缩进量
        const stack: StackEntry[] = []; // begin/case/function/task/generate 嵌套栈
        let pendingExtra = false;       // if/else/always/for 后下一行需 +indentSize

        for (const rawLine of lines) {
            const line = rawLine.trim();

            if (line === '') {
                result.push('');
                continue;
            }

            const isComment = /^(\/\/|\/\*|\*)/.test(line);

            // 模块端口列表的 ); 或单独 ) 始终在第 0 列，重置 contentIndent
            if (!isComment && stack.length === 0 && /^\)\s*;?\s*$/.test(line)) {
                const norm = line.includes(';') ? ');' : ')';
                result.push(norm);
                if (norm === ');') { contentIndent = 0; }
                pendingExtra = false;
                continue;
            }

            // ") (" 形式（关闭参数列表后紧接端口列表），在第 0 列
            if (!isComment && stack.length === 0 && /^\)\s*\(/.test(line)) {
                result.push(') (');
                continue;
            }

            // endmodule 始终在第 0 列，不影响栈
            if (!isComment && /^endmodule\b/.test(line)) {
                result.push(line);
                contentIndent = 0;
                pendingExtra  = false;
                continue;
            }

            // 所有 end* 关键字：弹栈，打印在对应 begin 所在列
            if (!isComment && /^end\w*\b/.test(line)) {
                const entry = stack.pop();
                if (entry !== undefined) {
                    result.push(sp(entry.beginIndent) + line);
                    contentIndent = entry.parentContentIndent;
                } else {
                    result.push(line);
                }
                pendingExtra = false;
                continue;
            }

            // 计算本行实际缩进
            const lineIndent = (!isComment && pendingExtra)
                ? contentIndent + indentSize
                : contentIndent;
            pendingExtra = false;

            result.push(sp(lineIndent) + line);

            if (isComment) { continue; }

            // 后处理：更新栈和 contentIndent
            if (/\bbegin\b/.test(line)) {
                // begin 压栈，后续内容缩进 = begin 列 + indentSize
                stack.push({ beginIndent: lineIndent, parentContentIndent: contentIndent });
                contentIndent = lineIndent + indentSize;
            } else if (/^(case[xz]?|function|task|generate)\b/.test(line)) {
                stack.push({ beginIndent: lineIndent, parentContentIndent: contentIndent });
                contentIndent = lineIndent + indentSize;
            } else if (/^module\b/.test(line)) {
                // 有端口/参数列表时缩进 indentSize；直接以 ; 结尾时不缩进
                contentIndent = line.endsWith(';') ? 0 : indentSize;
            } else if (/^(always|initial|if|for|while|forever)\b/.test(line)) {
                // 控制关键字后接单条语句（无 begin）：下一行临时 +indentSize
                pendingExtra = true;
            } else if (/^else\b/.test(line)) {
                pendingExtra = true;
            }
        }

        return result.join('\n');
    }

    // ---- 对齐信号声明（reg / wire / logic / integer）----//
    // 格式：类型    [位宽]   名称    ;   // 注释
    private alignSignalDeclarations(code: string): string {
        // 支持 signed/unsigned、多名称声明（name1, name2, ...）
        const RE = /^(\s*)(reg|wire|logic|integer)\b\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*(\w+(?:\s*,\s*\w+)*)\s*;?\s*(\/\/.*)?$/;
        return this.processBlocks(code, RE, (block) => this.formatSignalBlock(block, RE));
    }

    private formatSignalBlock(
        lines: string[],
        RE: RegExp
    ): string[] {
        interface P { indent: string; type: string; signWidth: string; name: string; comment: string; }

        const parsed: P[] = lines.map(line => {
            const m = line.match(RE);
            if (!m) { return { indent: '', type: '', signWidth: '', name: line, comment: '' }; }
            const sign      = m[3] ?? '';
            const width     = m[4] ?? '';
            const signWidth = [sign, width].filter(s => s).join(' ');
            // 多名称时去除内部多余空格，统一为 "name1, name2" 格式
            const name = m[5].replace(/\s*,\s*/g, ', ');
            return { indent: m[1], type: m[2], signWidth, name, comment: m[6] ?? '' };
        });

        const maxType      = Math.max(...parsed.map(p => p.type.length));
        const maxSignWidth = Math.max(...parsed.map(p => p.signWidth.length));
        const maxName      = Math.max(...parsed.map(p => p.name.length));

        return parsed.map(p => {
            if (!p.type) { return p.name; }
            const typePad      = p.type.padEnd(maxType + 4);
            const signWidthPad = p.signWidth.padEnd(maxSignWidth + 3);
            const namePad      = p.name.padEnd(maxName + 4);
            const cmt          = p.comment
                ? ` ${p.comment.startsWith('//') ? p.comment : '// ' + p.comment}`
                : '';
            return `${p.indent}${typePad}${signWidthPad}${namePad};${cmt}`;
        });
    }

    // ---- 对齐端口声明（input / output / inout）----//
    // 格式：[属性]  方向  类型  [signed/unsigned] [位宽]  名称  ,  // 注释
    // 支持 (* mark_debug = "true" *) 等综合属性前缀，以及 signed/unsigned 修饰符
    private alignPortDeclarations(code: string): string {
        const RE = /^(\s*)(\(\*[^*]*\*\)\s*)?(input|output|inout)\b\s*(wire|reg|logic)?\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*([\w_]+)\s*(,?)\s*(\/\/.*)?$/;
        // 端口块内允许空行和注释行，整个端口列表统一对齐
        return this.processBlocksWithGaps(code, RE, (block) => this.formatPortBlock(block, RE));
    }

    private formatPortBlock(lines: string[], RE: RegExp): string[] {
        interface P {
            indent: string; attr: string; dir: string; ptype: string;
            signWidth: string; name: string; comma: string; comment: string;
        }

        const parsed: P[] = lines.map(line => {
            const m = line.match(RE);
            if (!m) { return { indent: '', attr: '', dir: '', ptype: '', signWidth: '', name: line, comma: '', comment: '' }; }
            // 将 signed/unsigned 与位宽合并为一列，保持视觉连贯
            const sign  = m[5] ?? '';
            const width = m[6] ?? '';
            const signWidth = [sign, width].filter(s => s).join(' ');
            return {
                indent:    m[1],
                attr:      m[2] ? m[2].trimEnd() : '',
                dir:       m[3],
                ptype:     m[4] ?? 'wire',
                signWidth,
                name:      m[7],
                comma:     m[8] ?? '',
                comment:   m[9] ?? '',
            };
        });

        const maxDir       = Math.max(...parsed.map(p => p.dir.length));
        const maxType      = Math.max(...parsed.map(p => p.ptype.length));
        const maxSignWidth = Math.max(...parsed.map(p => p.signWidth.length));
        const maxName      = Math.max(...parsed.map(p => p.name.length));

        return parsed.map(p => {
            if (!p.dir) { return p.name; }
            const dirPad   = p.dir.padEnd(maxDir + 2);
            const typePad  = p.ptype.padEnd(maxType + 2);
            // 有位宽/signed 时留 1 个间距，无时不补空列（让 alignTrailingComments 统一对齐注释）
            const swPad    = maxSignWidth > 0 ? p.signWidth.padEnd(maxSignWidth + 1) : '';
            const namePad  = p.name.padEnd(maxName);
            const cmt      = p.comment
                ? `  ${p.comment.startsWith('//') ? p.comment : '// ' + p.comment}`
                : '';
            // 属性前缀保留原文，与方向之间用 2 个空格分隔
            const attrPad = p.attr ? p.attr + '  ' : '';
            return `${p.indent}${attrPad}${dirPad}${typePad}${swPad}${namePad}${p.comma}${cmt}`;
        });
    }

    // ---- 对齐行尾注释 ----//
    // 将连续有行尾注释的行的 // 对齐到同一列（代码最大长度 + 3 空格）
    private alignTrailingComments(code: string): string {
        const lines  = code.split('\n');
        const result: string[] = [];
        let   i      = 0;

        while (i < lines.length) {
            if (!this.hasTrailingComment(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }
            // 收集连续有行尾注释的行
            const block: string[] = [];
            while (i < lines.length && this.hasTrailingComment(lines[i])) {
                block.push(lines[i]);
                i++;
            }
            result.push(...this.alignCommentBlock(block));
        }

        return result.join('\n');
    }

    // 判断一行是否有行尾注释（行本身不是注释行）
    private hasTrailingComment(line: string): boolean {
        const s = line.trim();
        if (!s || s.startsWith('//') || s.startsWith('/*') || s.startsWith('*')) { return false; }
        return /\S.*\/\//.test(line);
    }

    // 将块内所有行的 // 对齐到最大代码列 + 1 空格
    private alignCommentBlock(lines: string[]): string[] {
        const GAP = 1;
        const codeParts = lines.map(line => {
            const idx = line.indexOf('//');
            return idx >= 0 ? line.substring(0, idx).trimEnd() : line;
        });
        const maxLen     = Math.max(...codeParts.map(s => s.length));
        const commentCol = maxLen + GAP;

        return lines.map((line, i) => {
            const idx = line.indexOf('//');
            if (idx < 0) { return line; }
            const comment = line.substring(idx);
            return codeParts[i].padEnd(commentCol) + comment;
        });
    }

    // ---- 通用：找到匹配正则的连续行块并批量处理（允许空行/注释行作为间隔）----//
    // 遇到空行或注释行时向前预看，后面仍有匹配行则将间隔行纳入同一 block
    private processBlocksWithGaps(
        code: string,
        re: RegExp,
        handler: (block: string[]) => string[]
    ): string {
        const isGap = (l: string) => l.trim() === '' || /^\s*\/\//.test(l);
        const lines  = code.split('\n');
        const result: string[] = [];
        let   i      = 0;

        while (i < lines.length) {
            if (!re.test(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }
            const block: string[] = [];
            while (i < lines.length) {
                if (re.test(lines[i])) {
                    block.push(lines[i++]);
                } else if (isGap(lines[i])) {
                    // 预看：跳过连续 gap 行，看后面是否还有匹配行
                    let j = i + 1;
                    while (j < lines.length && isGap(lines[j])) { j++; }
                    if (j < lines.length && re.test(lines[j])) {
                        // 后面还有端口行，把 gap 行也收入 block
                        while (i < j) { block.push(lines[i++]); }
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            result.push(...handler(block));
        }

        return result.join('\n');
    }

    // ---- 通用：找到匹配正则的连续行块并批量处理 ----//
    private processBlocks(
        code: string,
        re: RegExp,
        handler: (block: string[]) => string[]
    ): string {
        const lines  = code.split('\n');
        const result: string[] = [];
        let   i      = 0;

        while (i < lines.length) {
            if (!re.test(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }
            const block: string[] = [];
            while (i < lines.length && re.test(lines[i])) {
                block.push(lines[i]);
                i++;
            }
            result.push(...handler(block));
        }

        return result.join('\n');
    }

    // ---- 清除行尾空格 ----//
    private trimTrailingWhitespace(code: string): string {
        return code.split('\n').map(l => l.trimEnd()).join('\n');
    }
}
