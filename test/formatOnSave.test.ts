// 验证各语言保存开关独立，以及保存文档的工作区配置作用域。
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { shouldFormatOnSave } from '../src/features/formatOnSave';

const languages = [
    ['verilog', 'formatOnSave'], ['systemverilog', 'formatOnSave'],
    ['verilog-hdl', 'formatOnSave'], ['systemverilog-hdl', 'formatOnSave'],
    ['c', 'c.formatOnSave'], ['cpp', 'c.formatOnSave'],
    ['matlab', 'matlab.formatOnSave'], ['anlogic-adc', 'adc.formatOnSave'],
];
const uri = vscode.Uri.file(path.resolve('test', 'example.txt'));

afterEach(() => jest.restoreAllMocks());

describe('独立保存格式化开关', () => {
    it.each(languages)('%s 使用对应开关 %s，其他开关不能覆盖它', (languageId, setting) => {
        const get = jest.fn((key: string) => key === setting);
        const config = jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({ get } as any);
        expect(shouldFormatOnSave({ languageId, uri })).toBe(true);
        expect(config).toHaveBeenCalledWith('verilogFormatter', uri);
        expect(get).toHaveBeenCalledWith(setting, false);
        get.mockImplementation(key => key !== setting);
        expect(shouldFormatOnSave({ languageId, uri })).toBe(false);
    });

    it('默认均关闭，未支持的语言不会读取配置', () => {
        const config = jest.spyOn(vscode.workspace, 'getConfiguration');
        for (const [languageId] of languages) {
            expect(shouldFormatOnSave({ languageId, uri })).toBe(false);
        }
        config.mockClear();
        expect(shouldFormatOnSave({ languageId: 'python', uri })).toBe(false);
        expect(config).not.toHaveBeenCalled();
    });

    it('工作区按文档独立取值，更新配置后下一次保存生效', () => {
        const first = vscode.Uri.file(path.resolve('first', 'example.c'));
        const second = vscode.Uri.file(path.resolve('second', 'example.c'));
        let enabled = true;
        jest.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((_section, scope) => ({
            get: () => scope === first && enabled,
        }) as any);
        expect(shouldFormatOnSave({ languageId: 'c', uri: first })).toBe(true);
        expect(shouldFormatOnSave({ languageId: 'c', uri: second })).toBe(false);
        enabled = false;
        expect(shouldFormatOnSave({ languageId: 'c', uri: first })).toBe(false);
    });

    it('设置面板提供四个独立布尔开关', () => {
        const root = path.resolve(__dirname, '..');
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const properties = Object.assign({}, ...pkg.contributes.configuration.map((item: any) => item.properties));
        for (const setting of new Set(languages.map(([, key]) => key))) {
            expect(properties[`verilogFormatter.${setting}`]).toMatchObject({ type: 'boolean', default: false, scope: 'resource' });
        }
        expect(properties['verilogFormatter.formatOnSave'].description).not.toContain('C++');
    });
});
