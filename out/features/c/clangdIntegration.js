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
exports.registerEmbeddedClangd = registerEmbeddedClangd;
exports.deactivateEmbeddedClangd = deactivateEmbeddedClangd;
// 为受信任工作区中的 C/C++ 文件启动插件内置的 clangd 语义服务。
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const node_1 = require("vscode-languageclient/node");
// 格式化由本插件已有的 CFormatter 处理，clangd 只提供语义服务。
class EmbeddedLanguageClient extends node_1.LanguageClient {
    registerFeature(feature) {
        if ('registrationType' in feature
            && ['textDocument/formatting', 'textDocument/rangeFormatting', 'textDocument/onTypeFormatting']
                .includes(feature.registrationType.method)) {
            return;
        }
        super.registerFeature(feature);
    }
}
let client;
let startup;
let shuttingDown = false;
let externalSync = Promise.resolve();
function registerEmbeddedClangd(context) {
    shuttingDown = false;
    let starting = false;
    const isCFile = (document) => document.uri.scheme === 'file'
        && (document.languageId === 'c' || document.languageId === 'cpp');
    const hasExternalService = () => ['ms-vscode.cpptools', 'llvm-vs-code-extensions.vscode-clangd']
        .some(id => !!vscode.extensions.getExtension(id));
    const start = () => {
        if (starting || client || shuttingDown || !vscode.workspace.isTrusted) {
            return;
        }
        if (hasExternalService()) {
            return;
        }
        const executable = context.asAbsolutePath('out/clangd/clangd_23.1.0/bin/clangd.exe');
        if (process.platform !== 'win32' || !fs.existsSync(executable)) {
            void vscode.window.showErrorMessage('内置 clangd 不可用：缺少 Windows x64 语言服务运行文件。');
            return;
        }
        starting = true;
        const options = { windowsHide: true };
        const server = { command: executable, args: ['--header-insertion=never'], options };
        const pending = (async () => {
            try {
                const next = new EmbeddedLanguageClient('hanxuyaoClangd', 'C/C++ 语义服务', server, {
                    documentSelector: [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
                });
                client = next;
                await next.start();
            }
            catch (error) {
                const failed = client;
                let cleanupError = '';
                if (failed) {
                    try {
                        await failed.stop();
                    }
                    catch (failure) {
                        cleanupError = `；清理失败：${failure instanceof Error ? failure.message : String(failure)}`;
                    }
                }
                client = undefined;
                void vscode.window.showErrorMessage(`内置 clangd 启动失败：${error instanceof Error ? error.message : String(error)}${cleanupError}`);
            }
            finally {
                starting = false;
            }
        })();
        startup = pending;
        void pending.finally(() => { if (startup === pending) {
            startup = undefined;
        } });
    };
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => { if (isCFile(document)) {
        void start();
    } }), vscode.workspace.onDidGrantWorkspaceTrust(() => {
        if (vscode.workspace.textDocuments.some(isCFile)) {
            void start();
        }
    }), vscode.extensions.onDidChange(() => {
        externalSync = externalSync.then(async () => {
            if (shuttingDown) {
                return;
            }
            if (hasExternalService()) {
                if (startup) {
                    await startup;
                }
                if (shuttingDown || !hasExternalService() || !client) {
                    return;
                }
                const current = client;
                try {
                    await current.stop();
                }
                finally {
                    if (client === current) {
                        client = undefined;
                    }
                }
            }
            else if (vscode.workspace.textDocuments.some(isCFile)) {
                start();
            }
        }).catch(error => {
            void vscode.window.showErrorMessage(`C/C++ 语义服务切换失败：${error instanceof Error ? error.message : String(error)}`);
        });
    }));
    if (vscode.workspace.textDocuments.some(isCFile)) {
        void start();
    }
}
async function deactivateEmbeddedClangd() {
    shuttingDown = true;
    await externalSync;
    if (startup) {
        await startup;
    }
    if (!client) {
        return;
    }
    const current = client;
    client = undefined;
    await current.stop();
}
//# sourceMappingURL=clangdIntegration.js.map