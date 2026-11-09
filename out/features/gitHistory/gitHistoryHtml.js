"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHistoryHtml = createHistoryHtml;
// 生成历史面板的静态骨架，提交内容通过消息传入，不拼接到 HTML 中。
const crypto_1 = require("crypto");
function createHistoryHtml(styleUri, scriptUri, cspSource) {
    const nonce = (0, crypto_1.randomBytes)(18).toString('base64');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>文件 Git 历史</title>
</head>
<body>
<header>
  <div class="toolbar">
    <input id="search" type="search" placeholder="搜索提交说明、作者、版本号或路径" aria-label="搜索已加载的提交">
    <button id="search-button">搜索</button>
    <span class="scope">当前分支主线</span>
    <select id="author" aria-label="按作者筛选"><option value="">所有作者</option></select>
    <button id="clear">清除</button>
    <button id="refresh">刷新</button>
    <span id="busy" role="status" aria-live="polite"></span>
  </div>
  <div class="context"><strong id="file-title">文件 Git 历史</strong><span id="repository"></span></div>
</header>
<div id="error" role="alert" hidden></div>
<main>
  <section class="history" aria-label="提交历史">
    <div id="commits" aria-label="提交列表"></div>
    <p id="empty" hidden></p>
    <div class="list-footer"><span id="count"></span><button id="more" hidden>加载更多提交</button></div>
  </section>
  <section class="details" aria-label="提交详情">
    <p id="select-hint">选择一条提交，查看详情或进行版本对比。</p>
    <div id="detail-content" hidden>
      <h2 id="subject"></h2>
      <p class="commit-meta"><span id="commit-author"></span><span id="commit-date"></span></p>
      <dl><dt>提交</dt><dd id="commit-hash"></dd><dt>文件</dt><dd id="commit-file"></dd><dt>上一版本</dt><dd id="commit-parent"></dd></dl>
      <div class="actions">
        <button data-action="open">查看历史版本</button>
        <button data-action="workspace">与当前文件对比</button>
        <button data-action="previous">与上一个版本对比</button>
        <button id="set-base">选为对比基准</button>
        <button id="compare" data-action="compare" disabled>与基准版本对比</button>
      </div>
    </div>
    <div id="baseline" hidden><span id="base-label"></span><button id="clear-base">清除基准</button></div>
  </section>
</main>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
//# sourceMappingURL=gitHistoryHtml.js.map