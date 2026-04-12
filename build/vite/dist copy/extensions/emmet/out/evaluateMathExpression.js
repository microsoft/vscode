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
exports.evaluateMathExpression = evaluateMathExpression;
/* Based on @sergeche's work in his emmet plugin */
const vscode = __importStar(require("vscode"));
const math_expression_1 = __importStar(require("@emmetio/math-expression"));
function evaluateMathExpression() {
    if (!vscode.window.activeTextEditor) {
        vscode.window.showInformationMessage('No editor is active');
        return Promise.resolve(false);
    }
    const editor = vscode.window.activeTextEditor;
    return editor.edit(editBuilder => {
        editor.selections.forEach(selection => {
            // startpos always comes before endpos
            const startpos = selection.isReversed ? selection.active : selection.anchor;
            const endpos = selection.isReversed ? selection.anchor : selection.active;
            const selectionText = editor.document.getText(new vscode.Range(startpos, endpos));
            try {
                if (selectionText) {
                    // respect selections
                    const result = String((0, math_expression_1.default)(selectionText));
                    editBuilder.replace(new vscode.Range(startpos, endpos), result);
                }
                else {
                    // no selection made, extract expression from line
                    const lineToSelectionEnd = editor.document.getText(new vscode.Range(new vscode.Position(selection.end.line, 0), endpos));
                    const extractedIndices = (0, math_expression_1.extract)(lineToSelectionEnd);
                    if (!extractedIndices) {
                        throw new Error('Invalid extracted indices');
                    }
                    const result = String((0, math_expression_1.default)(lineToSelectionEnd.substr(extractedIndices[0], extractedIndices[1])));
                    const rangeToReplace = new vscode.Range(new vscode.Position(selection.end.line, extractedIndices[0]), new vscode.Position(selection.end.line, extractedIndices[1]));
                    editBuilder.replace(rangeToReplace, result);
                }
            }
            catch (err) {
                vscode.window.showErrorMessage('Could not evaluate expression');
                // Ignore error since most likely it's because of non-math expression
                console.warn('Math evaluation error', err);
            }
        });
    });
}
//# sourceMappingURL=evaluateMathExpression.js.map