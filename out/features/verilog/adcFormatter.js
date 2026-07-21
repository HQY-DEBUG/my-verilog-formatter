"use strict";
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
exports.AdcFormatter = void 0;
exports.formatAdc = formatAdc;
const vscode = __importStar(require("vscode"));
function parseAssignment(line) {
    const match = line.match(/^\s*(set_pin_assignment)\s*\{\s*([^{}]*?)\s*\}\s*\{\s*(.*?)\s*\}\s*(#.*)?$/i);
    if (!match) {
        return null;
    }
    const attributes = [];
    const attributePattern = /([^;=]+?)\s*=\s*([^;]*?)\s*;/g;
    let attributeMatch;
    let parsedLength = 0;
    while ((attributeMatch = attributePattern.exec(match[3])) !== null) {
        if (match[3].slice(parsedLength, attributeMatch.index).trim() !== '') {
            return null;
        }
        attributes.push({
            name: attributeMatch[1].trim(),
            value: attributeMatch[2].trim(),
        });
        parsedLength = attributePattern.lastIndex;
    }
    if (attributes.length === 0 || match[3].slice(parsedLength).trim() !== '') {
        return null;
    }
    return {
        command: match[1],
        target: match[2].trim(),
        attributes,
        comment: match[4]?.trim() ?? '',
    };
}
function formatAttribute(attribute) {
    return `${attribute.name} = ${attribute.value};`;
}
function formatAdc(code) {
    const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const assignments = lines.map(parseAssignment);
    const parsed = assignments.filter((item) => item !== null);
    if (parsed.length === 0) {
        return lines.map(line => line.trimEnd()).join('\n');
    }
    const commandWidth = Math.max(...parsed.map(item => item.command.length));
    const targetWidth = Math.max(...parsed.map(item => item.target.length));
    const attributeWidths = [];
    for (const item of parsed) {
        item.attributes.forEach((attribute, index) => {
            attributeWidths[index] = Math.max(attributeWidths[index] ?? 0, formatAttribute(attribute).length);
        });
    }
    return lines.map((line, index) => {
        const item = assignments[index];
        if (!item) {
            return line.trimEnd();
        }
        const attributes = item.attributes.map((attribute, attributeIndex) => {
            const text = formatAttribute(attribute);
            const isLast = attributeIndex === item.attributes.length - 1;
            return isLast ? text : text.padEnd(attributeWidths[attributeIndex]);
        }).join(' ');
        const comment = item.comment === '' ? '' : ` ${item.comment}`;
        return `${item.command.padEnd(commandWidth)} { ${item.target.padEnd(targetWidth)} } { ${attributes} }${comment}`;
    }).join('\n');
}
class AdcFormatter {
    provideDocumentFormattingEdits(document) {
        const original = document.getText();
        const formatted = formatAdc(original);
        if (formatted === original) {
            return [];
        }
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
    provideDocumentRangeFormattingEdits(document, range) {
        const original = document.getText(range);
        const formatted = formatAdc(original);
        if (formatted === original) {
            return [];
        }
        return [vscode.TextEdit.replace(range, formatted)];
    }
}
exports.AdcFormatter = AdcFormatter;
//# sourceMappingURL=adcFormatter.js.map