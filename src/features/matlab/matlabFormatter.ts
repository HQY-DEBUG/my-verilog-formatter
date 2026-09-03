import * as vscode from 'vscode';

interface MatlabAssignmentLine {
    indent: string;
    name: string;
    value: string;
    semicolon: boolean;
    comment: string;
}

interface MatlabBlock {
    kind: string;
    hasCase: boolean;
}

const BLOCK_START = /^(?:function|if|for|parfor|while|switch|try|classdef|properties|methods|events|enumeration|arguments|spmd)\b/i;
const BRANCH_KEYWORD = /^(?:else|elseif|case|otherwise|catch)\b/i;

/** 按 MATLAB 块结构使用四空格缩进，并对齐连续简单赋值语句。 */
export function formatMatlab(code: string): string {
    const eol = code.includes('\r\n') ? '\r\n' : '\n';
    let normalized = code.replace(/\r\n/g, '\n');
    normalized = reindentMatlabBlocks(normalized);
    normalized = alignMatlabAssignments(normalized);
    normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');
    return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}

function reindentMatlabBlocks(code: string): string {
    const result: string[] = [];
    const blocks: MatlabBlock[] = [];
    let depth = 0;

    for (const line of code.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            result.push('');
            continue;
        }

        const statement = stripMatlabComment(trimmed).trim();
        if (isBlockEnd(statement)) {
            const block = blocks.pop();
            depth = Math.max(0, depth - (block?.kind === 'switch' && block.hasCase ? 2 : 1));
            result.push(' '.repeat(depth * 4) + trimmed);
            continue;
        }

        if (/^(?:case|otherwise)\b/i.test(statement)) {
            const switchBlock = [...blocks].reverse().find(block => block.kind === 'switch');
            if (switchBlock?.hasCase) {
                depth = Math.max(0, depth - 1);
            }
            result.push(' '.repeat(depth * 4) + trimmed);
            if (switchBlock) {
                switchBlock.hasCase = true;
                depth++;
            }
            continue;
        }

        if (BRANCH_KEYWORD.test(statement)) {
            depth = Math.max(0, depth - 1);
            result.push(' '.repeat(depth * 4) + trimmed);
            depth++;
            continue;
        }

        result.push(' '.repeat(depth * 4) + trimmed);
        if (BLOCK_START.test(statement)) {
            const kind = statement.match(/^\w+/)?.[0].toLowerCase() ?? '';
            blocks.push({ kind, hasCase: false });
            depth++;
        }
    }

    return result.join('\n');
}

function isBlockEnd(statement: string): boolean {
    return /^end\s*$/i.test(statement);
}

function alignMatlabAssignments(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length;) {
        const first = parseMatlabAssignment(lines[i]);
        if (!first) {
            result.push(normalizeMatlabExecutionAssignment(lines[i]) ?? lines[i]);
            i++;
            continue;
        }

        const block: MatlabAssignmentLine[] = [first];
        let end = i + 1;
        while (end < lines.length) {
            const next = parseMatlabAssignment(lines[end]);
            if (next) {
                if (next.indent !== first.indent) { break; }
                block.push(next);
            } else if (!isMatlabConfigurationSeparator(lines[end])) {
                break;
            }
            end++;
        }

        if (block.length === 1) {
            result.push(formatMatlabAssignment(block[0]), ...lines.slice(i + 1, end));
        } else {
            const maxName = Math.max(...block.map(item => item.name.length));
            const maxValue = Math.max(...block.map(item => item.value.length));
            const statements = block.map(item => (
                `${item.name.padEnd(maxName)} = ${item.value.padEnd(maxValue)}${item.semicolon ? ';' : ''}`
            ));
            const maxStatement = Math.max(...statements.map(statement => statement.length));
            let blockIndex = 0;
            for (let lineIndex = i; lineIndex < end; lineIndex++) {
                const item = parseMatlabAssignment(lines[lineIndex]);
                if (!item) {
                    result.push(lines[lineIndex]);
                    continue;
                }
                const comment = item.comment ? ` ${item.comment}` : '';
                result.push(`${item.indent}${statements[blockIndex].padEnd(maxStatement)}${comment}`);
                blockIndex++;
            }
        }
        i = end;
    }

    return result.join('\n');
}

