"use strict";
// =========================================================================
// 文件    : cFormatter.ts
// 描述    : C/C++ 变量定义、函数调用和函数花括号格式化
// 版本    : v1.4.10
// 日期    : 2026/09/15
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.4.10 2026/09/15  对齐宏定义的宏值和注释，以及连续同名调用的参数列
//  v1.4.9  2026/09/15  对齐函数内连续赋值的左值、等号、表达式、分号和注释
//  v1.4.8  2026/09/15  补齐变量声明的等号、初始值、分号和注释列对齐
//  v1.4.2  2026/08/21  将跨行控制条件合并为单行
//  v1.4.0  2026/08/21  按代码块层级重算 C/C++ 缩进
//  v1.3.3  2026/08/21  修正单行函数签名的左花括号位置识别
//  v1.3.2  2026/08/21  将枚举左花括号放到类型声明末尾
//  v1.3.1  2026/08/21  将结构体和联合体左花括号放到类型声明末尾
//  v1.3.0  2026/08/21  增加枚举项名称、赋值、逗号和注释多列对齐
//  v1.2.2  2026/08/21  在连续类型定义之间保留一个空行
//  v1.2.0  2026/08/21  增加结构体成员的类型、名称、分号和注释多列对齐
//  v1.1.0  2026/08/21  创建文件
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
exports.CFormatter = void 0;
exports.formatC = formatC;
const vscode = __importStar(require("vscode"));
const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch']);
const NON_TYPE_KEYWORDS = new Set([
    'break', 'case', 'continue', 'delete', 'else', 'goto', 'new', 'return', 'throw', 'using',
]);
const C_LITERALS_AND_COMMENTS = /R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[^\r\n]|[^'\\\r\n])+'|\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*/g;
/** 格式化 C/C++ 源码中明确要求统一的布局，不改写表达式语义。 */
function formatC(code) {
    const eol = code.includes('\r\n') ? '\r\n' : '\n';
    let normalized = code.replace(/\r\n/g, '\n');
    normalized = collapseMultilineControlConditions(normalized);
    normalized = collapseMultilineCalls(normalized);
    normalized = collapseMultilineCallExpressions(normalized);
    normalized = placeFunctionOpeningBraces(normalized);
    normalized = placeTypeOpeningBraces(normalized);
    normalized = reindentCBlocks(normalized);
    normalized = alignMacroDefines(normalized);
    normalized = alignVariableDeclarations(normalized);
    normalized = alignAssignments(normalized);
    normalized = alignConsecutiveCalls(normalized);
    normalized = alignEnumDeclarations(normalized);
    normalized = ensureBlankLineAfterTypeDeclarations(normalized);
    normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');
    return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}
function collapseMultilineCalls(code) {
    const lines = code.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        if (!isCallStart(lines[i])) {
            result.push(lines[i]);
            continue;
        }
        let balance = parenthesisDelta(lines[i]);
        if (balance <= 0) {
            result.push(lines[i]);
            continue;
        }
        let end = i;
        let containsComment = hasComment(lines[i]);
        while (balance > 0 && end + 1 < lines.length) {
            end++;
            balance += parenthesisDelta(lines[end]);
            containsComment || (containsComment = hasComment(lines[end]));
        }
        if (balance !== 0
            || end === i
            || containsComment
            || !isCallTerminator(lines[end])
            || (isFunctionBodyFollowing(lines, end) && !isControlStatement(lines[i]))) {
            result.push(lines[i]);
            continue;
        }
        const indent = lines[i].match(/^\s*/)?.[0] ?? '';
        const joined = joinInlineLines(lines.slice(i, end + 1));
        result.push(indent + joined);
        i = end;
    }
    return result.join('\n');
}
function collapseMultilineCallExpressions(code) {
    const lines = code.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        if (!isCallExpressionStart(lines[i])) {
            result.push(lines[i]);
            continue;
        }
        let end = i;
        let balance = parenthesisDelta(lines[i]);
        let containsComment = hasComment(lines[i]);
        while (!/;\s*$/.test(lines[end].trim()) && end + 1 < lines.length) {
            end++;
            balance += parenthesisDelta(lines[end]);
            containsComment || (containsComment = hasComment(lines[end]));
        }
        const block = lines.slice(i, end + 1);
        if (end === i
            || balance !== 0
            || containsComment
            || !/;\s*$/.test(lines[end].trim())
            || !block.some(line => /(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)*[A-Za-z_]\w*\s*\(/.test(line))) {
            result.push(lines[i]);
            continue;
        }
        const indent = lines[i].match(/^\s*/)?.[0] ?? '';
        result.push(indent + joinInlineLines(block));
        i = end;
    }
    return result.join('\n');
}
function collapseMultilineControlConditions(code) {
    const lines = code.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!/^(?:(?:if|while|for|switch)\s*\(|else\s+if\s*\()/.test(trimmed)) {
            result.push(lines[i]);
            continue;
        }
        let balance = parenthesisDelta(lines[i]);
        if (balance <= 0) {
            result.push(lines[i]);
            continue;
        }
        let end = i;
        let containsComment = hasComment(lines[i]);
        while (balance > 0 && end + 1 < lines.length) {
            end++;
            balance += parenthesisDelta(lines[end]);
            containsComment || (containsComment = hasComment(lines[end]));
        }
        if (balance !== 0 || end === i || containsComment) {
            result.push(lines[i]);
            continue;
        }
        const indent = lines[i].match(/^\s*/)?.[0] ?? '';
        result.push(indent + joinInlineLines(lines.slice(i, end + 1)));
        i = end;
    }
    return result.join('\n');
}
function isCallExpressionStart(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || hasComment(line)) {
        return false;
    }
    if (/^(?:if|for|while|switch|catch|else)\b/.test(trimmed)) {
        return false;
    }
    return (/(?:^|[^=!<>])=(?!=)/.test(trimmed) || /^(?:return|throw|co_return)\b/.test(trimmed))
        && !/[;{}]\s*$/.test(trimmed);
}
function joinInlineLines(lines) {
    const trimmedLines = lines.map(line => line.trim());
    return trimmedLines.slice(1).reduce((current, next) => {
        const separator = current.endsWith('(') || /^[),;]/.test(next) ? '' : ' ';
        return current + separator + next;
    }, trimmedLines[0]);
}
function isCallStart(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || hasComment(line)) {
        return false;
    }
    const directCall = trimmed.match(/^([A-Za-z_]\w*)\s*\(/);
    if (directCall) {
        if (!CONTROL_KEYWORDS.has(directCall[1])) {
            return true;
        }
        const condition = trimmed.slice(directCall[0].length);
        return /(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)*[A-Za-z_]\w*\s*\(/.test(condition);
    }
    if (/^(?:return|throw|co_return)\b/.test(trimmed) || /=/.test(trimmed)) {
        return /(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)*[A-Za-z_]\w*\s*\(/.test(trimmed);
    }
    return /^(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)+[A-Za-z_]\w*\s*\(/.test(trimmed);
}
function isCallTerminator(line) {
    return /\)\s*[;,]?\s*$/.test(line.trim());
}
function isControlStatement(line) {
    const firstWord = line.trim().match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    return CONTROL_KEYWORDS.has(firstWord);
}
function isFunctionBodyFollowing(lines, end) {
    for (let i = end + 1; i < lines.length; i++) {
        if (!lines[i].trim()) {
            continue;
        }
        return /^\s*\{\s*$/.test(lines[i]);
    }
    return false;
}
function hasComment(line) {
    return line.includes('//') || line.includes('/*') || line.includes('*/');
}
function parenthesisDelta(line) {
    let delta = 0;
    let quote = '';
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1] ?? '';
        if (!quote && char === '/' && (next === '/' || next === '*')) {
            break;
        }
        if (quote) {
            if (escaped) {
                escaped = false;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === quote) {
                quote = '';
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
        }
        else if (char === '(') {
            delta++;
        }
        else if (char === ')') {
            delta--;
        }
    }
    return delta;
}
function placeFunctionOpeningBraces(code) {
    const lines = code.split('\n');
    const result = [];
    for (const line of lines) {
        if (!/^\s*\{\s*$/.test(line)) {
            result.push(line);
            continue;
        }
        let previous = result.length - 1;
        while (previous >= 0 && result[previous].trim() === '') {
            previous--;
        }
        if (previous < 0 || !isFunctionSignature(result, previous)) {
            result.push(line);
            continue;
        }
        result.splice(previous + 1);
        result[previous] = `${result[previous].trimEnd()} {`;
    }
    return result.join('\n');
}
function placeTypeOpeningBraces(code) {
    const lines = code.split('\n');
    const result = [];
    for (const line of lines) {
        if (!/^\s*\{\s*$/.test(line)) {
            result.push(line);
            continue;
        }
        let previous = result.length - 1;
        while (previous >= 0 && result[previous].trim() === '') {
            previous--;
        }
        if (previous < 0
            || !/^\s*(?:typedef\s+)?(?:struct|union|enum)\b(?:\s+[A-Za-z_]\w*)?\s*$/.test(result[previous])) {
            result.push(line);
            continue;
        }
        result.splice(previous + 1);
        result[previous] = `${result[previous].trimEnd()} {`;
    }
    return result.join('\n');
}
function reindentCBlocks(code, indentSize = 4) {
    const lines = code.split('\n');
    const result = [];
    const existingIndents = lines
        .filter(line => line.trim() && !line.trim().startsWith('#'))
        .map(line => line.match(/^\s*/)?.[0].length ?? 0);
    const baseIndent = existingIndents.length > 0 ? Math.min(...existingIndents) : 0;
    let braceDepth = 0;
    let parenthesisDepth = 0;
    let previousControlWithoutBrace = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            result.push('');
            continue;
        }
        if (trimmed.startsWith('#')) {
            result.push(trimmed);
            previousControlWithoutBrace = false;
            continue;
        }
        const continuationLine = parenthesisDepth > 0;
        let indentDepth = Math.max(0, braceDepth - (trimmed.startsWith('}') ? 1 : 0));
        if (/^(?:case\b.*:|default\s*:|public:|protected:|private:)$/.test(trimmed)) {
            indentDepth = Math.max(0, indentDepth - 1);
        }
        if (previousControlWithoutBrace && !trimmed.startsWith('{')) {
            indentDepth++;
        }
        const originalIndent = line.match(/^\s*/)?.[0] ?? '';
        const indent = continuationLine
            ? originalIndent
            : ' '.repeat(baseIndent + indentDepth * indentSize);
        result.push(indent + trimmed);
        braceDepth = Math.max(0, braceDepth + structuralBraceDelta(line));
        parenthesisDepth = Math.max(0, parenthesisDepth + parenthesisDelta(line));
        previousControlWithoutBrace = isControlWithoutBrace(trimmed);
    }
    return result.join('\n');
}
function structuralBraceDelta(line) {
    let delta = 0;
    let quote = '';
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1] ?? '';
        if (!quote && char === '/' && (next === '/' || next === '*')) {
            break;
        }
        if (quote) {
            if (escaped) {
                escaped = false;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === quote) {
                quote = '';
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
        }
        else if (char === '{') {
            delta++;
        }
        else if (char === '}') {
            delta--;
        }
    }
    return delta;
}
function isControlWithoutBrace(line) {
    const code = line.replace(/\/\/.*$/, '').trimEnd();
    return /^(?:if|for|while|switch)\s*\(.*\)\s*$/.test(code)
        || /^else(?:\s+if\s*\(.*\))?\s*$/.test(code);
}
function isFunctionSignature(lines, end) {
    let start = end;
    let balance = parenthesisDelta(lines[end]);
    while (start > 0 && balance < 0) {
        start--;
        balance += parenthesisDelta(lines[start]);
    }
    const signature = lines.slice(start, end + 1).map(line => line.trim()).join(' ');
    const firstWord = signature.match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    if (CONTROL_KEYWORDS.has(firstWord)
        || /^(?:else|do|return|throw|co_return)\b/.test(signature)) {
        return false;
    }
    const open = signature.indexOf('(');
    if (open < 0 || signature.includes(';') || signature.slice(0, open).includes('=')) {
        return false;
    }
    const beforeParenthesis = signature.slice(0, open).trimEnd();
    const nameMatch = beforeParenthesis.match(/([~A-Za-z_]\w*(?:::[~A-Za-z_]\w*)*)$/);
    if (!nameMatch) {
        return false;
    }
    const functionName = nameMatch[1];
    const prefix = beforeParenthesis.slice(0, -functionName.length).trim();
    return prefix.length > 0 || functionName.includes('::');
}
function alignVariableDeclarations(code) {
    const lines = code.split('\n');
    const result = [];
    for (let i = 0; i < lines.length;) {
        const first = parseDeclaration(lines[i]);
        if (!first) {
            result.push(lines[i++]);
            continue;
        }
        const block = [first];
        let end = i + 1;
        while (end < lines.length) {
            const parsed = parseDeclaration(lines[end]);
            if (!parsed) {
                break;
            }
            block.push(parsed);
            end++;
        }
        if (block.length === 1) {
            result.push(lines[i]);
        }
        else {
            const maxType = Math.max(...block.map(item => item.typePrefix.length));
            const declarations = block.map(item => `${item.pointer}${item.name}${item.arraySuffix}`);
            const maxDeclaration = Math.max(...declarations.map(item => item.length));
            const maxInitializer = Math.max(...block.map(item => item.initializer.length));
            const initializerWidth = maxInitializer > 0 ? maxInitializer + 1 : 0;
            result.push(...block.map((item, index) => {
                const declaration = declarations[index].padEnd(maxDeclaration + 1);
                const initializer = item.initializer.padEnd(initializerWidth);
                const comment = item.comment ? `  ${item.comment}` : '';
                return `${item.typePrefix.padEnd(maxType + 1)}${declaration}${initializer};${comment}`;
            }));
        }
        i = end;
    }
    return result.join('\n');
}
function maskCLiteralsAndComments(code) {
    // 遮蔽字面量和注释但保留字符位置，避免把其中的等号、分号和跨行内容当作语句。
    return code.replace(C_LITERALS_AND_COMMENTS, literal => literal.replace(/[^\n]/g, ' '));
}
function alignAssignments(code) {
    const lines = code.split('\n');
    const maskedLines = maskCLiteralsAndComments(code).split('\n');
    const assignments = lines.map((line, index) => parseAssignment(line, maskedLines[index]));
    for (let i = 0; i < lines.length;) {
        const first = assignments[i];
        if (!first) {
            i++;
            continue;
        }
        const block = [first];
        let end = i + 1;
        while (end < lines.length) {
            const next = assignments[end];
            if (!next || next.indent !== first.indent) {
                break;
            }
            block.push(next);
            end++;
        }
        if (block.length > 1) {
            const maxTarget = Math.max(...block.map(item => item.target.length));
            const maxValue = Math.max(...block.map(item => item.value.length));
            block.forEach((item, offset) => {
                const target = item.target.padEnd(maxTarget + 1);
                const value = item.value.padEnd(maxValue + 1);
                const comment = item.comment ? `  ${item.comment}` : '';
                lines[i + offset] = `${item.indent}${target}= ${value};${comment}`;
            });
        }
        i = end;
    }
    return lines.join('\n');
}
function parseAssignment(line, maskedLine) {
    const prefix = maskedLine.match(/^(\s*)([A-Za-z_]\w*(?:\s*(?:::|\.|->)\s*[A-Za-z_]\w*|\s*\[[^\[\]]+\])*)\s*=(?!=)/);
    if (!prefix
        || line.slice(0, prefix[1].length) !== prefix[1]
        || CONTROL_KEYWORDS.has(prefix[2])
        || NON_TYPE_KEYWORDS.has(prefix[2])) {
        return undefined;
    }
    const semicolon = maskedLine.lastIndexOf(';');
    if (semicolon < prefix[0].length
        || maskedLine.slice(semicolon + 1).trim()
        || maskedLine.slice(prefix[0].length, semicolon).includes(';')
        || /[{}]/.test(maskedLine)
        || parenthesisDelta(maskedLine) !== 0) {
        return undefined;
    }
    const value = line.slice(prefix[0].length, semicolon).trim();
    if (!value) {
        return undefined;
    }
    return {
        indent: prefix[1],
        target: line.slice(prefix[1].length, prefix[0].length - 1).trimEnd(),
        value,
        comment: line.slice(semicolon + 1).trim(),
    };
}
function alignConsecutiveCalls(code) {
    const lines = code.split('\n');
    const maskedLines = maskCLiteralsAndComments(code).split('\n');
    const calls = lines.map((line, index) => parseCall(line, maskedLines[index]));
    for (let i = 0; i < lines.length;) {
        const first = calls[i];
        if (!first) {
            i++;
            continue;
        }
        const block = [first];
        let end = i + 1;
        while (end < lines.length) {
            const next = calls[end];
            if (!next || next.indent !== first.indent || next.callee !== first.callee
                || next.args.length !== first.args.length) {
                break;
            }
            block.push(next);
            end++;
        }
        if (block.length > 1) {
            const widths = first.args.map((_, index) => Math.max(...block.map(item => item.args[index].length)));
            block.forEach((item, offset) => {
                const args = item.args.map((arg, index) => arg.padEnd(widths[index] + 1)).join(', ');
                const comment = item.comment ? `  ${item.comment}` : '';
                lines[i + offset] = `${item.indent}${item.callee}(${args});${comment}`;
            });
        }
        i = end;
    }
    return lines.join('\n');
}
function parseCall(line, maskedLine) {
    const prefix = maskedLine.match(/^(\s*)((?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)*[A-Za-z_]\w*)\s*\(/);
    if (!prefix || CONTROL_KEYWORDS.has(prefix[2]) || NON_TYPE_KEYWORDS.has(prefix[2])
        || line.slice(0, prefix[0].length) !== prefix[0]) {
        return undefined;
    }
    const args = [];
    const closings = [')'];
    let start = prefix[0].length;
    for (let i = start; i < maskedLine.length; i++) {
        const char = maskedLine[i];
        if ('([{'.includes(char)) {
            closings.push(char === '(' ? ')' : char === '[' ? ']' : '}');
        }
        else if (')]}'.includes(char)) {
            if (closings.pop() !== char) {
                return undefined;
            }
            if (closings.length === 0) {
                const lastArg = line.slice(start, i).trim();
                if (!lastArg || !/^\s*;\s*$/.test(maskedLine.slice(i + 1))) {
                    return undefined;
                }
                const semicolon = maskedLine.indexOf(';', i + 1);
                if (line.slice(i + 1, semicolon).trim()) {
                    return undefined;
                }
                args.push(lastArg);
                return {
                    indent: prefix[1],
                    callee: prefix[2],
                    args,
                    comment: line.slice(semicolon + 1).trim(),
                };
            }
        }
        else if (closings.length === 1 && char === ',') {
            const arg = line.slice(start, i).trim();
            if (!arg) {
                return undefined;
            }
            args.push(arg);
            start = i + 1;
        }
        else if (closings.length === 1 && (char === '<' || char === ';')) {
            // 模板实参与比较运算的尖括号有歧义，不把其中的逗号猜作参数分隔符。
            return undefined;
        }
    }
    return undefined;
}
function alignMacroDefines(code) {
    const lines = code.split('\n');
    const result = [];
    const maskedLines = maskCLiteralsAndComments(code).split('\n');
    const macros = lines.map((line, index) => {
        if (!/^\s*#define\b/.test(maskedLines[index])
            || (index > 0 && lines[index - 1].trimEnd().endsWith('\\'))) {
            return undefined;
        }
        return parseMacroDefine(line);
    });
    for (let i = 0; i < lines.length;) {
        const first = macros[i];
        if (!first) {
            result.push(lines[i++]);
            continue;
        }
        const block = [first];
        let end = i + 1;
        while (end < lines.length) {
            const parsed = macros[end];
            if (!parsed) {
                break;
            }
            block.push(parsed);
            end++;
        }
        if (block.length === 1) {
            result.push(lines[i]);
        }
        else {
            const maxSignature = Math.max(...block.map(item => item.signature.length));
            const maxBody = Math.max(...block.map(item => item.body.length));
            result.push(...block.map(item => {
                const body = item.comment ? `${item.body.padEnd(maxBody)}  ${item.comment}` : item.body;
                return `${item.prefix}${item.signature.padEnd(maxSignature + 1)}${body}`;
            }));
        }
        i = end;
    }
    return result.join('\n');
}
function parseMacroDefine(line) {
    const match = line.match(/^(\s*#define\s+)([A-Za-z_]\w*(?:\([^)]*\))?)\s+(.+)$/);
    if (!match || line.trimEnd().endsWith('\\')) {
        return undefined;
    }
    const replacement = match[3].trim();
    const commentMatch = [...replacement.matchAll(C_LITERALS_AND_COMMENTS)]
        .find(token => token[0].startsWith('//') || token[0].startsWith('/*'));
    if (commentMatch?.[0].startsWith('/*')
        && (!commentMatch[0].endsWith('*/')
            || replacement.slice(commentMatch.index + commentMatch[0].length).trim())) {
        return undefined;
    }
    const body = commentMatch ? replacement.slice(0, commentMatch.index).trimEnd() : replacement;
    if (!body) {
        return undefined;
    }
    return {
        prefix: '#define ',
        signature: match[2],
        body,
        comment: commentMatch ? replacement.slice(commentMatch.index) : '',
    };
}
function ensureBlankLineAfterTypeDeclarations(code) {
    const lines = code.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        result.push(lines[i]);
        const closesNamedType = /^\s*}\s*[A-Za-z_]\w*\s*;\s*(?:\/\/.*)?$/.test(lines[i]);
        if (closesNamedType && i + 1 < lines.length && lines[i + 1].trim() !== '') {
            result.push('');
        }
    }
    return result.join('\n');
}
function alignEnumDeclarations(code) {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*(?:typedef\s+)?enum(?:\s+[A-Za-z_]\w*)?\s*(?:\{|$)/.test(lines[i])) {
            continue;
        }
        let openingLine = i;
        while (openingLine < lines.length && !lines[openingLine].includes('{')) {
            openingLine++;
        }
        if (openingLine >= lines.length) {
            break;
        }
        let depth = 0;
        let closingLine = openingLine;
        for (; closingLine < lines.length; closingLine++) {
            depth += braceDelta(lines[closingLine]);
            if (depth === 0) {
                break;
            }
        }
        if (closingLine >= lines.length) {
            break;
        }
        alignEnumMemberRange(lines, openingLine + 1, closingLine);
        i = closingLine;
    }
    return lines.join('\n');
}
function braceDelta(line) {
    const code = line.split('//', 1)[0];
    return [...code].reduce((depth, char) => {
        if (char === '{') {
            return depth + 1;
        }
        if (char === '}') {
            return depth - 1;
        }
        return depth;
    }, 0);
}
function alignEnumMemberRange(lines, start, end) {
    for (let i = start; i < end;) {
        const first = parseEnumMember(lines[i]);
        if (!first) {
            i++;
            continue;
        }
        const members = [first];
        let blockEnd = i + 1;
        while (blockEnd < end) {
            const member = parseEnumMember(lines[blockEnd]);
            if (!member) {
                break;
            }
            members.push(member);
            blockEnd++;
        }
        const maxName = Math.max(...members.map(member => member.name.length));
        const maxAssignment = Math.max(...members.map(member => member.assignment.length));
        const assignmentWidth = maxAssignment > 0 ? maxAssignment + 1 : 0;
        for (let offset = 0; offset < members.length; offset++) {
            const member = members[offset];
            const name = member.name.padEnd(maxName + 1);
            const assignment = member.assignment.padEnd(assignmentWidth);
            const comma = member.comma ? ',' : member.comment ? ' ' : '';
            const comment = member.comment ? `  ${member.comment}` : '';
            lines[i + offset] = `${member.indent}${name}${assignment}${comma}${comment}`;
        }
        i = blockEnd;
    }
}
function parseEnumMember(line) {
    const commentIndex = line.indexOf('//');
    const comment = commentIndex >= 0 ? line.slice(commentIndex).trim() : '';
    let code = (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trimEnd();
    const indent = code.match(/^\s*/)?.[0] ?? '';
    code = code.trim();
    if (!code || code.startsWith('#')) {
        return undefined;
    }
    const comma = code.endsWith(',');
    if (comma) {
        code = code.slice(0, -1).trimEnd();
    }
    const equal = code.search(/(?<![=!<>])=(?!=)/);
    const name = (equal >= 0 ? code.slice(0, equal) : code).trim();
    if (!/^[A-Za-z_]\w*$/.test(name)) {
        return undefined;
    }
    const value = equal >= 0 ? code.slice(equal + 1).trim() : '';
    if (equal >= 0 && !value) {
        return undefined;
    }
    return {
        indent,
        name,
        assignment: value ? `= ${value}` : '',
        comma,
        comment,
    };
}
function parseDeclaration(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        return undefined;
    }
    const commentIndex = line.indexOf('//');
    const comment = commentIndex >= 0 ? line.slice(commentIndex).trim() : '';
    const statement = (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trimEnd();
    const trimmedStatement = statement.trim();
    if (!trimmedStatement.endsWith(';')
        || /^[{}]/.test(trimmedStatement)
        || trimmedStatement.includes('(')
        || trimmedStatement.includes(',')
        || /^(?:typedef|using)\b/.test(trimmedStatement)) {
        return undefined;
    }
    const semicolon = statement.lastIndexOf(';');
    if (semicolon < 0) {
        return undefined;
    }
    const body = statement.slice(0, semicolon);
    const equal = body.search(/(?<![=!<>])=(?!=)/);
    const declarator = (equal >= 0 ? body.slice(0, equal) : body).trimEnd();
    const initializer = equal >= 0 ? `= ${body.slice(equal + 1).trim()}` : '';
    const match = declarator.match(/^(\s*)(.*?)([A-Za-z_]\w*)(\s*(?:\[[^\]]*\]\s*)*)$/);
    if (!match) {
        return undefined;
    }
    const declaratorPrefix = match[2].trimEnd();
    const pointerMatch = declaratorPrefix.match(/^(.*?)([*&]+)\s*$/);
    const typePart = (pointerMatch?.[1] ?? declaratorPrefix).trimEnd();
    const pointer = pointerMatch?.[2] ?? '';
    const firstWord = typePart.trim().match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    if (!typePart || NON_TYPE_KEYWORDS.has(firstWord) || !/[\s*&]$/.test(match[2])) {
        return undefined;
    }
    return {
        typePrefix: match[1] + typePart,
        pointer,
        name: match[3],
        arraySuffix: match[4].trimEnd(),
        initializer,
        comment,
    };
}
class CFormatter {
    provideDocumentFormattingEdits(document) {
        const original = document.getText();
        const formatted = formatC(original);
        if (formatted === original) {
            return [];
        }
        const lastLine = document.lineAt(document.lineCount - 1);
        const range = new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);
        return [vscode.TextEdit.replace(range, formatted)];
    }
    provideDocumentRangeFormattingEdits(document, range) {
        const original = document.getText(range);
        const formatted = formatC(original);
        return formatted === original ? [] : [vscode.TextEdit.replace(range, formatted)];
    }
}
exports.CFormatter = CFormatter;
//# sourceMappingURL=cFormatter.js.map