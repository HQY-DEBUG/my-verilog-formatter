"use strict";
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
exports.VerilogFormatter = void 0;
const vscode = __importStar(require("vscode"));
class VerilogFormatter {
    // ---- 整文档格式化 ----//
    provideDocumentFormattingEdits(document, options) {
        const config = this.getConfig(options);
        const original = document.getText();
        const formatted = this.format(original, config);
        if (formatted === original) {
            return [];
        }
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
    // ---- 区域格式化 ----//
    provideDocumentRangeFormattingEdits(document, range, options) {
        const config = this.getConfig(options);
        const original = document.getText(range);
        const formatted = this.format(original, config);
        if (formatted === original) {
            return [];
        }
        return [vscode.TextEdit.replace(range, formatted)];
    }
    // ---- 读取插件配置 ----//
    getConfig(options) {
        const cfg = vscode.workspace.getConfiguration('verilogFormatter');
        return {
            indentSize: cfg.get('indentSize', options.tabSize ?? 2),
            alignPortComment: cfg.get('alignPortComment', true),
            newlineBeforeBegin: cfg.get('newlineBeforeBegin', true),
        };
    }
    // ---- 格式化主入口 ----//
    format(code, config) {
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
    normalizeLineEndings(code) {
        return code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
    // ---- 将 Tab 替换为空格 ----//
    expandTabs(code, indentSize) {
        const sp = ' '.repeat(indentSize);
        return code.split('\n').map(line => line.replace(/\t/g, sp)).join('\n');
    }
    // ---- begin 另起一行 ----//
    // 将 "keyword ... begin" 拆为两行，begin 独占一行且与关键字同缩进
    splitBeginToNewline(code) {
        const lines = code.split('\n');
        const result = [];
        for (const line of lines) {
            const indent = (line.match(/^(\s*)/) ?? ['', ''])[1];
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
    reindent(code, indentSize) {
        const lines = code.split('\n');
        const result = [];
        const sp = (n) => ' '.repeat(Math.max(0, n));
        let contentIndent = 0; // 当前作用域内代码行的缩进量
        const stack = []; // begin/case/function/task/generate 嵌套栈
        let pendingIndent = null; // 控制关键字后下一行的目标缩进
        let pendingKind = null;
        let danglingIfIndent = null; // 无 begin 的 if 体结束后，else 对齐到该列
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
                if (norm === ');') {
                    contentIndent = 0;
                }
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
                pendingKind = null;
                continue;
            }
            // 所有 end* 关键字：弹栈，打印在对应 begin 所在列
            if (!isComment && /^end\w*\b/.test(line)) {
                const entry = stack.pop();
                if (entry !== undefined) {
                    result.push(sp(entry.beginIndent) + line);
                    contentIndent = entry.parentContentIndent;
                }
                else {
                    result.push(line);
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
            const lineIndent = (!isComment && isElse && danglingIfIndent !== null)
                ? danglingIfIndent
                : (pendingIndent ?? contentIndent);
            const consumedPendingKind = pendingKind;
            pendingIndent = null;
            pendingKind = null;
            result.push(sp(lineIndent) + line);
            if (isComment) {
                continue;
            }
            // 后处理：更新栈和 contentIndent
            if (/\bbegin\b/.test(line)) {
                // begin 压栈，后续内容缩进 = begin 列 + indentSize
                stack.push({ beginIndent: lineIndent, parentContentIndent: contentIndent, kind: 'block' });
                contentIndent = lineIndent + indentSize;
            }
            else if (/^(case[xz]?|function|task|generate)\b/.test(line)) {
                const kind = /^case[xz]?\b/.test(line) ? 'case' : 'block';
                stack.push({ beginIndent: lineIndent, parentContentIndent: contentIndent, kind });
                contentIndent = lineIndent + indentSize;
            }
            else if (stack[stack.length - 1]?.kind === 'case' && this.isStandaloneCaseItem(line)) {
                pendingIndent = lineIndent + indentSize;
                pendingKind = 'caseItem';
            }
            else if (/^module\b/.test(line)) {
                // 有端口/参数列表时缩进 indentSize；直接以 ; 结尾时不缩进
                contentIndent = line.endsWith(';') ? 0 : indentSize;
            }
            else if (/^(always|initial|if|for|while|forever)\b/.test(line)) {
                // 控制关键字后接单条语句（无 begin）：下一行临时 +indentSize
                pendingIndent = lineIndent + indentSize;
                pendingKind = /^if\b/.test(line) ? 'ifBody' : 'control';
                if (/^if\b/.test(line)) {
                    danglingIfIndent = lineIndent;
                }
            }
            else if (/^else\b/.test(line)) {
                pendingIndent = lineIndent + indentSize;
                pendingKind = /^else\s+if\b/.test(line) ? 'ifBody' : 'control';
                danglingIfIndent = /^else\s+if\b/.test(line) ? lineIndent : null;
            }
            else if (consumedPendingKind !== 'ifBody') {
                danglingIfIndent = null;
            }
        }
        return result.join('\n');
    }
    isStandaloneCaseItem(line) {
        const noComment = line.replace(/\/\/.*$/, '').trim();
        const colonIdx = this.findCaseLabelColon(noComment);
        if (colonIdx < 0) {
            return false;
        }
        const label = noComment.slice(0, colonIdx).trim();
        const rest = noComment.slice(colonIdx + 1).trim();
        return rest === '' && this.isCaseLabel(label);
    }
    isStatementTerminated(line) {
        return /;\s*(?:(?:\/\/.*)|(?:\/\*.*\*\/\s*))?$/.test(line.trim());
    }
    findCaseLabelColon(text) {
        let bracketDepth = 0;
        for (let idx = 0; idx < text.length; idx++) {
            if (text[idx] === '[') {
                bracketDepth++;
            }
            if (text[idx] === ']') {
                bracketDepth = Math.max(0, bracketDepth - 1);
            }
            if (text[idx] === ':' && bracketDepth === 0) {
                return idx;
            }
        }
        return -1;
    }
    isCaseLabel(label) {
        return /^(?:default|[A-Za-z_][\w$]*(?:\[[^\]]+\])?)$/.test(label);
    }
    // ---- 对齐 case item 标签 ----//
    alignCaseItems(code) {
        const lines = code.split('\n');
        let i = 0;
        const splitTrailingComment = (statement) => {
            const idx = statement.indexOf('//');
            if (idx < 0) {
                return { code: statement.trimEnd(), comment: '' };
            }
            return {
                code: statement.slice(0, idx).trimEnd(),
                comment: statement.slice(idx).trim(),
            };
        };
        const parseCaseItem = (line, index) => {
            if (/^\s*\/\//.test(line)) {
                return null;
            }
            const indent = (line.match(/^(\s*)/) ?? ['', ''])[1];
            const body = line.slice(indent.length);
            const colonIdx = this.findCaseLabelColon(body);
            if (colonIdx < 0) {
                return null;
            }
            const label = body.slice(0, colonIdx).trim();
            const statement = body.slice(colonIdx + 1).trim();
            if (!this.isCaseLabel(label)) {
                return null;
            }
            if (statement.length > 0 && !this.isStatementTerminated(statement)) {
                return null;
            }
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
                }
                else if (/^endcase\b/.test(trimmed)) {
                    depth--;
                }
                i++;
            }
            const blockEnd = i - 1;
            const groups = new Map();
            for (let lineIdx = blockStart; lineIdx < blockEnd; lineIdx++) {
                const item = parseCaseItem(lines[lineIdx], lineIdx);
                if (!item) {
                    continue;
                }
                const group = groups.get(item.indent) ?? [];
                group.push(item);
                groups.set(item.indent, group);
            }
            for (const group of groups.values()) {
                if (group.length < 2) {
                    continue;
                }
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
    alignAssignContinuations(code) {
        const lines = code.split('\n');
        const result = [];
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
            while (exprIndent < line.length && line[exprIndent] === ' ') {
                exprIndent++;
            }
            const block = [line];
            i++;
            while (i < lines.length) {
                block.push(lines[i]);
                const trimmed = lines[i].trim();
                i++;
                if (this.isStatementTerminated(trimmed)) {
                    break;
                }
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
    alignAssignStatements(code) {
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        const parseAssign = (line) => {
            if (!this.isStatementTerminated(line)) {
                return null;
            }
            const m = line.match(/^(\s*)assign\s+(.+?)\s*=\s*(.+)$/);
            if (!m) {
                return null;
            }
            return { indent: m[1], lhs: m[2].trimEnd(), rhs: m[3].trim(), raw: line };
        };
        while (i < lines.length) {
            const first = parseAssign(lines[i]);
            if (!first) {
                result.push(lines[i++]);
                continue;
            }
            const group = [first];
            i++;
            while (i < lines.length) {
                const next = parseAssign(lines[i]);
                if (!next || next.indent !== first.indent) {
                    break;
                }
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
    alignProceduralAssignments(code) {
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        const parseAssignment = (line) => {
            if (!this.isStatementTerminated(line)) {
                return null;
            }
            if (/^\s*(?:assign|localparam|parameter|wire|reg|input|output|inout)\b/.test(line)) {
                return null;
            }
            const m = line.match(/^(\s*)([A-Za-z_][\w$]*(?:\s*\[[^\]]+\])?)\s*(<=|=)\s*(.+)$/);
            if (!m) {
                return null;
            }
            return { indent: m[1], lhs: m[2].trimEnd(), op: m[3], rhs: m[4].trim(), raw: line };
        };
        while (i < lines.length) {
            const first = parseAssignment(lines[i]);
            if (!first) {
                result.push(lines[i++]);
                continue;
            }
            const group = [first];
            i++;
            while (i < lines.length) {
                const next = parseAssignment(lines[i]);
                if (!next || next.indent !== first.indent || next.op !== first.op) {
                    break;
                }
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
    alignLocalparams(code) {
        const FIRST_RE = /^(\s*)(parameter|localparam)\b\s*(?:(\[[^\]]+\])\s*)?(\w+)\s*=\s*([^,;]+?)\s*([,;]?)\s*(\/\/.*)?$/;
        const CONT_RE = /^(\s*)(\w+)\s*=\s*([^,;]+?)\s*([,;])\s*(\/\/.*)?$/;
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        while (i < lines.length) {
            const fm = lines[i].match(FIRST_RE);
            if (!fm) {
                result.push(lines[i++]);
                continue;
            }
            const baseIndent = fm[1];
            const keyword = fm[2];
            const isSemicolonGroup = fm[6] === ';';
            if (isSemicolonGroup || this.startsKeywordParamGroup(lines, i, FIRST_RE)) {
                // 情况2：收集连续的同缩进 parameter/localparam ... ; 行作为一组对齐
                const group = [{ width: fm[3] ?? '', name: fm[4], value: fm[5].trim(), term: fm[6], comment: fm[7] ?? '' }];
                i++;
                while (i < lines.length) {
                    const nm = lines[i].match(FIRST_RE);
                    if (nm && nm[1] === baseIndent && nm[2] === keyword && (nm[6] === ';') === isSemicolonGroup) {
                        group.push({ width: nm[3] ?? '', name: nm[4], value: nm[5].trim(), term: nm[6], comment: nm[7] ?? '' });
                        i++;
                    }
                    else {
                        break;
                    }
                }
                const maxWidth = Math.max(...group.map(e => e.width.length));
                const maxName = Math.max(...group.map(e => e.name.length));
                const maxValue = Math.max(...group.map(e => e.value.length));
                group.forEach(e => {
                    const width = maxWidth > 0 ? `${e.width.padEnd(maxWidth)} ` : '';
                    const n = e.name.padEnd(maxName);
                    const v = isSemicolonGroup ? e.value.padEnd(maxValue) : e.value;
                    const c = e.comment ? ` ${e.comment}` : '';
                    result.push(`${baseIndent}${keyword} ${width}${n} = ${v}${e.term}${c}`);
                });
            }
            else {
                // 情况1：多参数逗号分隔块
                const entries = [{ width: '', name: fm[4], value: fm[5].trim(), term: fm[6], comment: fm[7] ?? '' }];
                i++;
                while (i < lines.length) {
                    const cm = lines[i].match(CONT_RE);
                    if (!cm) {
                        break;
                    }
                    entries.push({ width: '', name: cm[2], value: cm[3].trim(), term: cm[4], comment: cm[5] ?? '' });
                    i++;
                    if (cm[4] === ';') {
                        break;
                    }
                }
                // 续行缩进 = baseIndent + keyword + 2 空格
                const contIndent = baseIndent + ' '.repeat(keyword.length + 2);
                const maxName = Math.max(...entries.map(e => e.name.length));
                const maxValue = Math.max(...entries.map(e => e.value.length));
                entries.forEach((e, idx) => {
                    const n = e.name.padEnd(maxName);
                    const v = e.value.padEnd(maxValue);
                    const c = e.comment ? ` ${e.comment}` : '';
                    if (idx === 0) {
                        result.push(`${baseIndent}${keyword} ${n} = ${v}${e.term}${c}`);
                    }
                    else {
                        result.push(`${contIndent}${n} = ${v}${e.term}${c}`);
                    }
                });
            }
        }
        return result.join('\n');
    }
    startsKeywordParamGroup(lines, index, re) {
        const first = lines[index].match(re);
        const next = lines[index + 1]?.match(re);
        if (!first || !next) {
            return false;
        }
        return first[6] !== ';' && next[6] !== ';' && first[1] === next[1] && first[2] === next[2];
    }
    // ---- 对齐信号声明（reg / wire / logic / integer）----//
    // 格式：[属性]  类型    [signed] [位宽]   名称[= 初值]    ;   // 注释
    alignSignalDeclarations(code) {
        // 支持综合属性前缀、signed/unsigned、多名称声明、带初值；空行/注释行不断开 block
        // 但只合并 attr 结构相同的信号行（都有属性 or 都没有属性），避免跨组错乱
        const RE = /^(\s*)(\(\*[^*]*\*\)\s*)?(reg|wire|logic|integer)\b\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*(\w+(?:\s*,\s*\w+)*)\s*(=\s*[^;\/]+)?\s*;?\s*(\/\/.*)?$/;
        const ATTR_RE = /^\s*\(\*/;
        const isGap = (l) => l.trim() === '' || /^\s*\/\//.test(l);
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        while (i < lines.length) {
            if (!RE.test(lines[i])) {
                result.push(lines[i++]);
                continue;
            }
            const hasAttr = ATTR_RE.test(lines[i]);
            const block = [];
            while (i < lines.length) {
                // 连续行也须 attr 结构一致，attr 与非 attr 不合并到同一 block
                if (RE.test(lines[i]) && ATTR_RE.test(lines[i]) === hasAttr) {
                    block.push(lines[i++]);
                }
                else if (isGap(lines[i])) {
                    // 预看：找到下一个非 gap 行，attr 结构须与当前 block 一致才合并
                    let j = i + 1;
                    while (j < lines.length && isGap(lines[j])) {
                        j++;
                    }
                    if (j < lines.length && RE.test(lines[j]) && ATTR_RE.test(lines[j]) === hasAttr) {
                        while (i < j) {
                            block.push(lines[i++]);
                        }
                    }
                    else {
                        break;
                    }
                }
                else {
                    break;
                }
            }
            result.push(...this.formatSignalBlock(block, RE));
        }
        return result.join('\n');
    }
    formatSignalBlock(lines, RE) {
        const parsed = lines.map(line => {
            const m = line.match(RE);
            if (!m) {
                return { indent: '', attr: '', type: '', signWidth: '', name: line, comment: '' };
            }
            const sign = m[4] ?? '';
            const width = m[5] ?? '';
            const signWidth = [sign, width].filter(s => s).join(' ');
            const baseName = m[6].replace(/\s*,\s*/g, ', ');
            const initVal = m[7] ? m[7].trim() : '';
            const name = initVal ? `${baseName} ${initVal}` : baseName;
            return {
                indent: m[1],
                attr: m[2] ? m[2].trimEnd() : '',
                type: m[3],
                signWidth,
                name,
                comment: m[8] ?? '',
            };
        });
        const maxAttr = Math.max(...parsed.map(p => p.attr.length));
        const maxType = Math.max(...parsed.map(p => p.type.length));
        const maxSignWidth = Math.max(...parsed.map(p => p.signWidth.length));
        const maxName = Math.max(...parsed.map(p => p.name.length));
        return parsed.map(p => {
            if (!p.type) {
                return p.name;
            }
            // 有属性前缀的行与无属性行对齐：属性列统一补齐
            const attrPad = maxAttr > 0
                ? (p.attr ? p.attr : '').padEnd(maxAttr) + '  '
                : '';
            const typePad = p.type.padEnd(maxType + 4);
            const signWidthPad = p.signWidth.padEnd(maxSignWidth + 3);
            const namePad = p.name.padEnd(maxName + 4);
            const cmt = p.comment
                ? ` ${p.comment.startsWith('//') ? p.comment : '// ' + p.comment}`
                : '';
            return `${p.indent}${attrPad}${typePad}${signWidthPad}${namePad};${cmt}`;
        });
    }
    // ---- 对齐例化端口连接 ----//
    // 格式：  .portName ( signalExpr  ),  // comment
    // 支持：  紧凑写法 .port(sig), → 展开为 .port ( sig  ),
    //         块内注释行（// ...）和空行透传，不打断分组
    alignInstantiationPorts(code) {
        const IS_PORT_RE = /^\s*\.\w+\s*\(/;
        const isGap = (l) => l.trim() === '' || /^\s*\/\//.test(l);
        // 解析一行 .portName ( expr ), // comment，支持 expr 内嵌套括号
        const parseConn = (line) => {
            const pm = line.match(/^(\s*)\.(\w+)\s*\(/);
            if (!pm) {
                return null;
            }
            const indent = pm[1];
            const port = pm[2];
            const pos = pm[0].length - 1; // 首个 '(' 的下标
            let depth = 0;
            let exprStart = -1;
            let closeParen = -1;
            for (let k = pos; k < line.length; k++) {
                if (line[k] === '(') {
                    depth++;
                    if (depth === 1) {
                        exprStart = k + 1;
                    }
                }
                else if (line[k] === ')') {
                    depth--;
                    if (depth === 0) {
                        closeParen = k;
                        break;
                    }
                }
            }
            if (closeParen < 0) {
                return null;
            }
            const expr = line.substring(exprStart, closeParen).trim();
            const rest = line.substring(closeParen + 1).trim();
            const rm = rest.match(/^(,?)\s*(\/\/.*)?$/);
            if (!rm) {
                return null;
            }
            return { indent, port, expr, comma: rm[1] ?? '', comment: rm[2] ?? '' };
        };
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        while (i < lines.length) {
            const prevLine = [...result].reverse().find(line => line.trim() !== '');
            const openedByPrevLine = prevLine !== undefined && /\(\s*$/.test(prevLine.trim());
            if (!IS_PORT_RE.test(lines[i])) {
                let j = i;
                while (j < lines.length && isGap(lines[j])) {
                    j++;
                }
                if (!openedByPrevLine || j >= lines.length || !IS_PORT_RE.test(lines[j])) {
                    result.push(lines[i++]);
                    continue;
                }
            }
            // 收集连续的端口连接行（空行/注释行允许穿插）
            const block = [];
            while (i < lines.length) {
                if (IS_PORT_RE.test(lines[i])) {
                    block.push(lines[i++]);
                }
                else if (isGap(lines[i])) {
                    let j = i + 1;
                    while (j < lines.length && isGap(lines[j])) {
                        j++;
                    }
                    if (j < lines.length && IS_PORT_RE.test(lines[j])) {
                        while (i < j) {
                            block.push(lines[i++]);
                        }
                    }
                    else {
                        break;
                    }
                }
                else {
                    break;
                }
            }
            const conns = block.map(line => ({ raw: line, conn: parseConn(line) }));
            const valid = conns.filter(x => x.conn !== null).map(x => x.conn);
            if (valid.length === 0) {
                result.push(...block);
                continue;
            }
            const maxPort = Math.max(...valid.map(c => c.port.length));
            const maxExpr = Math.max(...valid.map(c => c.expr.length));
            const connIndent = openedByPrevLine
                ? (prevLine.match(/^(\s*)/) ?? ['', ''])[1] + '  '
                : null;
            result.push(...conns.map(({ raw, conn }) => {
                if (!conn) {
                    const trimmed = raw.trim();
                    if (trimmed === '') {
                        return '';
                    }
                    return connIndent !== null && trimmed.startsWith('//') ? connIndent + trimmed : raw;
                }
                const indent = connIndent ?? conn.indent;
                const portPad = conn.port.padEnd(maxPort);
                const exprPad = conn.expr.padEnd(maxExpr);
                const cmt = conn.comment ? `  ${conn.comment}` : '';
                return `${indent}.${portPad} ( ${exprPad}  )${conn.comma}${cmt}`;
            }));
        }
        return result.join('\n');
    }
    // ---- 对齐端口声明（input / output / inout）----//
    // 格式：[属性]  方向  类型  [signed/unsigned] [位宽]  名称  ,  // 注释
    // 支持 (* mark_debug = "true" *) 等综合属性前缀，以及 signed/unsigned 修饰符
    alignPortDeclarations(code) {
        const RE = /^(\s*)(\(\*[^*]*\*\)\s*)?(input|output|inout)\b\s*(wire|reg|logic)?\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*([\w_]+)\s*(,?)\s*(\/\/.*)?$/;
        // 端口块内允许空行和注释行，整个端口列表统一对齐
        return this.processBlocksWithGaps(code, RE, (block) => this.formatPortBlock(block, RE));
    }
    formatPortBlock(lines, RE) {
        const parsed = lines.map(line => {
            const m = line.match(RE);
            if (!m) {
                return { indent: '', attr: '', dir: '', ptype: '', signWidth: '', name: line, comma: '', comment: '' };
            }
            // 将 signed/unsigned 与位宽合并为一列，保持视觉连贯
            const sign = m[5] ?? '';
            const width = m[6] ?? '';
            const signWidth = [sign, width].filter(s => s).join(' ');
            return {
                indent: m[1],
                attr: m[2] ? m[2].trimEnd() : '',
                dir: m[3],
                ptype: m[4] ?? 'wire',
                signWidth,
                name: m[7],
                comma: m[8] ?? '',
                comment: m[9] ?? '',
            };
        });
        const maxDir = Math.max(...parsed.map(p => p.dir.length));
        const maxType = Math.max(...parsed.map(p => p.ptype.length));
        const maxSignWidth = Math.max(...parsed.map(p => p.signWidth.length));
        const maxName = Math.max(...parsed.map(p => p.name.length));
        return parsed.map(p => {
            if (!p.dir) {
                return p.name;
            }
            const dirPad = p.dir.padEnd(maxDir + 2);
            const typePad = p.ptype.padEnd(maxType + 2);
            // 有位宽/signed 时留 1 个间距，无时不补空列（让 alignTrailingComments 统一对齐注释）
            const swPad = maxSignWidth > 0 ? p.signWidth.padEnd(maxSignWidth + 1) : '';
            const namePad = p.name.padEnd(maxName);
            const cmt = p.comment
                ? `  ${p.comment.startsWith('//') ? p.comment : '// ' + p.comment}`
                : '';
            // 属性前缀保留原文，与方向之间用 2 个空格分隔
            const attrPad = p.attr ? p.attr + '  ' : '';
            return `${p.indent}${attrPad}${dirPad}${typePad}${swPad}${namePad}${p.comma}${cmt}`;
        });
    }
    // ---- 对齐行尾注释 ----//
    // 将连续有行尾注释的行的 // 对齐到同一列（代码最大长度 + 3 空格）
    alignTrailingComments(code) {
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        while (i < lines.length) {
            if (!this.hasTrailingComment(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }
            // 收集连续有行尾注释的行
            const block = [];
            while (i < lines.length && this.hasTrailingComment(lines[i])) {
                block.push(lines[i]);
                i++;
            }
            result.push(...this.alignCommentBlock(block));
        }
        return result.join('\n');
    }
    // 判断一行是否有行尾注释（行本身不是注释行）
    hasTrailingComment(line) {
        const s = line.trim();
        if (!s || s.startsWith('//') || s.startsWith('/*') || s.startsWith('*')) {
            return false;
        }
        return /\S.*\/\//.test(line);
    }
    // 将块内所有行的 // 对齐到最大代码列 + 1 空格
    alignCommentBlock(lines) {
        const GAP = 1;
        const codeParts = lines.map(line => {
            const idx = line.indexOf('//');
            return idx >= 0 ? line.substring(0, idx).trimEnd() : line;
        });
        const maxLen = Math.max(...codeParts.map(s => s.length));
        const commentCol = maxLen + GAP;
        return lines.map((line, i) => {
            const idx = line.indexOf('//');
            if (idx < 0) {
                return line;
            }
            const comment = line.substring(idx);
            return codeParts[i].padEnd(commentCol) + comment;
        });
    }
    // ---- 通用：找到匹配正则的连续行块并批量处理（允许空行/注释行作为间隔）----//
    // 遇到空行或注释行时向前预看，后面仍有匹配行则将间隔行纳入同一 block
    processBlocksWithGaps(code, re, handler) {
        const isGap = (l) => l.trim() === '' || /^\s*\/\//.test(l);
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        while (i < lines.length) {
            if (!re.test(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }
            const block = [];
            while (i < lines.length) {
                if (re.test(lines[i])) {
                    block.push(lines[i++]);
                }
                else if (isGap(lines[i])) {
                    // 预看：跳过连续 gap 行，看后面是否还有匹配行
                    let j = i + 1;
                    while (j < lines.length && isGap(lines[j])) {
                        j++;
                    }
                    if (j < lines.length && re.test(lines[j])) {
                        // 后面还有端口行，把 gap 行也收入 block
                        while (i < j) {
                            block.push(lines[i++]);
                        }
                    }
                    else {
                        break;
                    }
                }
                else {
                    break;
                }
            }
            result.push(...handler(block));
        }
        return result.join('\n');
    }
    // ---- 通用：找到匹配正则的连续行块并批量处理 ----//
    processBlocks(code, re, handler) {
        const lines = code.split('\n');
        const result = [];
        let i = 0;
        while (i < lines.length) {
            if (!re.test(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }
            const block = [];
            while (i < lines.length && re.test(lines[i])) {
                block.push(lines[i]);
                i++;
            }
            result.push(...handler(block));
        }
        return result.join('\n');
    }
    // ---- 清除行尾空格 ----//
    trimTrailingWhitespace(code) {
        return code.split('\n').map(l => l.trimEnd()).join('\n');
    }
}
exports.VerilogFormatter = VerilogFormatter;
//# sourceMappingURL=formatter.js.map