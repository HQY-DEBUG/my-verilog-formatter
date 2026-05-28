// =========================================================================
// 文件    : todoStatusBar.ts
// 描述    : 状态栏 TODO 计数，点击后 reveal 树视图
// 版本    : v1.0
// 日期    : 2026/05/28
//
// 修改记录（最新版本在最前）:
//  ver      date        modification
// ------   ----------  ---------------------------------------------------
//  v1.0    26/05/28    创建文件
// =========================================================================

import * as vscode from 'vscode';
import { getTodoConfig } from './todoConfig';

export class TodoStatusBar {
    private item: vscode.StatusBarItem;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.command = 'verilogFormatter.todo.refresh';
        this.item.tooltip = '点击刷新 TODO 列表';
    }

    update(count: number): void {
        const cfg = getTodoConfig();
        if (!cfg.showInStatusBar) {
            this.item.hide();
            return;
        }
        this.item.text    = `$(check) TODO: ${count}`;
        this.item.show();
    }

    dispose(): void { this.item.dispose(); }
}
