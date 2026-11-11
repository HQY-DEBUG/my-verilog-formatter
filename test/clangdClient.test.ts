// 验证内置 clangd 的启动时机、共存策略和资源释放。
import * as vscode from 'vscode';

const start = jest.fn().mockResolvedValue(undefined);
const stop = jest.fn().mockResolvedValue(undefined);
const createClient = jest.fn();
jest.mock('vscode-languageclient/node', () => ({
    LanguageClient: class {
        constructor(...args: unknown[]) { createClient(...args); }
        start = start;
        stop = stop;
        registerFeature() {}
    },
}));
jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    workspace: { isTrusted: true, textDocuments: [], onDidOpenTextDocument: jest.fn(), onDidGrantWorkspaceTrust: jest.fn() },
    extensions: { getExtension: jest.fn(), onDidChange: jest.fn() },
    window: { showErrorMessage: jest.fn() },
}));

describe('内置 clangd 客户端', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace as any).isTrusted = true;
        (vscode.workspace as any).textDocuments = [];
        (vscode.extensions.getExtension as jest.Mock).mockReset();
    });

    it('打开 C 文件后启动内置服务，退出时停止', async () => {
        const api = require('../src/features/c/clangdIntegration');
        const context = { asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] };
        api.registerEmbeddedClangd(context);
        expect(start).not.toHaveBeenCalled();
        const onOpen = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        onOpen({ languageId: 'c', uri: { scheme: 'file' } });
        await Promise.resolve();
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(start).toHaveBeenCalledTimes(1);
        await api.deactivateEmbeddedClangd();
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('未信任工作区不启动，信任后为已打开的 C++ 文件启动', async () => {
        (vscode.workspace as any).isTrusted = false;
        (vscode.workspace as any).textDocuments = [{ languageId: 'cpp', uri: { scheme: 'file' } }];
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        expect(start).not.toHaveBeenCalled();
        (vscode.workspace as any).isTrusted = true;
        const onTrust = (vscode.workspace.onDidGrantWorkspaceTrust as jest.Mock).mock.calls[0][0];
        onTrust();
        await Promise.resolve();
        expect(start).toHaveBeenCalledTimes(1);
        await api.deactivateEmbeddedClangd();
    });

    it('其他 C/C++ 语言服务已运行时不重复启动', async () => {
        (vscode.workspace as any).textDocuments = [{ languageId: 'c', uri: { scheme: 'file' } }];
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: true });
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        await Promise.resolve();
        expect(start).not.toHaveBeenCalled();
    });

    it('已启用的外部语言扩展尚未激活时也不抢先启动', async () => {
        (vscode.workspace as any).textDocuments = [{ languageId: 'c', uri: { scheme: 'file' } }];
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: false });
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        await Promise.resolve();
        expect(start).not.toHaveBeenCalled();
    });

    it('外部语言扩展启用或禁用时切换服务，不重复运行', async () => {
        (vscode.workspace as any).textDocuments = [{ languageId: 'c', uri: { scheme: 'file' } }];
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        await new Promise(resolve => setImmediate(resolve));
        expect(start).toHaveBeenCalledTimes(1);
        const onChange = (vscode.extensions.onDidChange as jest.Mock).mock.calls[0][0];
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: false });
        onChange();
        await new Promise(resolve => setImmediate(resolve));
        expect(stop).toHaveBeenCalledTimes(1);
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
        onChange();
        await new Promise(resolve => setImmediate(resolve));
        expect(start).toHaveBeenCalledTimes(2);
        await api.deactivateEmbeddedClangd();
        expect(stop).toHaveBeenCalledTimes(2);
    });

    it('停止旧服务失败时报告错误，外部扩展禁用后仍可重启', async () => {
        (vscode.workspace as any).textDocuments = [{ languageId: 'c', uri: { scheme: 'file' } }];
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        await new Promise(resolve => setImmediate(resolve));
        const onChange = (vscode.extensions.onDidChange as jest.Mock).mock.calls[0][0];
        stop.mockRejectedValueOnce(new Error('停止失败'));
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue({ isActive: false });
        onChange();
        await new Promise(resolve => setImmediate(resolve));
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('停止失败'));
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
        onChange();
        await new Promise(resolve => setImmediate(resolve));
        expect(start).toHaveBeenCalledTimes(2);
        await api.deactivateEmbeddedClangd();
    });

    it('客户端创建失败时报告错误，并允许下一次打开文件重试', async () => {
        (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
        createClient.mockImplementationOnce(() => { throw new Error('创建失败'); });
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        const onOpen = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        onOpen({ languageId: 'c', uri: { scheme: 'file' } });
        await Promise.resolve();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('创建失败'));
        onOpen({ languageId: 'c', uri: { scheme: 'file' } });
        await Promise.resolve();
        expect(start).toHaveBeenCalledTimes(1);
        await api.deactivateEmbeddedClangd();
    });

    it('语言服务初始化失败后清理进程并允许重试', async () => {
        start.mockRejectedValueOnce(new Error('初始化失败'));
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        const onOpen = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        onOpen({ languageId: 'c', uri: { scheme: 'file' } });
        await new Promise(resolve => setImmediate(resolve));
        expect(stop).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('初始化失败'));
        onOpen({ languageId: 'c', uri: { scheme: 'file' } });
        await new Promise(resolve => setImmediate(resolve));
        expect(start).toHaveBeenCalledTimes(2);
        await api.deactivateEmbeddedClangd();
    });

    it('关闭扩展时等待正在启动的语言服务，再停止进程', async () => {
        let finishStart!: () => void;
        start.mockImplementationOnce(() => new Promise<void>(resolve => { finishStart = resolve; }));
        const api = require('../src/features/c/clangdIntegration');
        api.registerEmbeddedClangd({ asAbsolutePath: (value: string) => require('path').resolve(value), subscriptions: [] });
        const onOpen = (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0];
        onOpen({ languageId: 'c', uri: { scheme: 'file' } });
        const closing = api.deactivateEmbeddedClangd();
        expect(stop).not.toHaveBeenCalled();
        finishStart();
        await closing;
        expect(stop).toHaveBeenCalledTimes(1);
    });
});
