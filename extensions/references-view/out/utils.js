"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThemeIcon = exports.WordAnchor = exports.ContextKey = exports.getPreviewChunks = exports.isValidRequestPosition = exports.asResourceUrl = exports.tail = exports.del = void 0;
const vscode = require("vscode");
function del(array, e) {
    const idx = array.indexOf(e);
    if (idx >= 0) {
        array.splice(idx, 1);
    }
}
exports.del = del;
function tail(array) {
    return array[array.length - 1];
}
exports.tail = tail;
function asResourceUrl(uri, range) {
    return uri.with({ fragment: `L${1 + range.start.line},${1 + range.start.character}-${1 + range.end.line},${1 + range.end.character}` });
}
exports.asResourceUrl = asResourceUrl;
async function isValidRequestPosition(uri, position) {
    const doc = await vscode.workspace.openTextDocument(uri);
    let range = doc.getWordRangeAtPosition(position);
    if (!range) {
        range = doc.getWordRangeAtPosition(position, /[^\s]+/);
    }
    return Boolean(range);
}
exports.isValidRequestPosition = isValidRequestPosition;
function getPreviewChunks(doc, range, beforeLen = 8, trim = true) {
    const previewStart = range.start.with({ character: Math.max(0, range.start.character - beforeLen) });
    const wordRange = doc.getWordRangeAtPosition(previewStart);
    let before = doc.getText(new vscode.Range(wordRange ? wordRange.start : previewStart, range.start));
    const inside = doc.getText(range);
    const previewEnd = range.end.translate(0, 331);
    let after = doc.getText(new vscode.Range(range.end, previewEnd));
    if (trim) {
        before = before.replace(/^\s*/g, '');
        after = after.replace(/\s*$/g, '');
    }
    return { before, inside, after };
}
exports.getPreviewChunks = getPreviewChunks;
class ContextKey {
    constructor(name) {
        this.name = name;
    }
    async set(value) {
        await vscode.commands.executeCommand('setContext', this.name, value);
    }
    async reset() {
        await vscode.commands.executeCommand('setContext', this.name, undefined);
    }
}
exports.ContextKey = ContextKey;
class WordAnchor {
    constructor(_doc, _position) {
        this._doc = _doc;
        this._position = _position;
        this._version = _doc.version;
        this._word = this._getAnchorWord(_doc, _position);
    }
    _getAnchorWord(doc, pos) {
        const range = doc.getWordRangeAtPosition(pos) || doc.getWordRangeAtPosition(pos, /[^\s]+/);
        return range && doc.getText(range);
    }
    guessedTrackedPosition() {
        // funky entry
        if (!this._word) {
            return this._position;
        }
        // no changes
        if (this._version === this._doc.version) {
            return this._position;
        }
        // no changes here...
        const wordNow = this._getAnchorWord(this._doc, this._position);
        if (this._word === wordNow) {
            return this._position;
        }
        // changes: search _word downwards and upwards
        const startLine = this._position.line;
        let i = 0;
        let line;
        let checked;
        do {
            checked = false;
            // nth line down
            line = startLine + i;
            if (line < this._doc.lineCount) {
                checked = true;
                const ch = this._doc.lineAt(line).text.indexOf(this._word);
                if (ch >= 0) {
                    return new vscode.Position(line, ch);
                }
            }
            i += 1;
            // nth line up
            line = startLine - i;
            if (line >= 0) {
                checked = true;
                const ch = this._doc.lineAt(line).text.indexOf(this._word);
                if (ch >= 0) {
                    return new vscode.Position(line, ch);
                }
            }
        } while (i < 100 && checked);
        // fallback
        return this._position;
    }
}
exports.WordAnchor = WordAnchor;
// vscode.SymbolKind.File === 0, Module === 1, etc...
const _themeIconIds = [
    'symbol-file', 'symbol-module', 'symbol-namespace', 'symbol-package', 'symbol-class', 'symbol-method',
    'symbol-property', 'symbol-field', 'symbol-constructor', 'symbol-enum', 'symbol-interface',
    'symbol-function', 'symbol-variable', 'symbol-constant', 'symbol-string', 'symbol-number', 'symbol-boolean',
    'symbol-array', 'symbol-object', 'symbol-key', 'symbol-null', 'symbol-enum-member', 'symbol-struct',
    'symbol-event', 'symbol-operator', 'symbol-type-parameter'
];
function getThemeIcon(kind) {
    const id = _themeIconIds[kind];
    return id ? new vscode.ThemeIcon(id) : undefined;
}
exports.getThemeIcon = getThemeIcon;
//# sourceMappingURL=utils.js.map