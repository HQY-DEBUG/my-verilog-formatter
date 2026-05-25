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

import * as vscode from 'vscode';
import * as cp     from 'child_process';
import * as path   from 'path';
import * as fs     from 'fs';
import * as os     from 'os';

// xvlog 输出格式: ERROR: [VRFC 10-163] ... [file.v:10]
const RE_XVLOG = /^(ERROR|WARNING|INFO):\s*\[([^\]]+)\]\s*(.*?)\s*\[([^:]+):(\d+)\]/;

/**
 * @brief 运行 xvlog 并返回 Diagnostic 列表
 * @param filePath 被检查文件路径
 * @param severity 仅报告此级别及以上
 */
async function runXvlog(
    filePath : string,
    severity : string,
): Promise<vscode.Diagnostic[]> {
    return new Promise(resolve => {
        const args = ['--nolog', filePath];
        const proc = cp.spawn('xvlog', args, { shell: true });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', () => {
            const diags: vscode.Diagnostic[] = [];
            const output = stdout + '\n' + stderr;

            for (const line of output.split(/\r?\n/)) {
                const m = line.match(RE_XVLOG);
                if (!m) { continue; }

                const level   = m[1];
                const code    = m[2];
                const message = m[3];
                const lineNum = Math.max(0, parseInt(m[5], 10) - 1);

                let vscodeSev: vscode.DiagnosticSeverity;
                if (level === 'ERROR')   { vscodeSev = vscode.DiagnosticSeverity.Error;       }
                else if (level === 'WARNING') { vscodeSev = vscode.DiagnosticSeverity.Warning; }
                else                     { vscodeSev = vscode.DiagnosticSeverity.Information; }

                // 过滤级别
                if (severity === 'error' && vscodeSev !== vscode.DiagnosticSeverity.Error) { continue; }

                const range = new vscode.Range(lineNum, 0, lineNum, 999);
                const diag  = new vscode.Diagnostic(range, `[${code}] ${message}`, vscodeSev);
                diag.source = 'xvlog';
                diags.push(diag);
            }

            // 清理 xvlog 生成的临时文件
            const tmpLog = path.join(path.dirname(filePath), 'xvlog.log');
            if (fs.existsSync(tmpLog)) { try { fs.unlinkSync(tmpLog); } catch {} }
            const tmpPb  = path.join(path.dirname(filePath), 'xvlog.pb');
            if (fs.existsSync(tmpPb))  { try { fs.unlinkSync(tmpPb);  } catch {} }

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
export function registerLinter(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection('verilog-xvlog');
    context.subscriptions.push(collection);

    async function lint(document: vscode.TextDocument): Promise<void> {
        const cfg    = vscode.workspace.getConfiguration('verilogFormatter');
        if (!cfg.get<boolean>('lintEnabled', false)) { return; }

        const severity = cfg.get<string>('lintSeverity', 'warning');
        const diags    = await runXvlog(document.uri.fsPath, severity);
        collection.set(document.uri, diags);
    }

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'verilog' || doc.languageId === 'systemverilog') {
                lint(doc);
            }
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
            collection.delete(doc.uri);
        }),
    );
}
