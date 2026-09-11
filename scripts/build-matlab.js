const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'vendor', 'matlab');
const target = path.join(root, 'out', 'matlab');

function npm(args, cwd) {
    // 由 npm 提供 CLI 路径，避免 Windows 的 cmd 字符串转义。
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, stdio: 'inherit' });
}

async function build() {
    if (process.argv.includes('--install')) {
        for (const dir of [source, path.join(source, 'server'), path.join(source, 'server/src/licensing/gui')]) {
            npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], dir);
        }
        return;
    }

    npm(['run', 'compile'], source);
    fs.mkdirSync(target, { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(source, 'out', 'extension.js')],
        outfile: path.join(target, 'out', 'extension.js'),
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        external: ['vscode'],
        legalComments: 'eof',
    });
    for (const relative of [
        'out/bundle.js', 'out/workspacebrowser/resources', 'server/out', 'server/matlab',
        'syntaxes/Matlab.tmbundle', 'syntaxes/license.txt', 'snippets',
        'public', 'language-configuration.json', 'LICENSE', 'server/LICENSE',
        'node_modules/vscode-oniguruma/release/onig.wasm',
    ]) {
        const destination = path.join(target, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(path.join(source, relative), destination, { recursive: true });
    }
    fs.copyFileSync(
        path.join(source, 'server/src/lifecycle/MatlabCommunicationManager.js.LICENSE.txt'),
        path.join(target, 'server/out/MatlabCommunicationManager.js.LICENSE.txt'),
    );
    const licenses = [];
    const seen = new Set();
    for (const dir of [source, path.join(source, 'server'), path.join(source, 'server/src/licensing/gui')]) {
        const packages = execFileSync(process.execPath, [process.env.npm_execpath, 'ls', '--omit=dev', '--all', '--parseable'], { cwd: dir, encoding: 'utf8' });
        for (const packagePath of packages.trim().split(/\r?\n/).slice(1)) {
            const info = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));
            const id = `${info.name}@${info.version}`;
            if (seen.has(id)) { continue; }
            seen.add(id);
            const texts = fs.readdirSync(packagePath, { withFileTypes: true })
                .filter(file => file.isFile() && /^(licen[cs]e|copying|notice)([.-]|$)/i.test(file.name))
                .map(file => fs.readFileSync(path.join(packagePath, file.name), 'utf8'));
            licenses.push(`${id}\n${info.license || ''}\n${texts.join('\n')}`);
        }
    }
    fs.writeFileSync(path.join(target, 'THIRD_PARTY_LICENSES.txt'), licenses.join('\n\n--------------------\n\n'));
    // 服务器的 webpack 构建保留 chokidar 为外部依赖，由宿主插件安装和打包。
}

build().catch(error => {
    console.error('MATLAB 内置组件构建失败：', error);
    process.exitCode = 1;
});
