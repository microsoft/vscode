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
exports.PackageDocument = void 0;
const vscode = __importStar(require("vscode"));
const jsonc_parser_1 = require("jsonc-parser");
const constants_1 = require("./constants");
class PackageDocument {
    document;
    constructor(document) {
        this.document = document;
    }
    provideCompletionItems(position, _token) {
        const location = (0, jsonc_parser_1.getLocation)(this.document.getText(), this.document.offsetAt(position));
        if (location.path.length >= 2 && location.path[1] === 'configurationDefaults') {
            return this.provideLanguageOverridesCompletionItems(location, position);
        }
        return undefined;
    }
    provideCodeActions(_range, context, _token) {
        const codeActions = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.message === constants_1.implicitActivationEvent || diagnostic.message === constants_1.redundantImplicitActivationEvent) {
                const codeAction = new vscode.CodeAction(vscode.l10n.t("Remove activation event"), vscode.CodeActionKind.QuickFix);
                codeAction.edit = new vscode.WorkspaceEdit();
                const rangeForCharAfter = diagnostic.range.with(diagnostic.range.end, diagnostic.range.end.translate(0, 1));
                if (this.document.getText(rangeForCharAfter) === ',') {
                    codeAction.edit.delete(this.document.uri, diagnostic.range.with(undefined, diagnostic.range.end.translate(0, 1)));
                }
                else {
                    codeAction.edit.delete(this.document.uri, diagnostic.range);
                }
                codeActions.push(codeAction);
            }
        }
        return codeActions;
    }
    provideLanguageOverridesCompletionItems(location, position) {
        let range = this.getReplaceRange(location, position);
        const text = this.document.getText(range);
        if (location.path.length === 2) {
            let snippet = '"[${1:language}]": {\n\t"$0"\n}';
            // Suggestion model word matching includes quotes,
            // hence exclude the starting quote from the snippet and the range
            // ending quote gets replaced
            if (text && text.startsWith('"')) {
                range = new vscode.Range(new vscode.Position(range.start.line, range.start.character + 1), range.end);
                snippet = snippet.substring(1);
            }
            return Promise.resolve([this.newSnippetCompletionItem({
                    label: vscode.l10n.t("Language specific editor settings"),
                    documentation: vscode.l10n.t("Override editor settings for language"),
                    snippet,
                    range
                })]);
        }
        if (location.path.length === 3 && location.previousNode && typeof location.previousNode.value === 'string' && location.previousNode.value.startsWith('[')) {
            // Suggestion model word matching includes starting quote and open sqaure bracket
            // Hence exclude them from the proposal range
            range = new vscode.Range(new vscode.Position(range.start.line, range.start.character + 2), range.end);
            return vscode.languages.getLanguages().then(languages => {
                return languages.map(l => {
                    // Suggestion model word matching includes closed sqaure bracket and ending quote
                    // Hence include them in the proposal to replace
                    return this.newSimpleCompletionItem(l, range, '', l + ']"');
                });
            });
        }
        return Promise.resolve([]);
    }
    getReplaceRange(location, position) {
        const node = location.previousNode;
        if (node) {
            const nodeStart = this.document.positionAt(node.offset), nodeEnd = this.document.positionAt(node.offset + node.length);
            if (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)) {
                return new vscode.Range(nodeStart, nodeEnd);
            }
        }
        return new vscode.Range(position, position);
    }
    newSimpleCompletionItem(text, range, description, insertText) {
        const item = new vscode.CompletionItem(text);
        item.kind = vscode.CompletionItemKind.Value;
        item.detail = description;
        item.insertText = insertText ? insertText : text;
        item.range = range;
        return item;
    }
    newSnippetCompletionItem(o) {
        const item = new vscode.CompletionItem(o.label);
        item.kind = vscode.CompletionItemKind.Value;
        item.documentation = o.documentation;
        item.insertText = new vscode.SnippetString(o.snippet);
        item.range = o.range;
        return item;
    }
}
exports.PackageDocument = PackageDocument;
//# sourceMappingURL=packageDocumentHelper.js.map