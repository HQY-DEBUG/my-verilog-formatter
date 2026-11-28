"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alignMatlabPlotCalls = alignMatlabPlotCalls;
const matlabDisplayWidth_1 = require("./matlabDisplayWidth");
function scanLine(line, delimiters, capturePlot) {
    const startsWithQuotedCommand = delimiters.length === 0 && /^[ \t]*[A-Za-z]\w*[ \t]+'/.test(line);
    const commas = [];
    let closingParen = -1;
    let continues = false;
    let ambiguous = false;
    let previousToken = '';
    let quote = '';
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quote) {
            if (char === quote && line[index + 1] === quote) {
                index++;
            }
            else if (char === quote) {
                previousToken = quote;
                quote = '';
            }
            continue;
        }
        if (char === ' ' || char === '\t') {
            continue;
        }
        if (char === '%') {
            break;
        }
        if (line.startsWith('...', index)) {
            continues = true;
            break;
        }
        const expectedDelimiter = delimiters[delimiters.length - 1];
        if (char === '"') {
            quote = char;
        }
        else if (char === "'") {
            const afterOperator = !previousToken || '([{,;=:+-*/\\^&|~<>'.includes(previousToken);
            const afterSpace = (startsWithQuotedCommand || expectedDelimiter === ']' || expectedDelimiter === '}')
                && /[ \t]/.test(line[index - 1] ?? '');
            if (afterOperator || afterSpace) {
                quote = char;
            }
            else {
                // An apostrophe after an operand can be a transpose operator.
                ambiguous = true;
            }
        }
        else if ('([{'.includes(char)) {
            delimiters.push(')]}'['([{'.indexOf(char)]);
        }
        else if (')]}'.includes(char)) {
            if (expectedDelimiter !== char) {
                delimiters.length = 0;
                ambiguous = true;
            }
            else {
                delimiters.pop();
                if (capturePlot && closingParen < 0 && delimiters.length === 0) {
                    closingParen = index;
                }
            }
        }
        else if (char === ',' && capturePlot && closingParen < 0 && delimiters.length === 1) {
            commas.push(index);
        }
        previousToken = char;
    }
    return { commas, closingParen, continues, ambiguous: ambiguous || Boolean(quote) };
}
function readPlotCalls(lines) {
    const delimiters = [];
    let continued = false;
    let inComment = false;
    return lines.map(line => {
        const trimmed = line.trim();
        if (trimmed === '%{') {
            inComment = true;
        }
        if (inComment) {
            if (trimmed === '%}') {
                inComment = false;
            }
            return undefined;
        }
        const prefix = !continued && delimiters.length === 0 ? /^([ \t]*)plot\(/.exec(line) : null;
        const { commas, closingParen, continues, ambiguous } = scanLine(line, delimiters, prefix !== null);
        continued = continues || (continued && (trimmed === '' || trimmed.startsWith('%')));
        if (!prefix || continued || ambiguous || closingParen < 0 || commas.length === 0) {
            return undefined;
        }
        const suffix = line.slice(closingParen + 1);
        if (!/^[ \t]*;?[ \t]*(?:%.*)?$/.test(suffix)) {
            return undefined;
        }
        let start = prefix[0].length;
        const args = [...commas, closingParen].map(end => {
            const argument = line.slice(start, end).trim();
            start = end + 1;
            return argument;
        });
        if (args.some(argument => argument === '' || argument.includes('\t'))) {
            return undefined;
        }
        return { indent: prefix[1], arguments: args, suffix };
    });
}
function alignMatlabPlotCalls(code) {
    const lines = code.split('\n');
    const calls = readPlotCalls(lines);
    for (let start = 0; start < calls.length;) {
        const first = calls[start];
        if (!first) {
            start++;
            continue;
        }
        const group = [first];
        for (let index = start + 1; index < calls.length; index++) {
            const call = calls[index];
            if (call?.indent !== first.indent || call.arguments.length !== first.arguments.length) {
                break;
            }
            group.push(call);
        }
        if (group.length > 1) {
            const widths = first.arguments.slice(0, -1).map(() => 0);
            for (const call of group) {
                widths.forEach((width, index) => {
                    widths[index] = Math.max(width, (0, matlabDisplayWidth_1.matlabDisplayWidth)(call.arguments[index]));
                });
            }
            group.forEach((call, lineIndex) => {
                const args = call.arguments.map((argument, index) => {
                    if (index === widths.length) {
                        return argument;
                    }
                    return argument + ' '.repeat(widths[index] - (0, matlabDisplayWidth_1.matlabDisplayWidth)(argument));
                });
                lines[start + lineIndex] = `${call.indent}plot(${args.join(', ')})${call.suffix}`;
            });
        }
        start += group.length;
    }
    return lines.join('\n');
}
//# sourceMappingURL=matlabPlotAlignment.js.map