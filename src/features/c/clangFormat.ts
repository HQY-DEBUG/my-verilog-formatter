// C/C++ 通用排版交给 clang-format；仅在样式参数中覆盖已有的明确约定。
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export interface ClangLineRange { start: number; end: number }

export const C_CLANG_STYLE = {
    BasedOnStyle: 'InheritParentConfig',
    IndentWidth: 4,
    SkipMacroDefinitionBody: true,
};

function clangFormatExecutable(): string {
    const configured = vscode.workspace.getConfiguration('verilogFormatter.c')
        .get<string>('clangFormatPath', '').trim();
    if (configured) {
        if (!path.isAbsolute(configured)) {
            throw new Error('C/C++ 格式化：clangFormatPath 必须是可执行文件的绝对路径。');
        }
        return configured;
    }
    const cppTools = vscode.extensions.getExtension('ms-vscode.cpptools');
    if (cppTools) {
        const bundled = path.join(cppTools.extensionPath, 'LLVM', 'bin',
            process.platform === 'win32' ? 'clang-format.exe' : 'clang-format');
        if (fs.existsSync(bundled)) { return bundled; }
    }
    return 'clang-format';
}

export async function runClangFormat(code: string, filename: string, range?: ClangLineRange): Promise<string> {
    const executable = clangFormatExecutable();
    const args = [
        `--assume-filename=${filename}`,
        `--style=${JSON.stringify(C_CLANG_STYLE)}`,
        '--fallback-style=LLVM',
    ];
    if (range) { args.push(`--lines=${range.start}:${range.end}`); }
    return new Promise((resolve, reject) => {
        const child = execFile(executable, args, {
            encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 20 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`C/C++ 格式化失败：请确认 clang-format 18 或更高版本可用，`
                    + `或设置 verilogFormatter.c.clangFormatPath。\n${stderr.trim() || error.message}`));
                return;
            }
            if (stderr.trim()) { console.warn(`clang-format：${stderr.trim()}`); }
            resolve(stdout);
        });
        child.stdin!.on('error', error => reject(new Error(`无法向 clang-format 写入源码：${error.message}`)));
        child.stdin!.end(code, 'utf8');
    });
}
