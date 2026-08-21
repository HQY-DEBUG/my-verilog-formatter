// =========================================================================
// 文件    : cFormatter.ts
// 描述    : C/C++ 变量定义、函数调用和函数花括号格式化
// 版本    : v1.1.0
// 日期    : 2026/08/21
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.1.0  2026/08/21  创建文件
// =========================================================================

import * as vscode from 'vscode';

interface DeclarationLine {
    typePrefix: string;
    pointer: string;
    name: string;
    suffix: string;
}

const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch']);
const NON_TYPE_KEYWORDS = new Set([
    'break', 'case', 'continue', 'delete', 'else', 'goto', 'new', 'return', 'throw', 'using',
]);

/** 格式化 C/C++ 源码中明确要求统一的布局，不改写表达式语义。 */
export function formatC(code: string): string {
    const eol = code.includes('\r\n') ? '\r\n' : '\n';
    let normalized = code.replace(/\r\n/g, '\n');
    normalized = collapseMultilineCalls(normalized);
    normalized = placeFunctionOpeningBraces(normalized);
    normalized = alignVariableDeclarations(normalized);
    normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');
    return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}

function collapseMultilineCalls(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];

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
            containsComment ||= hasComment(lines[end]);
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

function isCallStart(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || hasComment(line)) { return false; }

    const directCall = trimmed.match(/^([A-Za-z_]\w*)\s*\(/);
    if (directCall) {
        if (!CONTROL_KEYWORDS.has(directCall[1])) { return true; }
        const condition = trimmed.slice(directCall[0].length);
        return /(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)*[A-Za-z_]\w*\s*\(/.test(condition);
    }

    if (/^(?:return|throw|co_return)\b/.test(trimmed) || /=/.test(trimmed)) {
        return /(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)*[A-Za-z_]\w*\s*\(/.test(trimmed);
    }

    return /^(?:[A-Za-z_]\w*\s*(?:::|\.|->)\s*)+[A-Za-z_]\w*\s*\(/.test(trimmed);
}

function isCallTerminator(line: string): boolean {
    return /\)\s*[;,]?\s*$/.test(line.trim());
}

function isControlStatement(line: string): boolean {
    const firstWord = line.trim().match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    return CONTROL_KEYWORDS.has(firstWord);
}

function isFunctionBodyFollowing(lines: string[], end: number): boolean {
    for (let i = end + 1; i < lines.length; i++) {
        if (!lines[i].trim()) { continue; }
        return /^\s*\{\s*$/.test(lines[i]);
    }
    return false;
}

function hasComment(line: string): boolean {
    return line.includes('//') || line.includes('/*') || line.includes('*/');
}

function parenthesisDelta(line: string): number {
    let delta = 0;
    let quote = '';
    let escaped = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1] ?? '';
        if (!quote && char === '/' && (next === '/' || next === '*')) { break; }
        if (quote) {
            if (escaped) { escaped = false; }
            else if (char === '\\') { escaped = true; }
            else if (char === quote) { quote = ''; }
            continue;
        }
        if (char === '"' || char === "'") { quote = char; }
        else if (char === '(') { delta++; }
        else if (char === ')') { delta--; }
    }

    return delta;
}

function placeFunctionOpeningBraces(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        if (!/^\s*\{\s*$/.test(line)) {
            result.push(line);
            continue;
        }

        let previous = result.length - 1;
        while (previous >= 0 && result[previous].trim() === '') { previous--; }
        if (previous < 0 || !isFunctionSignature(result, previous)) {
            result.push(line);
            continue;
        }

        result.splice(previous + 1);
        result[previous] = `${result[previous].trimEnd()} {`;
    }

    return result.join('\n');
}

function isFunctionSignature(lines: string[], end: number): boolean {
    let start = end;
    let balance = parenthesisDelta(lines[end]);
    while (start > 0 && balance < 0) {
        start--;
        balance += parenthesisDelta(lines[start]);
    }

    const signature = lines.slice(start, end + 1).map(line => line.trim()).join(' ');
    const firstWord = signature.match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    if (CONTROL_KEYWORDS.has(firstWord) || /^(?:else|do)\b/.test(signature)) { return false; }

    const open = signature.indexOf('(');
    if (open < 0 || signature.includes(';') || signature.slice(0, open).includes('=')) { return false; }
    return /(?:[A-Za-z_]\w*\s+|[*&:]\s*)+[~A-Za-z_]\w*(?:::\w+)*\s*\(/.test(signature)
        || /(?:^|\s)[A-Za-z_]\w*::[~A-Za-z_]\w*\s*\(/.test(signature);
}

function alignVariableDeclarations(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length;) {
        const first = parseDeclaration(lines[i]);
        if (!first) {
            result.push(lines[i++]);
            continue;
        }

        const block: DeclarationLine[] = [first];
        let end = i + 1;
        while (end < lines.length) {
            const parsed = parseDeclaration(lines[end]);
            if (!parsed) { break; }
            block.push(parsed);
            end++;
        }

        if (block.length === 1) {
            result.push(lines[i]);
        } else {
            const maxType = Math.max(...block.map(item => item.typePrefix.length));
            result.push(...block.map(item =>
                `${item.typePrefix.padEnd(maxType + 1)}${item.pointer}${item.name}${item.suffix}`,
            ));
        }
        i = end;
    }

    return result.join('\n');
}

function parseDeclaration(line: string): DeclarationLine | undefined {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || !trimmed.endsWith(';')) {
        return undefined;
    }
    if (trimmed.includes('(') || trimmed.includes(',') || /^(?:typedef|using)\b/.test(trimmed)) {
        return undefined;
    }

    const commentIndex = line.indexOf('//');
    const comment = commentIndex >= 0 ? line.slice(commentIndex) : '';
    const statement = (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trimEnd();
    const semicolon = statement.lastIndexOf(';');
    if (semicolon < 0) { return undefined; }

    const body = statement.slice(0, semicolon);
    const equal = body.search(/(?<![=!<>])=(?!=)/);
    const declarator = (equal >= 0 ? body.slice(0, equal) : body).trimEnd();
    const initializer = equal >= 0 ? body.slice(equal).trimStart() : '';
    const match = declarator.match(/^(\s*)(.*?)([A-Za-z_]\w*)(\s*(?:\[[^\]]*\]\s*)*)$/);
    if (!match) { return undefined; }

    const declaratorPrefix = match[2].trimEnd();
    const pointerMatch = declaratorPrefix.match(/^(.*?)([*&]+)\s*$/);
    const typePart = (pointerMatch?.[1] ?? declaratorPrefix).trimEnd();
    const pointer = pointerMatch?.[2] ?? '';
    const firstWord = typePart.trim().match(/^([A-Za-z_]\w*)/)?.[1] ?? '';
    if (!typePart || NON_TYPE_KEYWORDS.has(firstWord) || !/[\s*&]$/.test(match[2])) { return undefined; }

    const suffix = `${match[4]}${initializer ? ` ${initializer}` : ''};${comment ? ` ${comment}` : ''}`;
    return {
        typePrefix: match[1] + typePart,
        pointer,
        name: match[3],
        suffix,
    };
}

export class CFormatter implements
        vscode.DocumentFormattingEditProvider,
        vscode.DocumentRangeFormattingEditProvider {

    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const original = document.getText();
        const formatted = formatC(original);
        if (formatted === original) { return []; }

        const lastLine = document.lineAt(document.lineCount - 1);
        const range = new vscode.Range(new vscode.Position(0, 0), lastLine.range.end);
        return [vscode.TextEdit.replace(range, formatted)];
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
    ): vscode.TextEdit[] {
        const original = document.getText(range);
        const formatted = formatC(original);
        return formatted === original ? [] : [vscode.TextEdit.replace(range, formatted)];
    }
}
