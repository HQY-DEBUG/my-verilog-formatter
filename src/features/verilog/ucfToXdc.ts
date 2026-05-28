// =========================================================================
// 文件    : ucfToXdc.ts
// 描述    : UCF 约束文件转换为 XDC 格式
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';
import * as path   from 'path';
import * as fs     from 'fs';

// UCF 的 NET 属性映射到 XDC set_property
const PROP_MAP: Record<string, string> = {
    LOC        : 'PACKAGE_PIN',
    IOSTANDARD : 'IOSTANDARD',
    DRIVE      : 'DRIVE',
    SLEW       : 'SLEW',
    PULLDOWN   : 'PULLDOWN',
    PULLUP     : 'PULLUP',
    KEEPER     : 'KEEPER',
    IN_TERM    : 'IN_TERM',
    OUT_TERM   : 'OUT_TERM',
    DIFF_TERM  : 'DIFF_TERM',
};

/**
 * @brief 将单行 UCF NET 语句转换为 XDC 行列表
 * @param line UCF 行（已去注释）
 * @return 转换后的 XDC 行数组，无法转换时返回注释行
 */
function convertUcfLine(line: string): string[] {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) { return []; }

    // NET "port" KEY=VALUE [KEY=VALUE ...];
    const netMatch = trimmed.match(/^NET\s+"([^"]+)"\s+(.+);?$/i);
    if (!netMatch) { return [`# [未转换] ${trimmed}`]; }

    const portName = netMatch[1].replace(/\[/g, '{').replace(/\]/g, '}');
    const attrsStr = netMatch[2];
    const results: string[] = [];

    // PERIOD/TNM_NET → create_clock
    const periodMatch = attrsStr.match(/PERIOD\s*=\s*([\d.]+)\s*(ns|ps|MHz|KHz)?/i);
    if (periodMatch) {
        const val  = parseFloat(periodMatch[1]);
        const unit = (periodMatch[2] || 'ns').toLowerCase();
        let periodNs = val;
        if (unit === 'ps')  { periodNs = val / 1000; }
        if (unit === 'mhz') { periodNs = 1000 / val; }
        if (unit === 'khz') { periodNs = 1e6  / val; }
        results.push(`create_clock -period ${periodNs.toFixed(3)} [get_ports {${portName}}]`);
        return results;
    }

    // 普通属性
    const pairs = attrsStr.matchAll(/(\w+)\s*=\s*"?([^",;\s]+)"?/g);
    for (const pair of pairs) {
        const ucfKey  = pair[1].toUpperCase();
        const ucfVal  = pair[2];
        const xdcProp = PROP_MAP[ucfKey];
        if (xdcProp) {
            results.push(`set_property ${xdcProp} ${ucfVal} [get_ports {${portName}}]`);
        } else {
            results.push(`# [未知属性] ${ucfKey}=${ucfVal} on ${portName}`);
        }
    }

    return results.length ? results : [`# [未转换] ${trimmed}`];
}

/**
 * @brief 转换整个 UCF 文件内容为 XDC 格式
 * @param ucfContent UCF 文件内容
 * @return XDC 格式字符串
 */
function convertUcfContent(ucfContent: string): string {
    const lines  = ucfContent.split(/\r?\n/);
    const output: string[] = [
        '# 由 UCF 自动转换为 XDC（my-verilog-formatter）',
        `# 转换时间: ${new Date().toLocaleString()}`,
        '',
    ];

    let buf = '';
    for (const raw of lines) {
        // 去掉行注释
        const noComment = raw.replace(/#.*$/, '').trim();
        buf += ' ' + noComment;
        // UCF 以 ; 结束一条语句
        if (buf.includes(';')) {
            const stmt = buf.trim();
            buf = '';
            output.push(...convertUcfLine(stmt));
        }
    }

    return output.join('\n');
}

/**
 * @brief 注册 UCF→XDC 转换命令
 * @param context 扩展上下文
 */
export function registerUcfToXdcCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.ucfToXdc', async () => {
            const editor = vscode.window.activeTextEditor;
            // 优先使用当前打开的 UCF 文件
            if (editor && editor.document.languageId === 'ucf') {
                const xdc  = convertUcfContent(editor.document.getText());
                const orig = editor.document.uri.fsPath;
                const dest = orig.replace(/\.ucf$/i, '.xdc');
                fs.writeFileSync(dest, xdc, 'utf8');
                await vscode.window.showTextDocument(vscode.Uri.file(dest));
                vscode.window.showInformationMessage(`已转换：${path.basename(dest)}`);
                return;
            }

            // 否则弹文件选择框
            const uris = await vscode.window.showOpenDialog({
                filters    : { 'UCF 约束文件': ['ucf'] },
                canSelectMany: false,
                title      : '选择要转换的 UCF 文件',
            });
            if (!uris || uris.length === 0) { return; }

            const ucfPath = uris[0].fsPath;
            const xdcPath = ucfPath.replace(/\.ucf$/i, '.xdc');
            const content = fs.readFileSync(ucfPath, 'utf8');
            fs.writeFileSync(xdcPath, convertUcfContent(content), 'utf8');
            await vscode.window.showTextDocument(vscode.Uri.file(xdcPath));
            vscode.window.showInformationMessage(`已转换：${path.basename(xdcPath)}`);
        })
    );
}
