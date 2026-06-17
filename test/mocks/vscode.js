module.exports = {
    workspace: {
        getConfiguration: (scope) => {
            return {
                get: (key, defaultValue) => defaultValue,
            };
        },
        workspaceFolders: undefined,
    },
    TreeItem: class TreeItem {
        constructor(label, collapsibleState) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } },
    ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
    Uri: {
        file: (p) => ({ fsPath: p, scheme: 'file', path: p }),
    },
    Range: class Range {
        constructor(sl, sc, el, ec) {
            if (typeof sl === 'object' && typeof sc === 'object') {
                this.start = sl;
                this.end = sc;
            } else {
                this.start = { line: sl, character: sc };
                this.end = { line: el, character: ec };
            }
        }
    },
    DocumentSymbol: class DocumentSymbol {
        constructor(name, detail, kind, range, selectionRange) {
            const afterStart = selectionRange.start.line > range.start.line
                || (selectionRange.start.line === range.start.line && selectionRange.start.character >= range.start.character);
            const beforeEnd = selectionRange.end.line < range.end.line
                || (selectionRange.end.line === range.end.line && selectionRange.end.character <= range.end.character);
            if (!afterStart || !beforeEnd) {
                throw new Error('selectionRange must be contained in fullRange');
            }
            this.name = name;
            this.detail = detail;
            this.kind = kind;
            this.range = range;
            this.selectionRange = selectionRange;
            this.children = [];
        }
    },
    SymbolKind: { Module: 1, Field: 2, Constant: 3, Variable: 4, Object: 5 },
    EventEmitter: class EventEmitter {
        constructor() { this._listeners = []; }
        get event() { return (cb) => this._listeners.push(cb); }
        fire(v) { this._listeners.forEach(cb => cb(v)); }
    },
};
