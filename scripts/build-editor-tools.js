// 文件：build-editor-tools.js；描述：构建词语高亮、CSV 与 Tcl 导航内置组件。
// 版本：v1.5.0；日期：2026/09/21
// 修改记录：v1.5.0 2026/09/21 新增 Tcl 导航构建与许可证复制。
// 修改记录：v1.0 2026/09/21 新增固定源码构建和运行资源复制。
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

// 2026/09/21 新增：仅从仓库固定源码构建，构建过程不下载上游或安装外部扩展。
async function build() {
    const root = path.resolve(__dirname, '..');
    // 2026/09/21 新增：构建固定版本的 Tcl 导航，不引入上游开发依赖。
    const tclOutput = path.join(root, 'out/tcl-navigate');
    fs.mkdirSync(tclOutput, { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'vendor/tcl-navigate/src/extension.ts')],
        outfile: path.join(tclOutput, 'extension.js'),
        bundle: true, platform: 'node', format: 'cjs', target: 'node18', external: ['vscode'],
    });
    fs.copyFileSync(path.join(root, 'vendor/tcl-navigate/LICENSE'), path.join(tclOutput, 'LICENSE'));
    const highlight = path.join(root, 'vendor/highlight-words');
    const highlightOutput = path.join(root, 'out/highlight-words');
    fs.mkdirSync(highlightOutput, { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(highlight, 'src/extension.ts')],
        outfile: path.join(highlightOutput, 'extension.js'),
        bundle: true, platform: 'node', format: 'cjs', target: 'node18', external: ['vscode'],
    });
    for (const file of ['resources', 'LICENSE.md']) {
        fs.cpSync(path.join(highlight, file), path.join(highlightOutput, file), { recursive: true });
    }
    const rainbow = path.join(root, 'vendor/rainbow-csv');
    const rainbowOutput = path.join(root, 'out/rainbow-csv');
    fs.mkdirSync(rainbowOutput, { recursive: true });
    for (const entry of fs.readdirSync(rainbow)) {
        if (['package.json', 'README.md'].includes(entry)) { continue; }
        fs.cpSync(path.join(rainbow, entry), path.join(rainbowOutput, entry), { recursive: true });
    }
    // 2026/09/21 新增：遵循上游浏览器构建边界，Node 专属模块在 Web 中禁用。
    await esbuild.build({
        entryPoints: [path.join(root, 'src/editorToolsWeb.ts')],
        outfile: path.join(root, 'out/editorToolsWeb.js'),
        bundle: true, platform: 'browser', format: 'cjs', target: 'es2020', external: ['vscode'],
        plugins: [{
            name: 'rainbow-web-node-boundary',
            setup(build) {
                build.onResolve({ filter: /^(fs|os|path|child_process|readline|util)$/ }, args => ({ path: args.path, namespace: 'node-disabled' }));
                build.onLoad({ filter: /.*/, namespace: 'node-disabled' }, () => ({ contents: 'module.exports = {};' }));
            },
        }],
    });
}

build().catch(error => {
    console.error('高亮和 CSV 内置组件构建失败：', error);
    process.exitCode = 1;
});