function isMatlabConfigurationSeparator(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) { return true; }
    if (trimmed.startsWith('%%')) { return false; }
    return !stripMatlabComment(trimmed).trim();
}

function formatMatlabAssignment(item: MatlabAssignmentLine): string {
    const comment = item.comment ? ` ${item.comment}` : '';
    return `${item.indent}${item.name} = ${item.value}${item.semicolon ? ';' : ''}${comment}`;
}

function normalizeMatlabExecutionAssignment(line: string): string | undefined {
    const commentIndex = findMatlabCommentIndex(line);
    const comment = commentIndex >= 0 ? line.slice(commentIndex).trim() : '';
    const statement = (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trimEnd();
    const match = statement.match(/^(\s*)([A-Za-z]\w*(?:\s*\.\s*[A-Za-z]\w*)*)\s*=\s*(?!=)(.*?)\s*$/);
    if (!match || isMatlabConfigurationLiteral(match[3])) { return undefined; }

    const name = match[2].replace(/\s*\.\s*/g, '.');
    const suffix = comment ? ` ${comment}` : '';
    return `${match[1]}${name} = ${normalizeMatlabValue(match[3])}${suffix}`;
}

function parseMatlabAssignment(line: string): MatlabAssignmentLine | undefined {
    const commentIndex = findMatlabCommentIndex(line);
    const comment = commentIndex >= 0 ? line.slice(commentIndex).trim() : '';
    const statement = (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trimEnd();
    const match = statement.match(/^(\s*)([A-Za-z]\w*(?:\s*\.\s*[A-Za-z]\w*)*)\s*=\s*(?!=)(.*?)\s*$/);
    if (!match || !match[3] || !isMatlabConfigurationLiteral(match[3])) { return undefined; }

    const rawValue = normalizeMatlabValue(match[3]);
    const semicolon = rawValue.endsWith(';');
    const value = (semicolon ? rawValue.slice(0, -1) : rawValue).trimEnd();
    if (!value) { return undefined; }

    return {
        indent: match[1],
        name: match[2].replace(/\s*\.\s*/g, '.'),
        value,
        semicolon,
        comment,
    };
}

function normalizeMatlabValue(value: string): string {
    return value.trimEnd().replace(/\s*;$/, ';');
}

function isMatlabConfigurationLiteral(value: string): boolean {
    const literal = value.trim().replace(/;$/, '').trimEnd();
    return /^(?:true|false|nan|inf|pi)$/i.test(literal)
        || /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][-+]?\d+)?[ij]?$/i.test(literal)
        || /^'(?:''|[^'])*'$/.test(literal)
        || /^"(?:""|[^"])*"$/.test(literal)
        || /^(?:\[\s*\]|\{\s*\})$/.test(literal)
        || /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][-+]?\d+)?\s*:\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][-+]?\d+)?(?:\s*:\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][-+]?\d+)?)?$/.test(literal);
}

function stripMatlabComment(line: string): string {
    const commentIndex = findMatlabCommentIndex(line);
    return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function findMatlabCommentIndex(line: string): number {
    let quote = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quote) {
            if (char === quote && line[i + 1] === quote) {
                i++;
            } else if (char === quote) {
                quote = '';
            }
            continue;
        }
        if (char === '\'' || char === '"') {
            quote = char;
        } else if (char === '%') {
            return i;
        }
    }

    return -1;
}

export class MatlabFormatter implements
        vscode.DocumentFormattingEditProvider,
        vscode.DocumentRangeFormattingEditProvider {

    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const original = document.getText();
        const formatted = formatMatlab(original);
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
        const formatted = formatMatlab(original);
        return formatted === original ? [] : [vscode.TextEdit.replace(range, formatted)];
    }
}
