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
const vscode = __importStar(require("vscode"));
class MergeConflictContentProvider {
    context;
    static scheme = 'merge-conflict.conflict-diff';
    constructor(context) {
        this.context = context;
    }
    begin() {
        this.context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(MergeConflictContentProvider.scheme, this));
    }
    dispose() {
    }
    async provideTextDocumentContent(uri) {
        try {
            const { scheme, ranges } = JSON.parse(uri.query);
            // complete diff
            const document = await vscode.workspace.openTextDocument(uri.with({ scheme, query: '' }));
            let text = '';
            let lastPosition = new vscode.Position(0, 0);
            ranges.forEach(rangeObj => {
                const [conflictRange, fullRange] = rangeObj;
                const [start, end] = conflictRange;
                const [fullStart, fullEnd] = fullRange;
                text += document.getText(new vscode.Range(lastPosition.line, lastPosition.character, fullStart.line, fullStart.character));
                text += document.getText(new vscode.Range(start.line, start.character, end.line, end.character));
                lastPosition = new vscode.Position(fullEnd.line, fullEnd.character);
            });
            const documentEnd = document.lineAt(document.lineCount - 1).range.end;
            text += document.getText(new vscode.Range(lastPosition.line, lastPosition.character, documentEnd.line, documentEnd.character));
            return text;
        }
        catch (ex) {
            await vscode.window.showErrorMessage('Unable to show comparison');
            return null;
        }
    }
}
exports.default = MergeConflictContentProvider;
//# sourceMappingURL=contentProvider.js.map