'use strict';
import { window, TextEditorDecorationType, Range, QuickPickItem, Selection} from 'vscode';
import HighlightTreeProvider from './tree'

export interface Highlightable {
    expression: string
    wholeWord: boolean
    ignoreCase: boolean
}

export interface SearchLocation {
    index: number
    count: number
}

enum Modes {
    Default,
    WholeWord,
    IgnoreCase,
    Both
}    

const qpOptions = ['ignore case', 'whole word', 'both']

class Highlight {
    private words: Highlightable[]
    private decorators: TextEditorDecorationType[]
    private mode: number
    private treeProvider: HighlightTreeProvider
    private ranges: {}
    private treeRegistration

    constructor() {
        this.words = []
        this.decorators = []
        this.treeProvider = new HighlightTreeProvider(this.getWords());
        this.ranges = {}
        this.treeRegistration = window.registerTreeDataProvider('hilightWordsExplore', this.treeProvider);
    }

    public setMode(m) { this.mode = m }
    public getMode() { return this.mode }
    public getWords() { return this.words }
    // 2026/09/21 修改：更新配色时释放旧装饰器，扩展停止时释放树与事件。
    public setDecorators(d) {
        this.decorators.forEach(item => item.dispose())
        this.decorators = d
    }
    public dispose() {
        this.decorators.forEach(item => item.dispose())
        this.treeRegistration.dispose()
        this.treeProvider.dispose()
    }

    // 2026/09/21 新增：零长度正则推进游标，防止高亮和导航陷入无限循环。
    public getMatches(document, word): Range[] {
        const expression = word.wholeWord ? '\\b(?:' + word.expression + ')\\b' : word.expression
        const regex = new RegExp(expression, word.ignoreCase ? 'gi' : 'g')
        const text = document.getText()
        const ranges: Range[] = []
        let match
        while ((match = regex.exec(text)) !== null) {
            ranges.push(new Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length)))
            if (match[0].length === 0) regex.lastIndex += 1
        }
        return ranges
    }

    public navigate(node, direction: number) {
        const editor = window.activeTextEditor
        if (!editor || !node || !node.highlight) return
        const ranges = this.getMatches(editor.document, node.highlight)
        this.ranges[node.highlight.expression] = ranges
        if (!ranges.length) {
            this.getLocationIndex(node.highlight.expression, new Range(0, 0, 0, 0))
            return
        }
        const offset = editor.document.offsetAt(editor.selection.active)
        const range = direction > 0
            ? ranges.find(item => editor.document.offsetAt(item.start) > offset) || ranges[0]
            : ranges.slice().reverse().find(item => editor.document.offsetAt(item.start) < offset) || ranges[ranges.length - 1]
        editor.revealRange(range)
        editor.selection = new Selection(range.start, range.start)
        this.getLocationIndex(node.highlight.expression, range)
    }

    public getLocationIndex(expression: string, range: Range) {
        this.treeProvider.currentExpression = expression
        this.treeProvider.currentIndex = {index: 0, count: 0}
        Object.keys(this.ranges[expression] || []).some((r, i) => {
            const thisrange:Range = this.ranges[expression][i]
            if(thisrange.start.character == range.start.character && thisrange.start.line == range.start.line) {
                this.treeProvider.currentIndex = {index: i+1, count: this.ranges[expression].length}
                return true
            }
        })
        this.treeProvider.refresh()
    }

    public updateDecorations(active?) {
        this.treeProvider.words = this.words
        this.treeProvider.refresh()
        window.visibleTextEditors.forEach(editor => {
            if (active && editor.document != window.activeTextEditor.document) return;
            const text = editor.document.getText();
            let match;
            let decs = [];
            this.decorators.forEach(function () {
                let dec = [];
                decs.push(dec);
            });
            this.words.forEach((w, n) => {
                const ranges = this.getMatches(editor.document, w)
                if (editor === window.activeTextEditor) this.ranges[w.expression] = ranges
                if (decs.length) decs[n % decs.length] = decs[n % decs.length].concat(ranges)
            });
            this.decorators.forEach(function (d, i) {
                editor.setDecorations(d, decs[i]);
            });
            this.treeProvider.words = this.words
            this.treeProvider.refresh()

        })

    }

    public clearAll() {
        this.ranges = {}
        this.words = []
        this.updateDecorations()
    }

    public remove(word: QuickPickItem) {
        if (!word) return;
        if (word.label == '* All *') this.words = []
        else {
            const highlights = this.words.filter(w => w.expression == word.label)
            if (highlights && highlights.length) {
                this.words.splice(this.words.indexOf(highlights[0]), 1);
            }
        }
        this.updateDecorations();
    }

    public updateActive() {
        this.updateDecorations(true)
    }

    public updateOptions(word) {
        window.showQuickPick(["default"].concat(qpOptions)).then(option => {
            if (!option) return;

            const theword = this.words.map(w => w.expression).indexOf(word)
            if (theword === -1) return

            this.words[theword] = {
                expression: word,
                wholeWord: option == 'whole word' || option == 'both',
                ignoreCase: option == 'ignore case' || option == 'both'
            }
            this.updateDecorations()
        })
    }

    public addSelected(withOptions?: boolean) {
        const editor = window.activeTextEditor;
        if (!editor) return;
        let word = editor.document.getText(editor.selection);
        if(!word) {
            const range = editor.document.getWordRangeAtPosition(editor.selection.start)
            if(range) word = editor.document.getText(range)
        }
        if (!word) {
            window.showInformationMessage('Nothing selected!')
            return;
        }
        word = word.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1") // raw selected text, not regexp
        const highlights = this.words.filter(w => w.expression == word) // avoid duplicates
        if (!highlights || !highlights.length) {
            if (withOptions) {
                window.showQuickPick(qpOptions).then(option => {
                    if (!option) return;

                    this.words.push({
                        expression: word,
                        wholeWord: option == 'whole word' || option == 'both',
                        ignoreCase: option == 'ignore case' || option == 'both'
                    });
                    this.updateDecorations()
                })
            }
            else {
                const ww = this.mode == Modes.WholeWord || this.mode == Modes.Both
                const ic = this.mode == Modes.IgnoreCase || this.mode == Modes.Both
                
                this.words.push({ expression: word, wholeWord: ww, ignoreCase: ic });
                this.updateDecorations()
            }
        } else if(highlights.length) {
            this.words.splice(this.words.indexOf(highlights[0]),1)
            this.updateDecorations()
        }

    }

    public addRegExp(word: string) {
        // 2026/09/21 修改：取消输入时不创建表达式。
        if (!word) return;
        try {
            let opts = ''
            if (word.indexOf('/') == 0) {
                const slashes = word.split('/')
                opts = slashes[slashes.length - 1]
                word = word.slice(1, word.length - opts.length - 1)
            }
            new RegExp(word)
            const highlights = this.words.filter(w => w.expression == word)
            if (!highlights || !highlights.length) {
                this.words.push({
                    expression: word,
                    wholeWord: false,
                    ignoreCase: !!~opts.indexOf('i')
                });
                this.updateDecorations();
            }
        } catch (e) {
            window.showInformationMessage(word + ' is an invalid expression')
        }

    }
}

export default Highlight