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
exports.shouldFormatOnSave = shouldFormatOnSave;
// 按保存文档的语言选择独立开关，并读取该文档所属工作区的配置。
const vscode = __importStar(require("vscode"));
function shouldFormatOnSave(document) {
    let setting;
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
    return vscode.workspace.getConfiguration('verilogFormatter', document.uri).get(setting, false);
}
//# sourceMappingURL=formatOnSave.js.map