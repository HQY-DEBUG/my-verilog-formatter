// 按保存文档的语言选择独立开关，并读取该文档所属工作区的配置。
import * as vscode from 'vscode';

export function shouldFormatOnSave(document: Pick<vscode.TextDocument, 'languageId' | 'uri'>): boolean {
    let setting: string;
    switch (document.languageId) {
        case 'verilog':
        case 'systemverilog':
        case 'verilog-hdl':
        case 'systemverilog-hdl':
            setting = 'formatOnSave';
            break;
        case 'c':
        case 'cpp':
            setting = 'c.formatOnSave';
            break;
        case 'matlab':
            setting = 'matlab.formatOnSave';
            break;
        case 'anlogic-adc':
            setting = 'adc.formatOnSave';
            break;
        default:
            return false;
    }
    return vscode.workspace.getConfiguration('verilogFormatter', document.uri).get<boolean>(setting, false);
}
