// 校验并解包随插件分发的固定版本 clangd。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function build() {
    const root = path.resolve(__dirname, '..');
    const archive = path.join(root, 'vendor/clangd/clangd-windows-23.1.0.zip');
    const output = path.join(root, 'out/clangd');
    const executable = path.join(output, 'clangd_23.1.0/bin/clangd.exe');
    const stamp = path.join(output, 'clangd_23.1.0/.verified-sha256');
    const expected = '23412a240756a162e7b98a282f36aa2a23a88db5ce16a0cbc4fef7253768c810';
    const actual = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (actual !== expected) { throw new Error('clangd 安装包校验失败'); }
    if (fs.existsSync(executable) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === expected) { return; }
    fs.mkdirSync(output, { recursive: true });
    execFileSync('tar', ['-xf', archive, '-C', output], { stdio: 'inherit', windowsHide: true });
    if (!fs.existsSync(executable)) { throw new Error('clangd 安装包缺少可执行文件'); }
    fs.writeFileSync(stamp, expected);
}

try {
    build();
} catch (error) {
    console.error('构建内置 clangd 失败：', error);
    process.exitCode = 1;
}
