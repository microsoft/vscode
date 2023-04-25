"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//My additions:
//(1): adding Deque by putting abstraction over array type
//(2): using Deque object to keep track of how many we have currently highlighted
class Deque {
    constructor() {this.items = [];}

    addFront(element) {this.items.unshift(element);} // adding elements to the front in O(1)

    addBack(element) {this.items.push(element);} // adding elements to the back in O(1)
  
    removeFront() { // removing elements from the front in O(1)
      if (this.isEmpty()) {return null;}
      return this.items.shift();}
  
    removeBack() {// removing elements from the back in O(1)
      if (this.isEmpty()) {return null;}
      return this.items.pop();}
  
    peekFront() {// returning element at the front in O(1)
      if (this.isEmpty()) {return null;}
      return this.items[0];}
  
    peekBack() {// returning element at the back in O(1)
      if (this.isEmpty()) {return null;}
      return this.items[this.items.length - 1];}

    size() {return this.items.length;} //returning size in O(1)
}


const MAX_HIGHLIGHTS = 999; // Max # of highlights to keep track of

const highlightsDeque = new Deque();

Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorHighlights = void 0;
const vscode = require("vscode");
class EditorHighlights {
    constructor(_view, _delegate) {
        this._view = _view;
        this._delegate = _delegate;
        this._decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            overviewRulerLane: vscode.OverviewRulerLane.Center,
            overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        });
        this.disposables = [];
        this._ignore = new Set();
        // If we already have 999 highlights, remove the oldest one
        if (highlightsDeque.size() === MAX_HIGHLIGHTS) {
            const removedHighlight = highlightsDeque.removeFront();
            editor.setDecorations(removedHighlight.decorationType, []);
            highlightsDeque.addBack({ text, decorationType }); // adding new highlight match to end of deque
        }
        //need to change following line to reflect pushing only from deque
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => this._ignore.add(e.document.uri.toString())), vscode.window.onDidChangeActiveTextEditor(() => _view.visible && this.update()), _view.onDidChangeVisibility(e => e.visible ? this._show() : this._hide()), _view.onDidChangeSelection(() => _view.visible && this.update()));
        this._show();
    }
    dispose() {
        vscode.Disposable.from(...this.disposables).dispose();
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this._decorationType, []);
        }
    }
    _show() {
        const { activeTextEditor: editor } = vscode.window;
        if (!editor || !editor.viewColumn) {
            return;
        }
        if (this._ignore.has(editor.document.uri.toString())) {
            return;
        }
        const [anchor] = this._view.selection;
        if (!anchor) {
            return;
        }
        const ranges = this._delegate.getEditorHighlights(anchor, editor.document.uri);
        if (ranges) {
            editor.setDecorations(this._decorationType, ranges);
        }
    }
    _hide() {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this._decorationType, []);
        }
    }
    update() {
        this._hide();
        this._show();
    }
}
exports.EditorHighlights = EditorHighlights;
//# sourceMappingURL=highlights.js.map