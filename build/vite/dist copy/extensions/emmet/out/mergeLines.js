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
exports.mergeLines = mergeLines;
const vscode = __importStar(require("vscode"));
const util_1 = require("./util");
const parseDocument_1 = require("./parseDocument");
function mergeLines() {
    if (!(0, util_1.validate)(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const rootNode = (0, parseDocument_1.getRootNode)(editor.document, true);
    if (!rootNode) {
        return;
    }
    return editor.edit(editBuilder => {
        Array.from(editor.selections).reverse().forEach(selection => {
            const textEdit = getRangesToReplace(editor.document, selection, rootNode);
            if (textEdit) {
                editBuilder.replace(textEdit.range, textEdit.newText);
            }
        });
    });
}
function getRangesToReplace(document, selection, rootNode) {
    let startNodeToUpdate;
    let endNodeToUpdate;
    const selectionStart = document.offsetAt(selection.start);
    const selectionEnd = document.offsetAt(selection.end);
    if (selection.isEmpty) {
        startNodeToUpdate = endNodeToUpdate = (0, util_1.getFlatNode)(rootNode, selectionStart, true);
    }
    else {
        startNodeToUpdate = (0, util_1.getFlatNode)(rootNode, selectionStart, true);
        endNodeToUpdate = (0, util_1.getFlatNode)(rootNode, selectionEnd, true);
    }
    if (!startNodeToUpdate || !endNodeToUpdate) {
        return;
    }
    const startPos = document.positionAt(startNodeToUpdate.start);
    const startLine = startPos.line;
    const startChar = startPos.character;
    const endPos = document.positionAt(endNodeToUpdate.end);
    const endLine = endPos.line;
    if (startLine === endLine) {
        return;
    }
    const rangeToReplace = (0, util_1.offsetRangeToVsRange)(document, startNodeToUpdate.start, endNodeToUpdate.end);
    let textToReplaceWith = document.lineAt(startLine).text.substr(startChar);
    for (let i = startLine + 1; i <= endLine; i++) {
        textToReplaceWith += document.lineAt(i).text.trim();
    }
    return new vscode.TextEdit(rangeToReplace, textToReplaceWith);
}
//# sourceMappingURL=mergeLines.js.map