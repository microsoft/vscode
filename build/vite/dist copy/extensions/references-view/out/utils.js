"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordAnchor = exports.ContextKey = void 0;
exports.del = del;
exports.tail = tail;
exports.asResourceUrl = asResourceUrl;
exports.isValidRequestPosition = isValidRequestPosition;
exports.getPreviewChunks = getPreviewChunks;
exports.getThemeIcon = getThemeIcon;
const vscode = __importStar(require("vscode"));
function del(array, e) {
    const idx = array.indexOf(e);
    if (idx >= 0) {
        array.splice(idx, 1);
    }
}
function tail(array) {
    return array[array.length - 1];
}
function asResourceUrl(uri, range) {
    return uri.with({ fragment: `L${1 + range.start.line},${1 + range.start.character}-${1 + range.end.line},${1 + range.end.character}` });
}
async function isValidRequestPosition(uri, position) {
    const doc = await vscode.workspace.openTextDocument(uri);
    let range = doc.getWordRangeAtPosition(position);
    if (!range) {
        range = doc.getWordRangeAtPosition(position, /[^\s]+/);
    }
    return Boolean(range);
}
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
class ContextKey {
    name;
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
    _doc;
    _position;
    _version;
    _word;
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
const _themeIconColorIds = [
    'symbolIcon.fileForeground', 'symbolIcon.moduleForeground', 'symbolIcon.namespaceForeground', 'symbolIcon.packageForeground', 'symbolIcon.classForeground', 'symbolIcon.methodForeground',
    'symbolIcon.propertyForeground', 'symbolIcon.fieldForeground', 'symbolIcon.constructorForeground', 'symbolIcon.enumeratorForeground', 'symbolIcon.interfaceForeground',
    'symbolIcon.functionForeground', 'symbolIcon.variableForeground', 'symbolIcon.constantForeground', 'symbolIcon.stringForeground', 'symbolIcon.numberForeground', 'symbolIcon.booleanForeground',
    'symbolIcon.arrayForeground', 'symbolIcon.objectForeground', 'symbolIcon.keyForeground', 'symbolIcon.nullForeground', 'symbolIcon.enumeratorMemberForeground', 'symbolIcon.structForeground',
    'symbolIcon.eventForeground', 'symbolIcon.operatorForeground', 'symbolIcon.typeParameterForeground'
];
function getThemeIcon(kind) {
    const id = _themeIconIds[kind];
    const color = new vscode.ThemeColor(_themeIconColorIds[kind]);
    return id ? new vscode.ThemeIcon(id, color) : undefined;
}
//# sourceMappingURL=utils.js.map