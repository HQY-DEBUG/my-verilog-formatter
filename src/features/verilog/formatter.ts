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
    kind: 'block' | 'case';         // 栈类型
    ifIndent: number | null;         // 此 begin 对应的 if 缩进，用于 end 后的 else 对齐
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
        r = this.alignAssignContinuations(r);
        r = this.alignAssignStatements(r);
        r = this.alignProceduralAssignments(r);
        r = this.alignLocalparams(r);
        r = this.alignSignalDeclarations(r);
        r = this.alignPortDeclarations(r);
        r = this.alignInstantiationPorts(r);
        if (config.alignPortComment) {
            r = this.alignTrailingComments(r);
        }
        r = this.alignCaseItems(r);
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

            // "end else begin [: label]" → end / else / begin [: label]（三行）
            const endElseBegin = noComment.match(/^end\s+else\s+begin(\s*:\s*\w+)?\s*$/);
            if (endElseBegin) {
                result.push(indent + 'end', indent + 'else', indent + 'begin' + (endElseBegin[1] ?? ''));
                continue;
            }

            // "keyword ... begin [: label]" → keyword ... / begin [: label]（两行）
            const beginMatch = noComment.match(/^(.*?)\s+begin(\s*:\s*\w+)?\s*$/);
            if (beginMatch) {
                const beforeBegin = beginMatch[1].trimEnd();
                if (beforeBegin.length > 0) {
                    result.push(indent + beforeBegin, indent + 'begin' + (beginMatch[2] ?? ''));
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
        let pendingIndent: number | null = null; // 控制关键字后下一行的目标缩进
        let pendingKind: 'control' | 'ifBody' | 'caseItem' | null = null;
        let danglingIfIndent: number | null = null; // 无 begin 的 if 体结束后，else 对齐到该列

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
                pendingIndent = null;
                pendingKind = null;
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
                pendingIndent = null;
                pendingKind   = null;
                continue;
            }

            // 所有 end* 关键字：弹栈，打印在对应 begin 所在列
            if (!isComment && /^end\w*\b/.test(line)) {
                const entry = stack.pop();
                if (entry !== undefined) {
                    result.push(sp(entry.beginIndent) + line);
                    contentIndent = entry.parentContentIndent;
                    danglingIfIndent = entry.ifIndent;
                } else {
                    result.push(line);
                    danglingIfIndent = null;
                }
                pendingIndent = null;
                pendingKind = null;
                continue;
            }

            // 计算本行实际缩进
            const isElse = /^else\b/.test(line);
            if (!isComment && !isElse && pendingKind !== 'ifBody') {
                danglingIfIndent = null;
            }
            const lineIndent: number = (!isComment && isElse && danglingIfIndent !== null)
                ? danglingIfIndent
                : (pendingIndent ?? contentIndent);
            const consumedPendingKind = pendingKind;
            pendingIndent = null;
            pendingKind = null;

            result.push(sp(lineIndent) + line);

            if (isComment) { continue; }

            // 后处理：更新栈和 contentIndent
            if (/\bbegin\b/.test(line)) {
                // begin 压栈，后续内容缩进 = begin 列 + indentSize
                const ifIndent = consumedPendingKind === 'ifBody' ? danglingIfIndent : null;
                stack.push({ beginIndent: lineIndent, parentContentIndent: contentIndent, kind: 'block', ifIndent });
                contentIndent = lineIndent + indentSize;
            } else if (/^(case[xz]?|function|task|generate)\b/.test(line)) {
                const kind = /^case[xz]?\b/.test(line) ? 'case' : 'block';
                stack.push({ beginIndent: lineIndent, parentContentIndent: contentIndent, kind, ifIndent: null });
                contentIndent = lineIndent + indentSize;
            } else if (stack[stack.length - 1]?.kind === 'case' && this.isStandaloneCaseItem(line)) {
                pendingIndent = lineIndent + indentSize;
                pendingKind = 'caseItem';
            } else if (/^module\b/.test(line)) {
                // 有端口/参数列表时缩进 indentSize；直接以 ; 结尾时不缩进
                contentIndent = line.endsWith(';') ? 0 : indentSize;
            } else if (/^(always|initial|if|for|while|forever)\b/.test(line)) {
                // 控制关键字后接单条语句（无 begin）：下一行临时 +indentSize
                pendingIndent = lineIndent + indentSize;
                pendingKind = /^if\b/.test(line) ? 'ifBody' : 'control';
                if (/^if\b/.test(line)) {
                    danglingIfIndent = lineIndent;
                }
            } else if (/^else\b/.test(line)) {
                pendingIndent = lineIndent + indentSize;
                pendingKind = /^else\s+if\b/.test(line) ? 'ifBody' : 'control';
                danglingIfIndent = /^else\s+if\b/.test(line) ? lineIndent : null;
            } else if (consumedPendingKind !== 'ifBody') {
                danglingIfIndent = null;
            }
        }

        return result.join('\n');
    }

    private isStandaloneCaseItem(line: string): boolean {
        const noComment = line.replace(/\/\/.*$/, '').trim();
        const colonIdx = this.findCaseLabelColon(noComment);
        if (colonIdx < 0) { return false; }
        const label = noComment.slice(0, colonIdx).trim();
        const rest = noComment.slice(colonIdx + 1).trim();
        return rest === '' && this.isCaseLabel(label);
    }

    private isStatementTerminated(line: string): boolean {
        return /;\s*(?:(?:\/\/.*)|(?:\/\*.*\*\/\s*))?$/.test(line.trim());
    }

    private findCaseLabelColon(text: string): number {
        let bracketDepth = 0;
        for (let idx = 0; idx < text.length; idx++) {
            if (text[idx] === '[') { bracketDepth++; }
            if (text[idx] === ']') { bracketDepth = Math.max(0, bracketDepth - 1); }
            if (text[idx] === ':' && bracketDepth === 0) { return idx; }
        }
        return -1;
    }

    private isCaseLabel(label: string): boolean {
        return /^(?:default|[A-Za-z_][\w$]*(?:\[[^\]]+\])?|(?:\d+)?'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ?_]+|\d+)$/.test(label);
    }

    // ---- 对齐 case item 标签 ----//
    private alignCaseItems(code: string): string {
        const lines = code.split('\n');
        let i = 0;

        interface CaseItem { index: number; indent: string; label: string; statement: string; code: string; comment: string; }
        const splitTrailingComment = (statement: string): { code: string; comment: string } => {
            const idx = statement.indexOf('//');
            if (idx < 0) { return { code: statement.trimEnd(), comment: '' }; }
            return {
                code: statement.slice(0, idx).trimEnd(),
                comment: statement.slice(idx).trim(),
            };
        };
        const parseCaseItem = (line: string, index: number): CaseItem | null => {
            if (/^\s*\/\//.test(line)) { return null; }
            const indent = (line.match(/^(\s*)/) ?? ['', ''])[1];
            const body = line.slice(indent.length);
            const colonIdx = this.findCaseLabelColon(body);
            if (colonIdx < 0) { return null; }
            const label = body.slice(0, colonIdx).trim();
            const statement = body.slice(colonIdx + 1).trim();
            if (!this.isCaseLabel(label)) { return null; }
            if (statement.length > 0 && !this.isStatementTerminated(statement)) { return null; }
            const split = splitTrailingComment(statement);
            return { index, indent, label, statement, code: split.code, comment: split.comment };
        };

        while (i < lines.length) {
            if (!/^\s*case[xz]?\b/.test(lines[i].trim())) {
                i++;
                continue;
            }

            const blockStart = i + 1;
            let depth = 1;
            i++;
            while (i < lines.length && depth > 0) {
                const trimmed = lines[i].trim();
                if (/^case[xz]?\b/.test(trimmed)) {
                    depth++;
                } else if (/^endcase\b/.test(trimmed)) {
                    depth--;
                }
                i++;
            }
            const blockEnd = i - 1;
            const groups = new Map<string, CaseItem[]>();

            for (let lineIdx = blockStart; lineIdx < blockEnd; lineIdx++) {
                const item = parseCaseItem(lines[lineIdx], lineIdx);
                if (!item) { continue; }
                const group = groups.get(item.indent) ?? [];
                group.push(item);
                groups.set(item.indent, group);
            }

            for (const group of groups.values()) {
                if (group.length < 2) { continue; }
                const labelWidth = Math.max(...group.map(item => item.label.length));
                const commentItems = group.filter(item => item.comment.length > 0);
                const codeWidth = commentItems.length > 1
                    ? Math.max(...commentItems.map(item => item.code.length))
                    : 0;
                for (const item of group) {
                    let suffix = '';
                    if (item.statement.length > 0) {
                        const code = codeWidth > 0 ? item.code.padEnd(codeWidth) : item.code;
                        const comment = item.comment.length > 0 ? ` ${item.comment}` : '';
                        suffix = ` ${code}${comment}`;
                    }
                    lines[item.index] = `${item.indent}${item.label.padEnd(labelWidth)} :${suffix}`;
                }
            }
        }

        return lines.join('\n');
    }

    // ---- 对齐 assign 多行表达式续行 ----//
    private alignAssignContinuations(code: string): string {
        const lines: string[] = code.split('\n');
        const result: string[] = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            if (!/^\s*assign\b.*=\s*/.test(line) || this.isStatementTerminated(line)) {
                result.push(line);
                i++;
                continue;
            }

            const equalIdx = line.indexOf('=');
            if (equalIdx < 0) {
                result.push(line);
                i++;
                continue;
            }

            let exprIndent = equalIdx + 1;
            while (exprIndent < line.length && line[exprIndent] === ' ') { exprIndent++; }
            const block: string[] = [line];
            i++;
            while (i < lines.length) {
                block.push(lines[i]);
                const trimmed = lines[i].trim();
                i++;
                if (this.isStatementTerminated(trimmed)) { break; }
            }

            const firstCont = block[1]?.trim() ?? '';
            const alignInnerParen = firstCont.startsWith('((');
            result.push(block[0]);
            for (let j = 1; j < block.length; j++) {
                const trimmed = block[j].trim();
                const innerOffset = alignInnerParen && j > 1 && /^\(/.test(trimmed) && !/^\)+\s*;/.test(trimmed)
                    ? 1
                    : 0;
                result.push(' '.repeat(exprIndent + innerOffset) + trimmed);
            }
        }

        return result.join('\n');
    }

    // ---- 对齐连续单行 assign 语句 ----//
    private alignAssignStatements(code: string): string {
        const lines = code.split('\n');
        const result: string[] = [];
        let i = 0;

        interface AssignLine { indent: string; lhs: string; rhs: string; raw: string; }
        const parseAssign = (line: string): AssignLine | null => {
            if (!this.isStatementTerminated(line)) { return null; }
            const m = line.match(/^(\s*)assign\s+(.+?)\s*=\s*(.+)$/);
            if (!m) { return null; }
            return { indent: m[1], lhs: m[2].trimEnd(), rhs: m[3].trim(), raw: line };
        };

        while (i < lines.length) {
            const first = parseAssign(lines[i]);
            if (!first) {
                result.push(lines[i++]);
                continue;
            }

            const group: AssignLine[] = [first];
            i++;
            while (i < lines.length) {
                const next = parseAssign(lines[i]);
                if (!next || next.indent !== first.indent) { break; }
                group.push(next);
                i++;
            }

            if (group.length === 1) {
                result.push(group[0].raw);
                continue;
            }

            const lhsWidth = Math.max(...group.map(item => item.lhs.length));
            for (const item of group) {
                result.push(`${item.indent}assign ${item.lhs.padEnd(lhsWidth)} = ${item.rhs}`);
            }
        }

        return result.join('\n');
    }

    // ---- 对齐连续过程赋值语句 ----//
    private alignProceduralAssignments(code: string): string {
        const lines = code.split('\n');
        const result: string[] = [];
        let i = 0;

        interface AssignmentLine { indent: string; lhs: string; op: string; rhs: string; raw: string; }
        const parseAssignment = (line: string): AssignmentLine | null => {
            if (!this.isStatementTerminated(line)) { return null; }
            if (/^\s*(?:assign|localparam|parameter|wire|reg|input|output|inout)\b/.test(line)) { return null; }
            const m = line.match(/^(\s*)([A-Za-z_][\w$]*(?:\s*\[[^\]]+\])?)\s*(<=|=)\s*(.+)$/);
            if (!m) { return null; }
            return { indent: m[1], lhs: m[2].trimEnd(), op: m[3], rhs: m[4].trim(), raw: line };
        };

        while (i < lines.length) {
            const first = parseAssignment(lines[i]);
            if (!first) {
                result.push(lines[i++]);
                continue;
            }

            const group: AssignmentLine[] = [first];
            i++;
            while (i < lines.length) {
                const next = parseAssignment(lines[i]);
                if (!next || next.indent !== first.indent || next.op !== first.op) { break; }
                group.push(next);
                i++;
            }

            if (group.length === 1) {
                result.push(group[0].raw);
                continue;
            }

            const lhsWidth = Math.max(...group.map(item => item.lhs.length));
            for (const item of group) {
                result.push(`${item.indent}${item.lhs.padEnd(lhsWidth)} ${item.op} ${item.rhs}`);
            }
        }

        return result.join('\n');
    }

    // ---- 对齐 parameter / localparam 块 ----//
    // 情况1（多参数）：localparam NAME = v, NAME2 = v2;  续行逗号分隔，末行分号
    // 情况2（连续单行）：多行 parameter/localparam [W] NAME = value; 作为一组对齐
    private alignLocalparams(code: string): string {
        const FIRST_RE = /^(\s*)(parameter|localparam)\b\s*(?:(\[[^\]]+\])\s*)?(\w+)\s*=\s*([^,;]+?)\s*([,;]?)\s*(\/\/.*)?$/;
        const CONT_RE  = /^(\s*)(\w+)\s*=\s*([^,;]+?)\s*([,;])\s*(\/\/.*)?$/;
        interface Entry { width: string; name: string; value: string; term: string; comment: string; }

        const lines  = code.split('\n');
        const result: string[] = [];
        let   i      = 0;

        while (i < lines.length) {
            const fm = lines[i].match(FIRST_RE);
            if (!fm) { result.push(lines[i++]); continue; }

            const baseIndent = fm[1];
            const keyword    = fm[2];

            const isSemicolonGroup = fm[6] === ';';
            if (isSemicolonGroup || this.startsKeywordParamGroup(lines, i, FIRST_RE)) {
                // 情况2：收集连续的同缩进 parameter/localparam ... ; 行作为一组对齐
                const group: Entry[] = [{ width: fm[3] ?? '', name: fm[4], value: fm[5].trim(), term: fm[6], comment: fm[7] ?? '' }];
                i++;
                while (i < lines.length) {
                    const nm = lines[i].match(FIRST_RE);
                    if (nm && nm[1] === baseIndent && nm[2] === keyword && (nm[6] === ';') === isSemicolonGroup) {
                        group.push({ width: nm[3] ?? '', name: nm[4], value: nm[5].trim(), term: nm[6], comment: nm[7] ?? '' });
                        i++;
                    } else {
                        break;
                    }
                }
                const maxWidth = Math.max(...group.map(e => e.width.length));
                const maxName  = Math.max(...group.map(e => e.name.length));
                const maxValue = Math.max(...group.map(e => e.value.length));
                group.forEach(e => {
                    const width = maxWidth > 0 ? `${e.width.padEnd(maxWidth)} ` : '';
                    const n     = e.name.padEnd(maxName);
                    const v     = e.value.padEnd(maxValue);
                    const c     = e.comment ? ` ${e.comment}` : '';
                    result.push(`${baseIndent}${keyword} ${width}${n} = ${v}${e.term}${c}`);
                });
            } else {
                // 情况1：多参数逗号分隔块
                const entries: Entry[] = [{ width: '', name: fm[4], value: fm[5].trim(), term: fm[6], comment: fm[7] ?? '' }];
                i++;
                while (i < lines.length) {
                    const cm = lines[i].match(CONT_RE);
                    if (!cm) { break; }
                    entries.push({ width: '', name: cm[2], value: cm[3].trim(), term: cm[4], comment: cm[5] ?? '' });
                    i++;
                    if (cm[4] === ';') { break; }
                }
                // 续行名称与首行名称对齐。
                const contIndent = baseIndent + ' '.repeat(keyword.length + 1);
                const maxName    = Math.max(...entries.map(e => e.name.length));
                const maxValue   = Math.max(...entries.map(e => e.value.length));
                entries.forEach((e, idx) => {
                    const n = e.name.padEnd(maxName);
                    const v = e.value.padEnd(maxValue);
                    const c = e.comment ? ` ${e.comment}` : '';
                    if (idx === 0) {
                        result.push(`${baseIndent}${keyword} ${n} = ${v}${e.term}${c}`);
                    } else {
                        result.push(`${contIndent}${n} = ${v}${e.term}${c}`);
                    }
                });
            }
        }

        return result.join('\n');
    }

    private startsKeywordParamGroup(lines: string[], index: number, re: RegExp): boolean {
        const first = lines[index].match(re);
        const next  = lines[index + 1]?.match(re);
        if (!first || !next) { return false; }
        return first[6] !== ';' && next[6] !== ';' && first[1] === next[1] && first[2] === next[2];
    }

    // ---- 对齐信号声明（reg / wire / logic / integer）----//
    // 格式：[属性]  类型    [signed]  [位宽]   名称[= 初值]    ;   // 注释
    private alignSignalDeclarations(code: string): string {
        // 支持综合属性前缀、signed/unsigned、多名称声明、带初值；空行/注释行不断开 block
        // 但只合并 attr 结构相同的信号行（都有属性 or 都没有属性），避免跨组错乱
        const RE = /^(\s*)(\(\*[^*]*\*\)\s*)?(reg|wire|logic|integer)\b\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*(\w+(?:\s*\[[^\]]+\])?(?:\s*,\s*\w+(?:\s*\[[^\]]+\])?)*)\s*(=\s*[^;\/]+)?\s*;?\s*(\/\/.*)?$/;
        const ATTR_RE = /^\s*\(\*/;
        const isGap   = (l: string) => l.trim() === '' || /^\s*\/\//.test(l);

        const lines  = code.split('\n');
        const result: string[] = [];
        let   i      = 0;

        while (i < lines.length) {
            if (!RE.test(lines[i])) { result.push(lines[i++]); continue; }

            const hasAttr = ATTR_RE.test(lines[i]);
            const block: string[] = [];

            while (i < lines.length) {
                // 连续行也须 attr 结构一致，attr 与非 attr 不合并到同一 block
                if (RE.test(lines[i]) && ATTR_RE.test(lines[i]) === hasAttr) {
                    block.push(lines[i++]);
                } else if (isGap(lines[i])) {
                    // 预看：找到下一个非 gap 行，attr 结构须与当前 block 一致才合并
                    let j = i + 1;
                    while (j < lines.length && isGap(lines[j])) { j++; }
                    if (j < lines.length && RE.test(lines[j]) && ATTR_RE.test(lines[j]) === hasAttr) {
                        while (i < j) { block.push(lines[i++]); }
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            result.push(...this.formatSignalBlock(block, RE));
        }

        return result.join('\n');
    }

    private formatSignalBlock(
        lines: string[],
        RE: RegExp
    ): string[] {
        interface P { indent: string; attr: string; type: string; sign: string; width: string; name: string; comment: string; }

        const parsed: P[] = lines.map(line => {
            const m = line.match(RE);
            if (!m) { return { indent: '', attr: '', type: '', sign: '', width: '', name: line, comment: '' }; }
            const baseName  = m[6].replace(/\s*,\s*/g, ', ');
            const initVal   = m[7] ? m[7].trim() : '';
            const name      = initVal ? `${baseName} ${initVal}` : baseName;
            return {
                indent:    m[1],
                attr:      m[2] ? m[2].trimEnd() : '',
                type:      m[3],
                sign:      m[4] ?? '',
                width:     m[5] ?? '',
                name,
                comment:   m[8] ?? '',
            };
        });

        const maxAttr = Math.max(...parsed.map(p => p.attr.length));
        const maxType = Math.max(...parsed.map(p => p.type.length));
        const maxSign = Math.max(...parsed.map(p => p.sign.length));
        const maxWidth = Math.max(...parsed.map(p => p.width.length));
        const maxName = Math.max(...parsed.map(p => p.name.length));

        return parsed.map(p => {
            if (!p.type) { return p.name; }
            // 有属性前缀的行与无属性行对齐：属性列统一补齐
            const attrPad      = maxAttr > 0
                ? (p.attr ? p.attr : '').padEnd(maxAttr) + '  '
                : '';
            const typePad = p.type.padEnd(maxType + 4);
            const signPad = maxSign > 0 ? p.sign.padEnd(maxSign + 1) : '';
            const widthPad = p.width.padEnd(maxWidth + 3);
            const namePad = p.name.padEnd(maxName + 4);
            const cmt = p.comment
                ? ` ${p.comment.startsWith('//') ? p.comment : '// ' + p.comment}`
                : '';
            return `${p.indent}${attrPad}${typePad}${signPad}${widthPad}${namePad};${cmt}`;
        });
    }

    // ---- 对齐例化端口连接 ----//
    // 格式：  .portName ( signalExpr  ),  // comment
    // 支持：  紧凑写法 .port(sig), → 展开为 .port ( sig  ),
    //         块内注释行（// ...）和空行透传，不打断分组
    private alignInstantiationPorts(code: string): string {
        const IS_PORT_RE = /^\s*\.\w+\s*\(/;
        const isGap = (l: string) => l.trim() === '' || /^\s*\/\//.test(l);

        interface Conn { indent: string; port: string; expr: string; comma: string; comment: string; }

        // 解析一行 .portName ( expr ), // comment，支持 expr 内嵌套括号
        const parseConn = (line: string): Conn | null => {
            const pm = line.match(/^(\s*)\.(\w+)\s*\(/);
            if (!pm) { return null; }
            const indent = pm[1];
            const port   = pm[2];
            const pos    = pm[0].length - 1; // 首个 '(' 的下标
            let   depth  = 0;
            let   exprStart = -1;
            let   closeParen = -1;
            for (let k = pos; k < line.length; k++) {
                if (line[k] === '(') {
                    depth++;
                    if (depth === 1) { exprStart = k + 1; }
                } else if (line[k] === ')') {
                    depth--;
                    if (depth === 0) { closeParen = k; break; }
                }
            }
            if (closeParen < 0) { return null; }
            const expr = line.substring(exprStart, closeParen).trim();
            const rest = line.substring(closeParen + 1).trim();
            const rm   = rest.match(/^(,?)\s*(\/\/.*)?$/);
            if (!rm) { return null; }
            return { indent, port, expr, comma: rm[1] ?? '', comment: rm[2] ?? '' };
        };

        const lines  = code.split('\n');
        const result: string[] = [];
        let   i      = 0;

        while (i < lines.length) {
            const prevLine = [...result].reverse().find(line => line.trim() !== '');
            const openedByPrevLine = prevLine !== undefined && /\(\s*$/.test(prevLine.trim());
            if (!IS_PORT_RE.test(lines[i])) {
                let j = i;
                while (j < lines.length && isGap(lines[j])) { j++; }
                if (!openedByPrevLine || j >= lines.length || !IS_PORT_RE.test(lines[j])) {
                    result.push(lines[i++]);
                    continue;
                }
            }

            // 收集连续的端口连接行（空行/注释行允许穿插）
            const block: string[] = [];
            while (i < lines.length) {
                if (IS_PORT_RE.test(lines[i])) {
                    block.push(lines[i++]);
                } else if (isGap(lines[i])) {
                    let j = i + 1;
                    while (j < lines.length && isGap(lines[j])) { j++; }
                    if (j < lines.length && IS_PORT_RE.test(lines[j])) {
                        while (i < j) { block.push(lines[i++]); }
                    } else { break; }
                } else { break; }
            }

            const conns = block.map(line => ({ raw: line, conn: parseConn(line) }));
            const valid = conns.filter(x => x.conn !== null).map(x => x.conn!);
            if (valid.length === 0) { result.push(...block); continue; }

            const maxPort = Math.max(...valid.map(c => c.port.length));
            const maxExpr = Math.max(...valid.map(c => c.expr.length));
            const connIndent = openedByPrevLine
                ? (prevLine!.match(/^(\s*)/) ?? ['', ''])[1] + '  '
                : null;

            result.push(...conns.map(({ raw, conn }) => {
                if (!conn) {
                    const trimmed = raw.trim();
                    if (trimmed === '') { return ''; }
                    return connIndent !== null && trimmed.startsWith('//') ? connIndent + trimmed : raw;
                }
                const indent  = connIndent ?? conn.indent;
                const portPad = conn.port.padEnd(maxPort);
                const exprPad = conn.expr.padEnd(maxExpr);
                const cmt     = conn.comment ? `  ${conn.comment}` : '';
                return `${indent}.${portPad} ( ${exprPad}  )${conn.comma}${cmt}`;
            }));
        }

        return result.join('\n');
    }

    // ---- 对齐端口声明（input / output / inout）----//
    // 格式：[属性]  方向  类型  [signed/unsigned]  [位宽]  名称  ,  // 注释
    // 支持 (* mark_debug = "true" *) 等综合属性前缀，以及 signed/unsigned 修饰符
    private alignPortDeclarations(code: string): string {
        const RE = /^(\s*)(\(\*[^*]*\*\)\s*)?(input|output|inout)\b\s*(wire|reg|logic)?\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*([\w_]+)\s*(,?)\s*(\/\/.*)?$/;
        // 端口块内允许空行和注释行，整个端口列表统一对齐
        return this.processBlocksWithGaps(code, RE, (block) => this.formatPortBlock(block, RE));
    }

    private formatPortBlock(lines: string[], RE: RegExp): string[] {
        interface P {
            indent: string; attr: string; dir: string; ptype: string;
            sign: string; width: string; name: string; comma: string; comment: string;
        }

        const parsed: P[] = lines.map(line => {
            const m = line.match(RE);
            if (!m) { return { indent: '', attr: '', dir: '', ptype: '', sign: '', width: '', name: line, comma: '', comment: '' }; }
            return {
                indent:    m[1],
                attr:      m[2] ? m[2].trimEnd() : '',
                dir:       m[3],
                ptype:     m[4] ?? 'wire',
                sign:      m[5] ?? '',
                width:     m[6] ?? '',
                name:      m[7],
                comma:     m[8] ?? '',
                comment:   m[9] ?? '',
            };
        });

        const ports        = parsed.filter(p => p.dir.length > 0);
        const maxDir       = Math.max(...ports.map(p => p.dir.length));
        const maxType      = Math.max(...ports.map(p => p.ptype.length));
        const maxSign      = Math.max(...ports.map(p => p.sign.length));
        const maxWidth     = Math.max(...ports.map(p => p.width.length));
        const maxName      = Math.max(...ports.map(p => p.name.length));

        return parsed.map(p => {
            if (!p.dir) { return p.name; }
            const dirPad   = p.dir.padEnd(maxDir + 2);
            const typePad  = p.ptype.padEnd(maxType + 2);
            // signed/unsigned 与位宽分别成列，确保无符号位宽也与有符号位宽左对齐。
            const signPad  = maxSign > 0 ? p.sign.padEnd(maxSign + 1) : '';
            const widthPad = maxWidth > 0 ? p.width.padEnd(maxWidth + 1) : '';
            const namePad  = p.name.padEnd(maxName);
            const cmt      = p.comment
                ? `  ${p.comment.startsWith('//') ? p.comment : '// ' + p.comment}`
                : '';
            // 属性前缀保留原文，与方向之间用 2 个空格分隔
            const attrPad = p.attr ? p.attr + '  ' : '';
            return `${p.indent}${attrPad}${dirPad}${typePad}${signPad}${widthPad}${namePad}${p.comma}${cmt}`;
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
