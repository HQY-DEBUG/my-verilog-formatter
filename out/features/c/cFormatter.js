"use strict";
// =========================================================================
// 文件    : cFormatter.ts
// 描述    : clang-format 通用排版与 C/C++ 定制多列对齐
// 版本    : v1.6.0
// 日期    : 2026/09/22
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.6.0  2026/09/22  通用排版交给 clang-format，保护宏续行并保留定制对齐
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
const clangFormat_1 = require("./clangFormat");
const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch']);
const NON_TYPE_KEYWORDS = new Set([
    'break', 'case', 'continue', 'delete', 'else', 'goto', 'new', 'return', 'throw', 'using',
]);
const C_LITERALS_AND_COMMENTS = /R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[^\r\n]|[^'\\\r\n])+'|\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*/g;
/** 仅应用明确约定的多列对齐；通用空格、缩进和换行由 clang-format 完成。 */
function formatC(code, range) {
    const eol = code.includes('\r\n') ? '\r\n' : '\n';
    const protectedRegions = protectCLayoutRegions(code.replace(/\r\n/g, '\n'));
    const lines = protectedRegions.code.split('\n');
    const start = range ? range.start - 1 : 0;
    const end = range ? range.end : lines.length;
    let normalized = lines.slice(start, end).join('\n');
    normalized = alignMacroDefines(normalized);
    normalized = alignVariableDeclarations(normalized);
    normalized = alignAssignments(normalized);
    normalized = alignConsecutiveCalls(normalized);
    normalized = alignEnumDeclarations(normalized);
    normalized = [...lines.slice(0, start), ...normalized.split('\n').map(line => line.trimEnd()), ...lines.slice(end)]
        .map(line => protectedRegions.blocks.get(line) ?? line).join('\n');
    return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}
function protectCLayoutRegions(code) {
    const lines = code.split('\n');
    const maskedLines = maskCLiteralsAndComments(code).split('\n');
    const blocks = new Map();
    const result = [];
    const protectedLines = new Set();
    let markerPrefix = '__C_FORMATTER_DIRECTIVE_';
    while (code.includes(markerPrefix)) {
        markerPrefix += '_';
    }
    let offset = 0;
    let tokenLine = 0;
    let disabledStart;
    for (const match of code.matchAll(C_LITERALS_AND_COMMENTS)) {
        tokenLine += code.slice(offset, match.index).split('\n').length - 1;
        const endLine = tokenLine + match[0].split('\n').length - 1;
        if (endLine > tokenLine) {
            for (let line = tokenLine; line <= endLine; line++) {
                protectedLines.add(line);
            }
        }
        if (/^(?:\/\/|\/\*)\s*clang-format off\b/.test(match[0])) {
            disabledStart ?? (disabledStart = tokenLine);
        }
        else if (/^(?:\/\/|\/\*)\s*clang-format on\b/.test(match[0]) && disabledStart !== undefined) {
            for (let line = disabledStart; line <= endLine; line++) {
                protectedLines.add(line);
            }
            disabledStart = undefined;
        }
        offset = match.index + match[0].length;
        tokenLine = endLine;
    }
    if (disabledStart !== undefined) {
        for (let line = disabledStart; line < lines.length; line++) {
            protectedLines.add(line);
        }
    }
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*#/.test(maskedLines[i]) || !lines[i].trimEnd().endsWith('\\')) {
            continue;
        }
        do {
            protectedLines.add(i);
        } while (lines[i].trimEnd().endsWith('\\') && ++i < lines.length);
    }
    for (let i = 0; i < lines.length; i++) {
        if (protectedLines.has(i)) {
            // 每个受保护物理行占用一行，保留选区行号和对齐分组边界。
            const marker = `# /* ${markerPrefix}${i} */`;
            blocks.set(marker, lines[i]);
            result.push(marker);
        }
        else {
            result.push(lines[i]);
        }
    }
    return { code: result.join('\n'), blocks };
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
    constructor(clang = clangFormat_1.runClangFormat) {
        this.clang = clang;
    }
    async provideDocumentFormattingEdits(document) {
        return this.formatDocument(document);
    }
    async provideDocumentRangeFormattingEdits(document, range) {
        return this.formatDocument(document, {
            start: range.start.line + 1,
            end: range.end.line + (range.end.character === 0 && range.end.line > range.start.line ? 0 : 1),
        });
    }
    async formatDocument(document, range) {
        const version = document.version;
        const original = document.getText();
        const filename = document.fileName || (document.languageId === 'c' ? 'untitled.c' : 'untitled.cpp');
        const base = await this.clang(original, filename, range);
        const formatted = formatC(base, range ? affectedLineRange(original, base, range) : undefined);
        if (formatted === original || document.version !== version) {
            return [];
        }
        const lastLine = document.lineAt(document.lineCount - 1);
        const fullRange = new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
}
exports.CFormatter = CFormatter;
function affectedLineRange(original, formatted, range) {
    const before = original.split(/\r?\n/);
    const after = formatted.split(/\r?\n/);
    let start = 0;
    while (start < range.start - 1 && before[start] === after[start]) {
        start++;
    }
    let suffix = 0;
    while (suffix < before.length - range.end && suffix < after.length - start
        && before[before.length - suffix - 1] === after[after.length - suffix - 1]) {
        suffix++;
    }
    // clang-format 可以扩展到完整语句；定制对齐只覆盖实际影响区域及原选区。
    return { start: start + 1, end: after.length - suffix };
}
//# sourceMappingURL=cFormatter.js.map