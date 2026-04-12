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
exports.fetchEditPoint = fetchEditPoint;
const vscode = __importStar(require("vscode"));
const util_1 = require("./util");
function fetchEditPoint(direction) {
    if (!(0, util_1.validate)() || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const newSelections = [];
    editor.selections.forEach(selection => {
        const updatedSelection = direction === 'next' ? nextEditPoint(selection, editor) : prevEditPoint(selection, editor);
        newSelections.push(updatedSelection);
    });
    editor.selections = newSelections;
    editor.revealRange(editor.selections[editor.selections.length - 1]);
}
function nextEditPoint(selection, editor) {
    for (let lineNum = selection.anchor.line; lineNum < editor.document.lineCount; lineNum++) {
        const updatedSelection = findEditPoint(lineNum, editor, selection.anchor, 'next');
        if (updatedSelection) {
            return updatedSelection;
        }
    }
    return selection;
}
function prevEditPoint(selection, editor) {
    for (let lineNum = selection.anchor.line; lineNum >= 0; lineNum--) {
        const updatedSelection = findEditPoint(lineNum, editor, selection.anchor, 'prev');
        if (updatedSelection) {
            return updatedSelection;
        }
    }
    return selection;
}
function findEditPoint(lineNum, editor, position, direction) {
    const line = editor.document.lineAt(lineNum);
    let lineContent = line.text;
    if (lineNum !== position.line && line.isEmptyOrWhitespace && lineContent.length) {
        return new vscode.Selection(lineNum, lineContent.length, lineNum, lineContent.length);
    }
    if (lineNum === position.line && direction === 'prev') {
        lineContent = lineContent.substr(0, position.character);
    }
    const emptyAttrIndex = direction === 'next' ? lineContent.indexOf('""', lineNum === position.line ? position.character : 0) : lineContent.lastIndexOf('""');
    const emptyTagIndex = direction === 'next' ? lineContent.indexOf('><', lineNum === position.line ? position.character : 0) : lineContent.lastIndexOf('><');
    let winner = -1;
    if (emptyAttrIndex > -1 && emptyTagIndex > -1) {
        winner = direction === 'next' ? Math.min(emptyAttrIndex, emptyTagIndex) : Math.max(emptyAttrIndex, emptyTagIndex);
    }
    else if (emptyAttrIndex > -1) {
        winner = emptyAttrIndex;
    }
    else {
        winner = emptyTagIndex;
    }
    if (winner > -1) {
        return new vscode.Selection(lineNum, winner + 1, lineNum, winner + 1);
    }
    return;
}
//# sourceMappingURL=editPoint.js.map