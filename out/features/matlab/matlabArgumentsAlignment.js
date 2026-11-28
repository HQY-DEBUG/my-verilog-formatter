"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alignMatlabArgumentDeclarations = alignMatlabArgumentDeclarations;
const matlabDisplayWidth_1 = require("./matlabDisplayWidth");
const ARGUMENTS_HEADER = /^([ \t]*)arguments(?:[ \t]*\([ \t]*(?:(?:Input|Output)(?:[ \t]*,[ \t]*Repeating)?|Repeating)[ \t]*\))?[ \t]*(?:%.*)?$/;
const ARGUMENTS_END = /^([ \t]*)end[ \t]*;?[ \t]*(?:%.*)?$/;
const QUALIFIED_NAME = /^[A-Za-z]\w*(?:\.[A-Za-z]\w*)*/;
const DIMENSIONS = /^\([ \t]*(?:\d+|:)(?:[ \t]*,[ \t]*(?:\d+|:))*[ \t]*\)$/;
const SIGNIFICANT_TOKEN = /'(?:''|[^'])*'|"(?:""|[^"])*"|\.\.\.|[()[\]{}'"%;,]/g;
function scanDeclaration(line, open) {
    const groups = new Map();
    let commentOffset = line.length;
    let continued = false;
    let malformed = false;
    const tokens = new RegExp(SIGNIFICANT_TOKEN);
    let match;
    while ((match = tokens.exec(line))) {
        const { 0: token, index } = match;
        if (token === '%') {
            commentOffset = index;
            break;
        }
        if (token === '...') {
            continued = true;
            break;
        }
        if (token[0] === "'" || token[0] === '"') {
            if (token.length === 1) {
                malformed = true;
            }
            else if (token[0] === "'") {
                const previous = line.slice(0, index).trimEnd().slice(-1);
                const inArray = /[ \t]/.test(line[index - 1] ?? '')
                    && (open[open.length - 1]?.closing === ']' || open[open.length - 1]?.closing === '}');
                // A quote after an operand can be a transpose rather than the start of a string.
                if (previous && !'([{,;=:+-*/\\^&|~<>'.includes(previous) && !inArray) {
                    malformed = true;
                    tokens.lastIndex = index + 1;
                }
            }
            continue;
        }
        const opening = '([{'.indexOf(token);
        if (opening !== -1) {
            open.push({ offset: index, closing: ')]}'[opening] });
        }
        else if (')]}'.includes(token)) {
            const group = open.pop();
            if (group?.closing !== token) {
                open.length = 0;
                malformed = true;
            }
            else {
                groups.set(group.offset, index + 1);
            }
        }
        else if (open.length === 0) {
            // A delimiter at the statement level is outside this declaration's field grammar.
            malformed = true;
        }
    }
    return { groups, commentOffset, continued, malformed };
}
function readDeclaration(line, scan) {
    const indent = /^[ \t]*/.exec(line)[0];
    const statement = line.slice(indent.length, scan.commentOffset).trimEnd();
    const name = QUALIFIED_NAME.exec(statement)?.[0];
    if (!name) {
        return undefined;
    }
    let rest = statement.slice(name.length).trimStart();
    function readGroup(opening) {
        if (!rest.startsWith(opening)) {
            return '';
        }
        const groupStart = indent.length + statement.length - rest.length;
        const groupEnd = scan.groups.get(groupStart);
        if (groupEnd === undefined) {
            return '';
        }
        const field = line.slice(groupStart, groupEnd);
        rest = rest.slice(field.length).trimStart();
        return field;
    }
    const dimensions = readGroup('(');
    if (dimensions && !DIMENSIONS.test(dimensions)) {
        return undefined;
    }
    const type = QUALIFIED_NAME.exec(rest)?.[0] ?? '';
    rest = rest.slice(type.length).trimStart();
    const validators = readGroup('{');
    if (validators && !/^\{\s*[A-Za-z]/.test(validators)) {
        return undefined;
    }
    let defaultValue = '';
    if (rest) {
        const expression = rest.slice(1).trimStart();
        if (!rest.startsWith('=') || !expression || expression.startsWith('=')) {
            return undefined;
        }
        defaultValue = `= ${expression}`;
    }
    const comment = line.slice(scan.commentOffset);
    const fields = [name, dimensions, type, validators, defaultValue, comment];
    if (fields.slice(0, -1).some(field => field.includes('\t'))) {
        return undefined;
    }
    return { indent, fields };
}
function writeGroup(lines, start, declarations) {
    if (declarations.length < 2) {
        return;
    }
    const widths = Array(declarations[0].fields.length).fill(0);
    for (const declaration of declarations) {
        declaration.fields.forEach((field, index) => {
            widths[index] = Math.max(widths[index], (0, matlabDisplayWidth_1.matlabDisplayWidth)(field));
        });
    }
    declarations.forEach(({ indent, fields }, lineIndex) => {
        let text = '';
        let column = 0;
        let end = 0;
        fields.forEach((field, index) => {
            if (field) {
                text += ' '.repeat(column - end) + field;
                end = column + (0, matlabDisplayWidth_1.matlabDisplayWidth)(field);
            }
            if (widths[index] > 0) {
                column += widths[index] + 1;
            }
        });
        lines[start + lineIndex] = indent + text;
    });
}
function alignMatlabArgumentDeclarations(code) {
    const lines = code.split('\n');
    const open = [];
    let blockIndent;
    let inComment = false;
    let continued = false;
    let group = [];
    let groupStart = 0;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const trimmed = line.trim();
        const isComment = trimmed.startsWith('%');
        let declaration;
        if (trimmed === '%{') {
            inComment = true;
        }
        if (inComment) {
            if (trimmed === '%}') {
                inComment = false;
            }
        }
        else if (blockIndent === undefined) {
            blockIndent = ARGUMENTS_HEADER.exec(line)?.[1];
        }
        else if (ARGUMENTS_END.exec(line)?.[1] === blockIndent) {
            blockIndent = undefined;
            open.length = 0;
            continued = false;
        }
        else if (!isComment && trimmed && !continued && open.length === 0
            && line.length - line.trimStart().length <= blockIndent.length) {
            // A dedent bounds an incomplete block.
            blockIndent = ARGUMENTS_HEADER.exec(line)?.[1];
        }
        else if (!isComment && trimmed) {
            const startsInsideExpression = continued || open.length > 0;
            const scan = scanDeclaration(line, open);
            continued = scan.continued;
            if (!startsInsideExpression && !continued && !scan.malformed && open.length === 0) {
                declaration = readDeclaration(line, scan);
            }
        }
        if (!declaration || declaration.indent !== group[0]?.indent) {
            writeGroup(lines, groupStart, group);
            group = [];
            groupStart = index;
        }
        if (declaration) {
            group.push(declaration);
        }
    }
    writeGroup(lines, groupStart, group);
    return lines.join('\n');
}
//# sourceMappingURL=matlabArgumentsAlignment.js.map