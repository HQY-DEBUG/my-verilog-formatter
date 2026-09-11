import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { activateMatlab, deactivateMatlab, useMathWorksFormatter } from '../src/features/matlab/matlabIntegration';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    extensions: { getExtension: jest.fn() },
    window: { showInformationMessage: jest.fn() },
}));

const root = path.resolve(__dirname, '..');
const upstream = JSON.parse(fs.readFileSync(path.join(root, 'vendor/matlab/package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('MATLAB 内置集成', () => {
    it('覆盖上游全部贡献点并正确映射资源路径', () => {
        function check(expected: any, actual: any): void {
            if (Array.isArray(expected)) {
                for (const item of expected) {
                    expect(actual).toEqual(expect.arrayContaining([expect.objectContaining(item)]));
                }
            } else if (expected && typeof expected === 'object') {
                for (const key of Object.keys(expected)) { check(expected[key], actual[key]); }
            } else {
                expect(actual).toEqual(expected);
            }
        }
        const contributions = JSON.parse(JSON.stringify(upstream.contributes).replace(/\.\//g, './out/matlab/'));
        delete contributions.configuration;
        check(contributions, manifest.contributes);
        const properties = Object.assign({}, ...manifest.contributes.configuration.map((item: any) => item.properties));
        for (const config of upstream.contributes.configuration) {
            for (const key of Object.keys(config.properties)) { expect(properties[key]).toBeDefined(); }
        }
        expect(properties['MATLAB.matlabConnectionTiming'].default).toBe('onDemand');
        expect(manifest.activationEvents).toEqual(expect.arrayContaining(upstream.activationEvents));
    });

    it('运行资源包含服务器、MATLAB 支持代码、终端 WASM 和变量面板', () => {
        for (const relative of [
            'out/extension.js', 'out/bundle.js', 'out/workspacebrowser/resources/webview.css',
            'server/out/index.js', 'server/matlab/initmatlabls.m', 'server/out/licensing/static/index.html',
            'syntaxes/Matlab.tmbundle/Syntaxes/MATLAB.tmLanguage', 'snippets/matlab.json',
            'node_modules/vscode-oniguruma/release/onig.wasm', 'LICENSE', 'server/LICENSE', 'syntaxes/license.txt',
        ]) {
            expect(fs.existsSync(path.join(root, 'out/matlab', relative))).toBe(true);
        }
    });

    it('按设置选择格式化器，默认保留原有规则', () => {
        expect(useMathWorksFormatter()).toBe(false);
        const config = jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({ get: () => 'mathworks' } as any);
        expect(useMathWorksFormatter()).toBe(true);
        config.mockRestore();
    });

    it('内置上下文仅重定位资源且能关闭上游运行时', async () => {
        const runtimePath = path.join(root, 'out/matlab/out/extension.js');
        const runtime = { activate: jest.fn().mockResolvedValue(undefined), deactivate: jest.fn().mockResolvedValue(undefined) };
        jest.doMock(runtimePath, () => runtime);
        const context = {
            asAbsolutePath: (relative: string) => path.join(root, relative),
            globalState: {}, workspaceState: {}, subscriptions: [], extension: { id: 'hanxuyao.hanxuyao-plugin' },
        } as unknown as vscode.ExtensionContext;
        await activateMatlab(context);
        const adapted = runtime.activate.mock.calls[0][0];
        expect(adapted.asAbsolutePath('server/out/index.js')).toBe(path.join(root, 'out/matlab/server/out/index.js'));
        expect(adapted.globalState).toBe(context.globalState);
        expect(adapted.workspaceState).toBe(context.workspaceState);
        expect(adapted.subscriptions).toBe(context.subscriptions);
        expect(adapted.extension).toBe(context.extension);
        await deactivateMatlab();
        expect(runtime.deactivate).toHaveBeenCalledTimes(1);
        jest.dontMock(runtimePath);
    });
});
