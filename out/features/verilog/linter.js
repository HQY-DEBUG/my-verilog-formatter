"use strict";
// =========================================================================
// 文件    : linter.ts
// 描述    : 使用 xvlog 进行 Verilog 语法检查，输出 VS Code Diagnostic
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
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
exports.registerLinter = registerLinter;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// xvlog 输出格式: ERROR: [VRFC 10-163] ... [file.v:10]
const RE_XVLOG = /^(ERROR|WARNING|INFO):\s*\[([^\]]+)\]\s*(.*?)\s*\[([^:]+):(\d+)\]/;
/**
 * @brief 运行 xvlog 并返回 Diagnostic 列表
 * @param filePath 被检查文件路径
 * @param severity 仅报告此级别及以上
 */
async function runXvlog(filePath, severity) {
    return new Promise(resolve => {
        const args = ['--nolog', filePath];
        const proc = cp.spawn('xvlog', args, { shell: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', () => {
            const diags = [];
            const output = stdout + '\n' + stderr;
            for (const line of output.split(/\r?\n/)) {
                const m = line.match(RE_XVLOG);
                if (!m) {
                    continue;
                }
                const level = m[1];
                const code = m[2];
                const message = m[3];
                const lineNum = Math.max(0, parseInt(m[5], 10) - 1);
                let vscodeSev;
                if (level === 'ERROR') {
                    vscodeSev = vscode.DiagnosticSeverity.Error;
                }
                else if (level === 'WARNING') {
                    vscodeSev = vscode.DiagnosticSeverity.Warning;
                }
                else {
                    vscodeSev = vscode.DiagnosticSeverity.Information;
                }
                // 过滤级别
                if (severity === 'error' && vscodeSev !== vscode.DiagnosticSeverity.Error) {
                    continue;
                }
                const range = new vscode.Range(lineNum, 0, lineNum, 999);
                const diag = new vscode.Diagnostic(range, `[${code}] ${message}`, vscodeSev);
                diag.source = 'xvlog';
                diags.push(diag);
            }
            // 清理 xvlog 生成的临时文件
            const tmpLog = path.join(path.dirname(filePath), 'xvlog.log');
            if (fs.existsSync(tmpLog)) {
                try {
                    fs.unlinkSync(tmpLog);
                }
                catch { }
            }
            const tmpPb = path.join(path.dirname(filePath), 'xvlog.pb');
            if (fs.existsSync(tmpPb)) {
                try {
                    fs.unlinkSync(tmpPb);
                }
                catch { }
            }
            resolve(diags);
        });
        // xvlog 不可用时不报错
        proc.on('error', () => resolve([]));
    });
}
/**
 * @brief 注册语法检查
 * @param context 扩展上下文
 */
function registerLinter(context) {
    const collection = vscode.languages.createDiagnosticCollection('verilog-xvlog');
    context.subscriptions.push(collection);
    async function lint(document) {
        const cfg = vscode.workspace.getConfiguration('verilogFormatter');
        if (!cfg.get('lintEnabled', false)) {
            return;
        }
        const severity = cfg.get('lintSeverity', 'warning');
        const diags = await runXvlog(document.uri.fsPath, severity);
        collection.set(document.uri, diags);
    }
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'verilog' || doc.languageId === 'systemverilog') {
            lint(doc);
        }
    }), vscode.workspace.onDidCloseTextDocument(doc => {
        collection.delete(doc.uri);
    }));
}
//# sourceMappingURL=linter.js.map