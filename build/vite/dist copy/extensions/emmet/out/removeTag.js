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
exports.removeTag = removeTag;
const vscode = __importStar(require("vscode"));
const parseDocument_1 = require("./parseDocument");
const util_1 = require("./util");
function removeTag() {
    if (!(0, util_1.validate)(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const document = editor.document;
    const rootNode = (0, parseDocument_1.getRootNode)(document, true);
    if (!rootNode) {
        return;
    }
    const finalRangesToRemove = Array.from(editor.selections).reverse()
        .reduce((prev, selection) => prev.concat(getRangesToRemove(editor.document, rootNode, selection)), []);
    return editor.edit(editBuilder => {
        finalRangesToRemove.forEach(range => {
            editBuilder.delete(range);
        });
    });
}
/**
 * Calculates the ranges to remove, along with what to replace those ranges with.
 * It finds the node to remove based on the selection's start position
 * and then removes that node, reindenting the content in between.
 */
function getRangesToRemove(document, rootNode, selection) {
    const offset = document.offsetAt(selection.start);
    const nodeToUpdate = (0, util_1.getHtmlFlatNode)(document.getText(), rootNode, offset, true);
    if (!nodeToUpdate) {
        return [];
    }
    let openTagRange;
    if (nodeToUpdate.open) {
        openTagRange = (0, util_1.offsetRangeToVsRange)(document, nodeToUpdate.open.start, nodeToUpdate.open.end);
    }
    let closeTagRange;
    if (nodeToUpdate.close) {
        closeTagRange = (0, util_1.offsetRangeToVsRange)(document, nodeToUpdate.close.start, nodeToUpdate.close.end);
    }
    if (openTagRange && closeTagRange) {
        const innerCombinedRange = new vscode.Range(openTagRange.end.line, openTagRange.end.character, closeTagRange.start.line, closeTagRange.start.character);
        const outerCombinedRange = new vscode.Range(openTagRange.start.line, openTagRange.start.character, closeTagRange.end.line, closeTagRange.end.character);
        // Special case: there is only whitespace in between.
        if (document.getText(innerCombinedRange).trim() === '' && nodeToUpdate.name !== 'pre') {
            return [outerCombinedRange];
        }
    }
    const rangesToRemove = [];
    if (openTagRange) {
        rangesToRemove.push(openTagRange);
        if (closeTagRange) {
            const indentAmountToRemove = calculateIndentAmountToRemove(document, openTagRange, closeTagRange);
            let firstInnerNonEmptyLine;
            let lastInnerNonEmptyLine;
            for (let i = openTagRange.start.line + 1; i < closeTagRange.start.line; i++) {
                if (!document.lineAt(i).isEmptyOrWhitespace) {
                    rangesToRemove.push(new vscode.Range(i, 0, i, indentAmountToRemove));
                    if (firstInnerNonEmptyLine === undefined) {
                        // We found the first non-empty inner line.
                        firstInnerNonEmptyLine = i;
                    }
                    lastInnerNonEmptyLine = i;
                }
            }
            // Remove the entire last line + empty lines preceding it
            // if it is just the tag, otherwise remove just the tag.
            if (entireLineIsTag(document, closeTagRange) && lastInnerNonEmptyLine) {
                rangesToRemove.push(new vscode.Range(lastInnerNonEmptyLine, document.lineAt(lastInnerNonEmptyLine).range.end.character, closeTagRange.end.line, closeTagRange.end.character));
            }
            else {
                rangesToRemove.push(closeTagRange);
            }
            // Remove the entire first line + empty lines proceding it
            // if it is just the tag, otherwise keep on removing just the tag.
            if (entireLineIsTag(document, openTagRange) && firstInnerNonEmptyLine) {
                rangesToRemove[1] = new vscode.Range(openTagRange.start.line, openTagRange.start.character, firstInnerNonEmptyLine, document.lineAt(firstInnerNonEmptyLine).firstNonWhitespaceCharacterIndex);
                rangesToRemove.shift();
            }
        }
    }
    return rangesToRemove;
}
function entireLineIsTag(document, range) {
    if (range.start.line === range.end.line) {
        const lineText = document.lineAt(range.start).text;
        const tagText = document.getText(range);
        if (lineText.trim() === tagText) {
            return true;
        }
    }
    return false;
}
/**
 * Calculates the amount of indent to remove for getRangesToRemove.
 */
function calculateIndentAmountToRemove(document, openRange, closeRange) {
    const startLine = openRange.start.line;
    const endLine = closeRange.start.line;
    const startLineIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;
    const endLineIndent = document.lineAt(endLine).firstNonWhitespaceCharacterIndex;
    let contentIndent;
    for (let i = startLine + 1; i < endLine; i++) {
        const line = document.lineAt(i);
        if (!line.isEmptyOrWhitespace) {
            const lineIndent = line.firstNonWhitespaceCharacterIndex;
            contentIndent = !contentIndent ? lineIndent : Math.min(contentIndent, lineIndent);
        }
    }
    let indentAmount = 0;
    if (contentIndent) {
        if (contentIndent < startLineIndent || contentIndent < endLineIndent) {
            indentAmount = 0;
        }
        else {
            indentAmount = Math.min(contentIndent - startLineIndent, contentIndent - endLineIndent);
        }
    }
    return indentAmount;
}
//# sourceMappingURL=removeTag.js.map