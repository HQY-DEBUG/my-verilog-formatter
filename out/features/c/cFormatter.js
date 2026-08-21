"use strict";
// =========================================================================
// 文件    : cFormatter.ts
// 描述    : C/C++ 变量定义、函数调用和函数花括号格式化
// 版本    : v1.3.0
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
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
/** 格式化 C/C++ 源码中明确要求统一的布局，不改写表达式语义。 */
function formatC(code) {
    const eol = code.includes('\r\n') ? '\r\n' : '\n';
    let normalized = code.replace(/\r\n/g, '\n');
    normalized = collapseMultilineCalls(normalized);
    normalized = placeFunctionOpeningBraces(normalized);
    normalized = alignVariableDeclarations(normalized);
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
        const callLines = lines.slice(i, end + 1).map(line => line.trim());
        const joined = callLines.slice(1).reduce((current, next) => {
            const separator = current.endsWith('(') || /^[),;]/.test(next) ? '' : ' ';
            return current + separator + next;
        }, callLines[0]);
        result.push(indent + joined);
        i = end;
    }
    return result.join('\n');
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
function isFunctionSignature(lines, end) {
    let start = end;
    let balance = parenthesisDelta(lines[end]);
    while (start > 0 && balance < 0) {
        start--;
        balance += parenthesisDelta(lines[start]);
    }
    const signature = lines.slice(start, end + 1).map(line => line.trim()).join(' ');
    const firstWord = signature.match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    if (CONTROL_KEYWORDS.has(firstWord) || /^(?:else|do)\b/.test(signature)) {
        return false;
    }
    const open = signature.indexOf('(');
    if (open < 0 || signature.includes(';') || signature.slice(0, open).includes('=')) {
        return false;
    }
    return /(?:[A-Za-z_]\w*\s+|[*&:]\s*)+[~A-Za-z_]\w*(?:::\w+)*\s*\(/.test(signature)
        || /(?:^|\s)[A-Za-z_]\w*::[~A-Za-z_]\w*\s*\(/.test(signature);
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
            const alignAsFields = block.every(item => !item.initializer);
            if (alignAsFields) {
                const declarations = block.map(item => `${item.pointer}${item.name}${item.arraySuffix}`);
                const maxDeclaration = Math.max(...declarations.map(item => item.length));
                result.push(...block.map((item, index) => {
                    const declaration = declarations[index].padEnd(maxDeclaration + 1);
                    const comment = item.comment ? `  ${item.comment}` : '';
                    return `${item.typePrefix.padEnd(maxType + 1)}${declaration};${comment}`;
                }));
            }
            else {
                result.push(...block.map(item => {
                    const declaration = `${item.pointer}${item.name}${item.arraySuffix}`;
                    const initializer = item.initializer ? ` ${item.initializer}` : '';
                    const comment = item.comment ? ` ${item.comment}` : '';
                    return `${item.typePrefix.padEnd(maxType + 1)}${declaration}${initializer};${comment}`;
                }));
            }
        }
        i = end;
    }
    return result.join('\n');
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
    const initializer = equal >= 0 ? body.slice(equal).trimStart() : '';
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