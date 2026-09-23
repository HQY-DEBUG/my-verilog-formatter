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
exports.C_CLANG_STYLE = void 0;
exports.runClangFormat = runClangFormat;
// C/C++ 通用排版交给 clang-format；仅在样式参数中覆盖已有的明确约定。
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
exports.C_CLANG_STYLE = {
    BasedOnStyle: 'InheritParentConfig',
    IndentWidth: 4,
    AllowShortFunctionsOnASingleLine: 'None',
    SkipMacroDefinitionBody: true,
};
function clangFormatExecutable() {
    const configured = vscode.workspace.getConfiguration('verilogFormatter.c')
        .get('clangFormatPath', '').trim();
    if (configured) {
        if (!path.isAbsolute(configured)) {
            throw new Error('C/C++ 格式化：clangFormatPath 必须是可执行文件的绝对路径。');
        }
        return configured;
    }
    const cppTools = vscode.extensions.getExtension('ms-vscode.cpptools');
    if (cppTools) {
        const bundled = path.join(cppTools.extensionPath, 'LLVM', 'bin', process.platform === 'win32' ? 'clang-format.exe' : 'clang-format');
        if (fs.existsSync(bundled)) {
            return bundled;
        }
    }
    return 'clang-format';
}
async function runClangFormat(code, filename, range) {
    const executable = clangFormatExecutable();
    const columnLimit = vscode.workspace.getConfiguration('verilogFormatter.c', vscode.Uri.file(filename))
        .get('columnLimit', 999999);
    if (!Number.isInteger(columnLimit) || columnLimit < 0 || columnLimit > 4294967295) {
        throw new Error('C/C++ 格式化：columnLimit 必须是 0 到 4294967295 之间的整数。');
    }
    const args = [
        `--assume-filename=${filename}`,
        `--style=${JSON.stringify({ ...exports.C_CLANG_STYLE, ColumnLimit: columnLimit })}`,
        '--fallback-style=LLVM',
    ];
    if (range) {
        args.push(`--lines=${range.start}:${range.end}`);
    }
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.execFile)(executable, args, {
            encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 20 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`C/C++ 格式化失败：请确认 clang-format 18 或更高版本可用，`
                    + `或设置 verilogFormatter.c.clangFormatPath。\n${stderr.trim() || error.message}`));
                return;
            }
            if (stderr.trim()) {
                console.warn(`clang-format：${stderr.trim()}`);
            }
            resolve(stdout);
        });
        child.stdin.on('error', error => reject(new Error(`无法向 clang-format 写入源码：${error.message}`)));
        child.stdin.end(code, 'utf8');
    });
}
//# sourceMappingURL=clangFormat.js.map