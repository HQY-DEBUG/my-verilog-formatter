# TODO Tree 功能集成设计文档

> 版本：v2.0　日期：2026/05/28

---

## 背景

当前插件已具备 Verilog 相关的格式化、补全、语法检查等功能。本需求在现有插件中集成 TODO 扫描功能，**对齐 todo-tree 插件的主要能力**，扫描工作区所有文件中的标签注释（`TODO`、`FIXME` 等），在侧边栏以树视图展示并支持多种操作。

目标用户：使用插件的所有开发者，不限于 FPGA 工程，可能包含 C/C++、Python 等大型代码库（万级文件）。

---

## 架构设计

### 目录结构

```
src/features/todo/
├── todoConfig.ts         // 读取配置、构造 rg 参数、定义 TagConfig
├── todoScanner.ts        // 调用 ripgrep，解析 NDJSON，返回 TodoItem[]
├── todoTreeProvider.ts   // TreeDataProvider：树/平铺/Tag 分组三种视图
├── todoDecorator.ts      // 行内高亮装饰器（editor decoration + gutter icon）
└── todoStatusBar.ts      // 状态栏计数 + Activity Bar badge
```

`src/extension.ts` 新增 TODO 注册逻辑。

---

## 数据模型

```typescript
interface TodoItem {
    file    : string;   // 绝对路径
    line    : number;   // 0-based 行号
    col     : number;   // 0-based 列号
    tag     : string;   // "TODO" | "FIXME" | ...
    text    : string;   // 标签后注释内容（已 trim）
}

interface TagConfig {
    icon        : string;   // codicon 名称，如 "$(error)"
    iconColour  : string;   // 图标颜色（CSS 颜色值）
    foreground  : string;   // 行内高亮前景色
    background  : string;   // 行内高亮背景色
    gutterIcon  : boolean;  // 是否显示 gutter 图标
    rulerColour : string;   // overview ruler 颜色
}
```

---

## 各模块设计

### todoConfig.ts

- 读取 `vscode.workspace.getConfiguration('verilogFormatter.todo')`
- 提供 `getConfig(): TodoConfig` 返回合并后配置
- 提供 `buildRgArgs(config): string[]` 构造 ripgrep 参数

### todoScanner.ts

- `scan(workspaceFolders: string[], config: TodoConfig): Promise<TodoItem[]>`：全量扫描
- `scanFile(filePath: string, config: TodoConfig): Promise<TodoItem[]>`：单文件扫描（增量更新）
- 使用 `@vscode/ripgrep` 获取 rg 二进制
- rg 参数：`-n --json -e <pattern>`，pattern 示例：`\b(TODO|FIXME|NOTE|HACK)\b[\s:：]?`
- 流式解析 rg NDJSON 输出，过滤 `type === "match"` 记录

### todoTreeProvider.ts

实现 `vscode.TreeDataProvider<TodoTreeNode>`，支持三种视图模式（工具栏切换）：

1. **树视图**（默认）：工作区文件夹 → 子文件夹 → 文件 → TODO 条目，按层级折叠
2. **平铺列表**：无层级，每行 = `文件名 行号 内容`
3. **Tag 分组**：一级节点为 Tag 类型（TODO/FIXME/...），二级节点为具体条目

**工具栏按钮**（viewToolbar）：
- 折叠全部 / 展开全部
- 树视图 / 平铺 / Tag 分组切换
- 刷新
- 文本过滤（输入框过滤，匹配文件名或注释内容）

**右键菜单**：
- 隐藏此文件夹 / 只显示此文件夹
- 重置文件夹过滤

**节点图标**按 TagConfig 配置渲染（codicon + 颜色）。

点击叶节点：`vscode.open` 跳转到对应文件行。

**刷新触发时机**：
1. 激活时全量扫描
2. `onDidSaveTextDocument`：增量重扫该文件
3. `onDidDeleteFiles` / `onDidCreateFiles`：全量重扫
4. 命令 `verilogFormatter.todo.refresh`：手动刷新

