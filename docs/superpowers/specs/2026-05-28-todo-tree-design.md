# TODO Tree 功能集成设计文档

> 版本：v1.0　日期：2026/05/28

---

## 背景

当前插件已具备 Verilog 相关的格式化、补全、语法检查等功能。本需求是在现有插件中集成 TODO 扫描树视图，参考 [todo-tree](https://github.com/Gruntfuggly/todo-tree) 的设计理念，扫描工作区所有文件中的标签注释（`TODO`、`FIXME` 等），在侧边栏以树视图展示并支持一键跳转。

目标用户：使用插件的所有开发者，不限于 FPGA 工程，可能包含 C/C++、Python 等大型代码库（万级文件）。

---

## 架构设计

### 目录结构

新增功能模块与 Verilog 功能平级：

```
src/features/todo/
├── todoConfig.ts       // 读取配置、构造 rg 参数
├── todoScanner.ts      // 调用 ripgrep 进程，解析 JSON 输出，返回 TodoItem[]
└── todoTreeProvider.ts // TreeDataProvider，按文件分组展示，处理点击跳转
```

`src/extension.ts` 新增 TODO 相关 Provider 的注册逻辑（约 15 行）。

---

## 数据模型

```typescript
interface TodoItem {
    file    : string;  // 绝对路径
    line    : number;  // 0-based 行号
    tag     : string;  // "TODO" | "FIXME" | "NOTE" | "HACK" | 用户自定义
    text    : string;  // 标签后的注释内容（已 trim）
}
```

---

## 各模块设计

### todoConfig.ts

- 读取 `vscode.workspace.getConfiguration('verilogFormatter.todo')` 中的 `tags` 和 `excludePatterns`
- 提供 `buildRgArgs(tags, excludePatterns): string[]` 函数，返回传给 rg 的参数列表

### todoScanner.ts

- `scan(workspaceFolders: string[], config: TodoConfig): Promise<TodoItem[]>`：全量扫描
- `scanFile(filePath: string, config: TodoConfig): Promise<TodoItem[]>`：单文件扫描，供增量更新使用
- 使用 `@vscode/ripgrep` 获取 rg 二进制路径
- 调用 rg 参数：`-n --json --no-heading -e <pattern>`，pattern 为标签的正则，例：`(TODO|FIXME|NOTE|HACK)[\s:：]`
- 流式解析 rg 的 NDJSON 输出（每行一个 JSON 对象），过滤 `type === "match"` 的记录
- 返回扁平 `TodoItem[]`，调用方负责分组

### todoTreeProvider.ts

实现 `vscode.TreeDataProvider<TodoTreeNode>`：

- **根节点**：每个包含 TODO 的文件，标签格式 `filename (N)`，图标 `$(file)`
- **子节点**：每条 TODO，标签格式 `[TAG] 注释内容`，描述为行号，图标按 tag 类型区分：
  - TODO → `$(circle-outline)`（蓝色）
  - FIXME → `$(error)`（红色）
  - NOTE → `$(info)`（绿色）
  - HACK → `$(warning)`（黄色）
  - 自定义 → `$(tag)`
- 点击子节点：`vscode.open` 跳转到对应文件行

触发刷新的时机：
1. 插件激活时全量扫描一次
2. `onDidSaveTextDocument`：仅重新扫描该文件（增量更新）
3. `onDidDeleteFiles` / `onDidCreateFiles`：触发全量重扫
4. 命令 `verilogFormatter.todo.refresh`：手动刷新

---

## 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `verilogFormatter.todo.tags` | `string[]` | `["TODO","FIXME","NOTE","HACK"]` | 要扫描的标签关键字 |
| `verilogFormatter.todo.excludePatterns` | `string[]` | `["**/node_modules/**","**/.git/**","**/out/**"]` | 排除的 glob 模式 |
| `verilogFormatter.todo.showInStatusBar` | `boolean` | `true` | 状态栏显示 TODO 总计数 |

---

## 依赖变更

新增依赖：
- `@vscode/ripgrep`：提供各平台的 rg 二进制路径

安装：`npm install @vscode/ripgrep`

---

## package.json 变更

1. `dependencies` 新增 `@vscode/ripgrep`
2. `contributes.configuration` 新增 3 个配置项
3. `contributes.views` 在 `explorer` 下新增 `verilogFormatter.todoView`（侧边栏面板）
4. `contributes.commands` 新增手动刷新命令 `verilogFormatter.todo.refresh`
5. `activationEvents` 无需额外添加（已有 `onStartupFinished`）

---

## 不在本次范围内

- 行内高亮装饰（inline decoration）
- Badge 计数（activity bar badge）
- 按 tag 类型过滤视图
- 多工作区 multi-root 支持（首期只扫描第一个工作区文件夹）
