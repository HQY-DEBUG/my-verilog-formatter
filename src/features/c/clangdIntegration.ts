// 为受信任工作区中的 C/C++ 文件启动插件内置的 clangd 语义服务。
import * as fs from 'fs';
import * as vscode from 'vscode';
import { DynamicFeature, ExecutableOptions, LanguageClient, StaticFeature } from 'vscode-languageclient/node';

// 格式化由本插件已有的 CFormatter 处理，clangd 只提供语义服务。
class EmbeddedLanguageClient extends LanguageClient {
    override registerFeature(feature: StaticFeature | DynamicFeature<unknown>): void {
        if ('registrationType' in feature
            && ['textDocument/formatting', 'textDocument/rangeFormatting', 'textDocument/onTypeFormatting']
                .includes(feature.registrationType.method)) { return; }
        super.registerFeature(feature);
    }
}

let client: EmbeddedLanguageClient | undefined;
let startup: Promise<void> | undefined;
let shuttingDown = false;
let externalSync: Promise<void> = Promise.resolve();

export function registerEmbeddedClangd(context: vscode.ExtensionContext): void {
    shuttingDown = false;
    let starting = false;
    const isCFile = (document: vscode.TextDocument): boolean => document.uri.scheme === 'file'
        && (document.languageId === 'c' || document.languageId === 'cpp');
    const hasExternalService = (): boolean => ['ms-vscode.cpptools', 'llvm-vs-code-extensions.vscode-clangd']
        .some(id => !!vscode.extensions.getExtension(id));
    const start = (): void => {
        if (starting || client || shuttingDown || !vscode.workspace.isTrusted) { return; }
        if (hasExternalService()) { return; }
        const executable = context.asAbsolutePath('out/clangd/clangd_23.1.0/bin/clangd.exe');
        if (process.platform !== 'win32' || !fs.existsSync(executable)) {
            void vscode.window.showErrorMessage('内置 clangd 不可用：缺少 Windows x64 语言服务运行文件。');
            return;
        }
        starting = true;
        const options: ExecutableOptions & { windowsHide: boolean } = { windowsHide: true };
        const server = { command: executable, args: ['--header-insertion=never'], options };
        const pending = (async () => {
            try {
                const next = new EmbeddedLanguageClient('hanxuyaoClangd', 'C/C++ 语义服务', server, {
                    documentSelector: [{ scheme: 'file', language: 'c' }, { scheme: 'file', language: 'cpp' }],
                });
                client = next;
                await next.start();
            } catch (error) {
                const failed = client;
                let cleanupError = '';
                if (failed) {
                    try {
                        await failed.stop();
                    } catch (failure) {
                        cleanupError = `；清理失败：${failure instanceof Error ? failure.message : String(failure)}`;
                    }
                }
                client = undefined;
                void vscode.window.showErrorMessage(`内置 clangd 启动失败：${error instanceof Error ? error.message : String(error)}${cleanupError}`);
            } finally {
                starting = false;
            }
        })();
        startup = pending;
        void pending.finally(() => { if (startup === pending) { startup = undefined; } });
    };
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => { if (isCFile(document)) { void start(); } }),
        vscode.workspace.onDidGrantWorkspaceTrust(() => {
            if (vscode.workspace.textDocuments.some(isCFile)) { void start(); }
        }),
        vscode.extensions.onDidChange(() => {
            externalSync = externalSync.then(async () => {
                if (shuttingDown) { return; }
                if (hasExternalService()) {
                    if (startup) { await startup; }
                    if (shuttingDown || !hasExternalService() || !client) { return; }
                    const current = client;
                    try {
                        await current.stop();
                    } finally {
                        if (client === current) { client = undefined; }
                    }
                } else if (vscode.workspace.textDocuments.some(isCFile)) {
                    start();
                }
            }).catch(error => {
                void vscode.window.showErrorMessage(`C/C++ 语义服务切换失败：${error instanceof Error ? error.message : String(error)}`);
            });
        }),
    );
    if (vscode.workspace.textDocuments.some(isCFile)) { void start(); }
}

export async function deactivateEmbeddedClangd(): Promise<void> {
    shuttingDown = true;
    await externalSync;
    if (startup) { await startup; }
    if (!client) { return; }
    const current = client;
    client = undefined;
    await current.stop();
}