### todoDecorator.ts

- 监听 `onDidChangeActiveTextEditor` 和 `onDidChangeTextEditorVisibleRanges`
- 对当前编辑器中匹配的 TODO 行应用 `vscode.TextEditorDecorationType`：
  - 行内背景色 / 前景色（来自 TagConfig）
  - Gutter 图标（若 `gutterIcon: true`）
  - Overview Ruler 标记
- 高亮类型：`tag`（仅标签）/ `text`（标签+注释）/ `line`（整行），通过 `defaultHighlight.type` 配置

### todoStatusBar.ts

- 状态栏左侧显示 `$(check) TODO: N`，点击后 reveal 树视图
- 若 N = 0，状态栏隐藏（可配置）

---

## 命令列表

| 命令 ID | 说明 |
|---------|------|
| `verilogFormatter.todo.refresh` | 手动刷新全量扫描 |
| `verilogFormatter.todo.addTag` | 快速添加自定义 Tag |
| `verilogFormatter.todo.removeTag` | 快速删除 Tag |
| `verilogFormatter.todo.goToNext` | 跳到当前文件下一个 TODO |
| `verilogFormatter.todo.goToPrevious` | 跳到当前文件上一个 TODO |
| `verilogFormatter.todo.setViewFlat` | 切换为平铺视图 |
| `verilogFormatter.todo.setViewTree` | 切换为树视图 |
| `verilogFormatter.todo.setViewTags` | 切换为 Tag 分组视图 |
| `verilogFormatter.todo.toggleGroupByTag` | 切换按 Tag 分组 |
| `verilogFormatter.todo.filterClear` | 清除文本过滤 |

---

## 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `verilogFormatter.todo.tags` | `string[]` | `["TODO","FIXME","NOTE","HACK"]` | 扫描的标签关键字 |
| `verilogFormatter.todo.excludePatterns` | `string[]` | `["**/node_modules/**","**/.git/**","**/out/**"]` | 排除的 glob |
| `verilogFormatter.todo.showInStatusBar` | `boolean` | `true` | 状态栏显示计数 |
| `verilogFormatter.todo.defaultHighlight` | `object` | 见下 | 所有 Tag 的默认高亮配置 |
| `verilogFormatter.todo.customHighlight` | `object` | 见下 | 各 Tag 的个性化高亮配置 |
| `verilogFormatter.todo.highlightEnabled` | `boolean` | `true` | 是否启用行内高亮 |

**默认 customHighlight 值**：
```jsonc
{
  "TODO":  { "icon": "$(circle-outline)", "iconColour": "#3794FF", "foreground": "#3794FF", "gutterIcon": false },
  "FIXME": { "icon": "$(error)",          "iconColour": "#F44747", "foreground": "#F44747", "gutterIcon": false },
  "NOTE":  { "icon": "$(info)",           "iconColour": "#4EC9B0", "foreground": "#4EC9B0", "gutterIcon": false },
  "HACK":  { "icon": "$(warning)",        "iconColour": "#CE9178", "foreground": "#CE9178", "gutterIcon": false }
}
```

---

## 依赖变更

```
npm install @vscode/ripgrep
```

---

## package.json 变更

1. `dependencies` 新增 `@vscode/ripgrep`
2. `contributes.configuration` 新增配置项（tags、excludePatterns、highlight 系列）
3. `contributes.views` 新增 `verilogFormatter.todoView`（explorer 侧边栏）
4. `contributes.menus` 新增 `view/title`（工具栏按钮）和 `view/item/context`（右键菜单）
5. `contributes.commands` 新增 9 个命令
6. `contributes.keybindings` 新增 `goToNext` / `goToPrevious`（无默认快捷键，用户可自行绑定）

---

## 不在本次范围内

- 导出 TODO 列表到文件
- Git 自动轮询刷新（git HEAD 变化）
- Sub-tag 支持
- 多 workspace root 支持（首期只扫第一个）
- capture-groups 高亮类型
