// =========================================================================
// 文件    : instantiator.ts
// 描述    : 一键例化：解析当前 Verilog 模块端口，生成例化代码并复制到剪贴板
// 版本    : v0.1.0
// 日期    : 2026/05/25
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v0.1.0  2026/05/25  创建文件
// =========================================================================

import * as vscode from 'vscode';

// ---- 正则 ----//
// 匹配 module 声明行（含参数列表）
const RE_MODULE       = /^\s*module\s+(\w+)\s*(?:#\s*\(|(?:\()|$)/;
// 匹配端口声明行
const RE_PORT         = /^\s*(input|output|inout)\b\s*(wire|reg|logic)?\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*([\w,\s]+)\s*[,;)]/;
// 匹配 parameter 声明（在 #() 内）
const RE_PARAM        = /^\s*parameter\s+(?:\[[^\]]*\]\s*)?(\w+)\s*=\s*([^,)]+)/;

// ---- 数据结构 ----//
interface PortInfo  { dir: string; width: string; names: string[]; }
interface ParamInfo { name: string; defaultVal: string; }
interface ModuleInfo {
    name   : string;
    params : ParamInfo[];
    ports  : PortInfo[];
}

/**
 * @brief 从文档内容解析模块端口信息
 * @param text 文档全文
 * @return 第一个找到的模块信息，未找到返回 null
 */
function parseModule(text: string): ModuleInfo | null {
    const lines  = text.split(/\r?\n/);
    let   modName: string | null = null;
    const params : ParamInfo[] = [];
    const ports  : PortInfo[]  = [];
    let   inParam = false; // 在 #() 参数列表内

    for (const line of lines) {
        if (!modName) {
            const m = line.match(RE_MODULE);
            if (m) {
                modName = m[1];
                inParam = line.includes('#');
            }
            continue;
        }

        // 跳过注释行和空行
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) { continue; }
        if (trimmed.startsWith('/*')) { continue; }

        // endmodule 停止
        if (/\bendmodule\b/.test(trimmed)) { break; }

        // 参数区
        if (inParam) {
            const pm = trimmed.match(RE_PARAM);
            if (pm) {
                params.push({ name: pm[1], defaultVal: pm[2].trim() });
            }
            if (trimmed.includes(')')) { inParam = false; }
            continue;
        }

        // 端口行
        const pm = trimmed.match(RE_PORT);
        if (pm) {
            const dir   = pm[1];
            const width = pm[4] ? pm[4].trim() : '';
            const names = pm[5].split(',').map(n => n.trim()).filter(n => n.length > 0);
            ports.push({ dir, width, names });
        }
    }

    return modName ? { name: modName, params, ports } : null;
}

/**
 * @brief 生成例化代码字符串
 * @param info 模块信息
 * @return 例化代码
 */
function generateInstance(info: ModuleInfo): string {
    const lines: string[] = [];
    const instName = `u_${info.name}`;

    // 端口映射：注释列统一对齐
    const flatPorts  = info.ports.flatMap(p => p.names.map(n => ({ name: n, dir: p.dir, width: p.width })));
    const maxPortLen = flatPorts.reduce((m, p) => Math.max(m, p.name.length), 0);

    // 参数例化
    if (info.params.length > 0) {
        lines.push(`${info.name} #(`);
        info.params.forEach((p, i) => {
            const comma = i < info.params.length - 1 ? ',' : '';
            lines.push(`    .${p.name.padEnd(maxPortLen)}  (${p.defaultVal})${comma}`);
        });
        lines.push(`) ${instName} (`);
    } else {
        lines.push(`${info.name} ${instName} (`);
    }

    // 第一步：生成每行的主体部分（不含注释），计算最大长度以对齐注释列
    // 格式：    .portName  ( sigName ),
    const portBodies = flatPorts.map((port, i) => {
        const isLast  = i === flatPorts.length - 1;
        const portPad = port.name.padEnd(maxPortLen);
        const sigPad  = port.name.padEnd(maxPortLen);
        const tail    = isLast ? ' ' : ',';
        return `    .${portPad}  ( ${sigPad})${tail}`;
    });
    const maxBodyLen = portBodies.reduce((m, b) => Math.max(m, b.length), 0);

    // 第二步：拼接注释，所有注释列对齐
    flatPorts.forEach((port, i) => {
        const widthStr = port.width ? ` ${port.width}` : '';
        const comment  = `// ${port.dir}${widthStr} ${port.name}`;
        const body     = portBodies[i].padEnd(maxBodyLen);
        lines.push(`${body}  ${comment}`);
    });

    lines.push(');');
    return lines.join('\n');
}

/**
 * @brief 生成 Testbench 骨架
 * @param info 模块信息
 * @return TB 代码
 */
function generateTestbench(info: ModuleInfo): string {
    const lines: string[] = [];
    lines.push('`timescale 1ns / 1ps');
    lines.push('');
    lines.push(`module tb_${info.name};`);
    lines.push('');

    // 信号声明
    for (const port of info.ports) {
        const w    = port.width ? `${port.width} ` : '';
        const type = port.dir === 'input' ? 'reg ' : 'wire';
        for (const n of port.names) {
            lines.push(`    ${type}  ${w}${n};`);
        }
    }

    lines.push('');
    // DUT 例化
    const allPortNames = info.ports.flatMap(p => p.names);
    const maxPortLen   = allPortNames.reduce((m, n) => Math.max(m, n.length), 0);
    lines.push(`    ${info.name} u_${info.name} (`);
    const flatPorts = info.ports.flatMap(p => p.names);
    flatPorts.forEach((name, i) => {
        const comma = i < flatPorts.length - 1 ? ',' : '';
        lines.push(`        .${name.padEnd(maxPortLen)}  (${name})${comma}`);
    });
    lines.push('    );');

    lines.push('');
    lines.push('    initial begin');
    lines.push('        // TODO: 添加激励');
    lines.push('        #1000;');
    lines.push('        $finish;');
    lines.push('    end');
    lines.push('');
    lines.push(`endmodule // tb_${info.name}`);

    return lines.join('\n');
}

/**
 * @brief 注册一键例化相关命令
 * @param context 扩展上下文
 */
export function registerInstantiatorCommands(context: vscode.ExtensionContext): void {
    // 一键例化
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.instantiate', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const info = parseModule(editor.document.getText());
            if (!info) {
                vscode.window.showWarningMessage('未找到 module 声明');
                return;
            }

            const code = generateInstance(info);
            await vscode.env.clipboard.writeText(code);
            vscode.window.showInformationMessage(`已复制例化代码：${info.name}`);
        })
    );

    // 一键 TB
    context.subscriptions.push(
        vscode.commands.registerCommand('verilogFormatter.generateTb', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const info = parseModule(editor.document.getText());
            if (!info) {
                vscode.window.showWarningMessage('未找到 module 声明');
                return;
            }

            const code = generateTestbench(info);
            await vscode.env.clipboard.writeText(code);
            vscode.window.showInformationMessage(`已复制 Testbench 骨架：tb_${info.name}`);
        })
    );
}
