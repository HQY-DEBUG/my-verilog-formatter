// 面板只发送已加载提交的标识；Git 查询和文件操作由扩展宿主执行。
(() => {
    const vscode = acquireVsCodeApi();
    const saved = vscode.getState() || {};
    const element = id => document.getElementById(id);
    let commits = [];
    let selectedHash = saved.selectedHash || '';
    let baseHash = saved.baseHash || '';
    let busy = false;
    let hasMore = false;
    let visible = [];
    let authorFilter = saved.author || '';
    element('search').value = saved.search || '';

    function persist() {
        vscode.setState({ selectedHash, baseHash, search: element('search').value, author: element('author').value });
    }

    function updateControls() {
        document.querySelectorAll('button').forEach(button => { button.disabled = busy; });
        element('author').disabled = busy;
        element('compare').disabled = busy || !selectedHash || !baseHash || baseHash === selectedHash;
        element('more').hidden = !hasMore;
        element('busy').textContent = busy ? '正在读取…' : '';
    }

    function renderDetails() {
        const commit = commits.find(item => item.hash === selectedHash);
        element('detail-content').hidden = !commit;
        element('select-hint').hidden = Boolean(commit);
        if (commit) {
            element('subject').textContent = commit.subject;
            element('commit-author').textContent = commit.author;
            element('commit-date').textContent = commit.date.replace('T', ' ');
            element('commit-hash').textContent = commit.hash;
            element('commit-file').textContent = commit.filePath + (commit.deleted ? '（已删除）' : '');
            element('commit-parent').textContent = commit.previous ? commit.previous.hash : '空文件（首次添加前）';
        }
        const base = commits.find(item => item.hash === baseHash);
        element('baseline').hidden = !base;
        element('base-label').textContent = base ? '对比基准：' + base.hash.slice(0, 8) + ' · ' + base.subject : '';
        updateControls();
    }

    function select(hash) {
        selectedHash = hash;
        document.querySelectorAll('.commit').forEach(row => row.setAttribute('aria-pressed', String(row.dataset.hash === hash)));
        renderDetails();
        persist();
    }

    function renderList() {
        const query = element('search').value.trim().toLocaleLowerCase();
        const author = element('author').value;
        authorFilter = author;
        visible = commits.filter(commit => (!author || commit.author === author)
            && [commit.subject, commit.author, commit.hash, commit.date, commit.filePath].join(' ').toLocaleLowerCase().includes(query));
        const list = element('commits');
        list.replaceChildren();
        for (const commit of visible) {
            const row = document.createElement('button');
            row.className = 'commit';
            row.dataset.hash = commit.hash;
            row.setAttribute('aria-pressed', String(commit.hash === selectedHash));
            const graph = document.createElement('span');
            graph.className = 'graph'; graph.setAttribute('aria-hidden', 'true');
            const main = document.createElement('span'); main.className = 'commit-main';
            const subject = document.createElement('span'); subject.className = 'commit-subject'; subject.textContent = commit.subject;
            const info = document.createElement('span'); info.className = 'commit-info';
            info.textContent = commit.author + ' · ' + commit.date.replace('T', ' ') + (commit.deleted ? ' · 已删除' : '');
            const hash = document.createElement('span'); hash.className = 'hash'; hash.textContent = commit.hash.slice(0, 8);
            main.append(subject, info); row.append(graph, main, hash);
            row.title = commit.subject + '\n' + commit.filePath;
            row.addEventListener('click', () => select(commit.hash));
            row.addEventListener('dblclick', () => sendAction('open'));
            list.append(row);
        }
        element('empty').hidden = visible.length > 0;
        element('empty').textContent = commits.length ? '没有匹配的提交，可清除筛选或加载更多记录。' : '该文件没有提交历史，可能尚未提交或仓库尚无提交。';
        element('count').textContent = '显示 ' + visible.length + ' / 已加载 ' + commits.length + ' 条提交';
        if (!visible.some(commit => commit.hash === selectedHash)) { selectedHash = visible[0]?.hash || ''; }
        select(selectedHash);
    }

    function sendAction(action) {
        if (busy || !selectedHash) { return; }
        vscode.postMessage({ type: 'action', action, hash: selectedHash, baseHash });
    }

    element('search-button').addEventListener('click', renderList);
    element('search').addEventListener('input', renderList);
    element('search').addEventListener('keydown', event => {
        if (event.key === 'Escape') { element('search').value = ''; renderList(); }
    });
    element('author').addEventListener('change', renderList);
    element('clear').addEventListener('click', () => { element('search').value = ''; element('author').value = ''; renderList(); });
    element('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    element('more').addEventListener('click', () => vscode.postMessage({ type: 'more' }));
    document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => sendAction(button.dataset.action)));
    element('set-base').addEventListener('click', () => { baseHash = selectedHash; renderDetails(); persist(); });
    element('clear-base').addEventListener('click', () => { baseHash = ''; renderDetails(); persist(); });
    element('commits').addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || busy || !visible.length) { return; }
        event.preventDefault();
        let index = visible.findIndex(commit => commit.hash === selectedHash);
        if (event.key === 'Home') { index = 0; }
        else if (event.key === 'End') { index = visible.length - 1; }
        else { index += event.key === 'ArrowDown' ? 1 : -1; }
        index = Math.max(0, Math.min(visible.length - 1, index));
        select(visible[index].hash);
        element('commits').children[index].focus();
    });

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'busy') { busy = message.value; updateControls(); }
        else if (message.type === 'error') { element('error').textContent = message.message; element('error').hidden = false; }
        else if (message.type === 'history') {
            commits = message.commits;
            hasMore = message.hasMore;
            element('error').hidden = true;
            element('file-title').textContent = message.fileName;
            element('repository').textContent = message.repositoryRoot;
            const author = authorFilter;
            element('author').replaceChildren(new Option('所有作者', ''));
            for (const name of [...new Set(commits.map(commit => commit.author))]) { element('author').add(new Option(name, name)); }
            element('author').value = [...element('author').options].some(option => option.value === author) ? author : '';
            if (!commits.some(commit => commit.hash === baseHash)) { baseHash = ''; }
            renderList();
        }
    });
    vscode.postMessage({ type: 'ready' });
})();
