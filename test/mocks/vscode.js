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
        constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; }
    },
    EventEmitter: class EventEmitter {
        constructor() { this._listeners = []; }
        get event() { return (cb) => this._listeners.push(cb); }
        fire(v) { this._listeners.forEach(cb => cb(v)); }
    },
};
