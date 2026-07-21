import * as vscode from 'vscode';

interface AdcAttribute {
    name: string;
    value: string;
}

interface AdcAssignment {
    command: string;
    target: string;
    attributes: AdcAttribute[];
    comment: string;
}

function parseAssignment(line: string): AdcAssignment | null {
    const match = line.match(
        /^\s*(set_pin_assignment)\s*\{\s*([^{}]*?)\s*\}\s*\{\s*(.*?)\s*\}\s*(#.*)?$/i,
    );
    if (!match) { return null; }

    const attributes: AdcAttribute[] = [];
    const attributePattern = /([^;=]+?)\s*=\s*([^;]*?)\s*;/g;
    let attributeMatch: RegExpExecArray | null;
    let parsedLength = 0;

    while ((attributeMatch = attributePattern.exec(match[3])) !== null) {
        if (match[3].slice(parsedLength, attributeMatch.index).trim() !== '') { return null; }
        attributes.push({
            name: attributeMatch[1].trim(),
            value: attributeMatch[2].trim(),
        });
        parsedLength = attributePattern.lastIndex;
    }

    if (attributes.length === 0 || match[3].slice(parsedLength).trim() !== '') { return null; }

    return {
        command: match[1],
        target: match[2].trim(),
        attributes,
        comment: match[4]?.trim() ?? '',
    };
}

function formatAttribute(attribute: AdcAttribute): string {
    return `${attribute.name} = ${attribute.value};`;
}

export function formatAdc(code: string): string {
    const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const assignments = lines.map(parseAssignment);
    const parsed = assignments.filter((item): item is AdcAssignment => item !== null);
    if (parsed.length === 0) {
        return lines.map(line => line.trimEnd()).join('\n');
    }

    const commandWidth = Math.max(...parsed.map(item => item.command.length));
    const targetWidth = Math.max(...parsed.map(item => item.target.length));
    const attributeWidths: number[] = [];

    for (const item of parsed) {
        item.attributes.forEach((attribute, index) => {
            attributeWidths[index] = Math.max(
                attributeWidths[index] ?? 0,
                formatAttribute(attribute).length,
            );
        });
    }

    return lines.map((line, index) => {
        const item = assignments[index];
        if (!item) { return line.trimEnd(); }

        const attributes = item.attributes.map((attribute, attributeIndex) => {
            const text = formatAttribute(attribute);
            const isLast = attributeIndex === item.attributes.length - 1;
            return isLast ? text : text.padEnd(attributeWidths[attributeIndex]);
        }).join(' ');
        const comment = item.comment === '' ? '' : ` ${item.comment}`;

        return `${item.command.padEnd(commandWidth)} { ${item.target.padEnd(targetWidth)} } { ${attributes} }${comment}`;
    }).join('\n');
}

export class AdcFormatter
    implements
        vscode.DocumentFormattingEditProvider,
        vscode.DocumentRangeFormattingEditProvider
{
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const original = document.getText();
        const formatted = formatAdc(original);
        if (formatted === original) { return []; }

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(original.length),
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
    ): vscode.TextEdit[] {
        const original = document.getText(range);
        const formatted = formatAdc(original);
        if (formatted === original) { return []; }
        return [vscode.TextEdit.replace(range, formatted)];
    }
}
