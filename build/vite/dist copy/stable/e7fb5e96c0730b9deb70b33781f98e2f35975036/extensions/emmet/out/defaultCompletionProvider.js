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
exports.DefaultCompletionItemProvider = void 0;
const vscode = __importStar(require("vscode"));
const abbreviationActions_1 = require("./abbreviationActions");
const util_1 = require("./util");
const parseDocument_1 = require("./parseDocument");
class DefaultCompletionItemProvider {
    lastCompletionType;
    provideCompletionItems(document, position, _, context) {
        const completionResult = this.provideCompletionItemsInternal(document, position, context);
        if (!completionResult) {
            this.lastCompletionType = undefined;
            return;
        }
        return completionResult.then(completionList => {
            if (!completionList || !completionList.items.length) {
                this.lastCompletionType = undefined;
                return completionList;
            }
            const item = completionList.items[0];
            const expandedText = item.documentation ? item.documentation.toString() : '';
            if (expandedText.startsWith('<')) {
                this.lastCompletionType = 'html';
            }
            else if (expandedText.indexOf(':') > 0 && expandedText.endsWith(';')) {
                this.lastCompletionType = 'css';
            }
            else {
                this.lastCompletionType = undefined;
            }
            return completionList;
        });
    }
    provideCompletionItemsInternal(document, position, context) {
        const emmetConfig = vscode.workspace.getConfiguration('emmet');
        const excludedLanguages = emmetConfig['excludeLanguages'] ? emmetConfig['excludeLanguages'] : [];
        if (excludedLanguages.includes(document.languageId)) {
            return;
        }
        const mappedLanguages = (0, util_1.getMappingForIncludedLanguages)();
        const isSyntaxMapped = mappedLanguages[document.languageId] ? true : false;
        const emmetMode = (0, util_1.getEmmetMode)((isSyntaxMapped ? mappedLanguages[document.languageId] : document.languageId), mappedLanguages, excludedLanguages);
        if (!emmetMode
            || emmetConfig['showExpandedAbbreviation'] === 'never'
            || ((isSyntaxMapped || emmetMode === 'jsx') && emmetConfig['showExpandedAbbreviation'] !== 'always')) {
            return;
        }
        let syntax = emmetMode;
        let validateLocation = syntax === 'html' || syntax === 'jsx' || syntax === 'xml';
        let rootNode;
        let currentNode;
        const lsDoc = (0, util_1.toLSTextDocument)(document);
        position = document.validatePosition(position);
        // Don't show completions if there's a comment at the beginning of the line
        const lineRange = new vscode.Range(position.line, 0, position.line, position.character);
        if (document.getText(lineRange).trimStart().startsWith('//')) {
            return;
        }
        const helper = (0, util_1.getEmmetHelper)();
        if (syntax === 'html') {
            if (context.triggerKind === vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
                switch (this.lastCompletionType) {
                    case 'html':
                        validateLocation = false;
                        break;
                    case 'css':
                        validateLocation = false;
                        syntax = 'css';
                        break;
                    default:
                        break;
                }
            }
            if (validateLocation) {
                const positionOffset = document.offsetAt(position);
                const emmetRootNode = (0, parseDocument_1.getRootNode)(document, true);
                const foundNode = (0, util_1.getHtmlFlatNode)(document.getText(), emmetRootNode, positionOffset, false);
                if (foundNode) {
                    if (foundNode.name === 'script') {
                        const typeNode = foundNode.attributes.find(attr => attr.name.toString() === 'type');
                        if (typeNode) {
                            const typeAttrValue = typeNode.value.toString();
                            if (typeAttrValue === 'application/javascript' || typeAttrValue === 'text/javascript') {
                                if (!(0, abbreviationActions_1.getSyntaxFromArgs)({ language: 'javascript' })) {
                                    return;
                                }
                                else {
                                    validateLocation = false;
                                }
                            }
                            else if (util_1.allowedMimeTypesInScriptTag.includes(typeAttrValue)) {
                                validateLocation = false;
                            }
                        }
                        else {
                            return;
                        }
                    }
                    else if (foundNode.name === 'style') {
                        syntax = 'css';
                        validateLocation = false;
                    }
                    else {
                        const styleNode = foundNode.attributes.find(attr => attr.name.toString() === 'style');
                        if (styleNode && styleNode.value.start <= positionOffset && positionOffset <= styleNode.value.end) {
                            syntax = 'css';
                            validateLocation = false;
                        }
                    }
                }
            }
        }
        const expandOptions = (0, util_1.isStyleSheet)(syntax) ?
            { lookAhead: false, syntax: 'stylesheet' } :
            { lookAhead: true, syntax: 'markup' };
        const extractAbbreviationResults = helper.extractAbbreviation(lsDoc, position, expandOptions);
        if (!extractAbbreviationResults || !helper.isAbbreviationValid(syntax, extractAbbreviationResults.abbreviation)) {
            return;
        }
        const offset = document.offsetAt(position);
        if ((0, util_1.isStyleSheet)(document.languageId) && context.triggerKind !== vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
            validateLocation = true;
            const usePartialParsing = vscode.workspace.getConfiguration('emmet')['optimizeStylesheetParsing'] === true;
            rootNode = usePartialParsing && document.lineCount > 1000 ? (0, util_1.parsePartialStylesheet)(document, position) : (0, parseDocument_1.getRootNode)(document, true);
            if (!rootNode) {
                return;
            }
            currentNode = (0, util_1.getFlatNode)(rootNode, offset, true);
        }
        // Fix for https://github.com/microsoft/vscode/issues/107578
        // Validate location if syntax is of styleSheet type to ensure that location is valid for emmet abbreviation.
        // For an html document containing a <style> node, compute the embeddedCssNode and fetch the flattened node as currentNode.
        if (!(0, util_1.isStyleSheet)(document.languageId) && (0, util_1.isStyleSheet)(syntax) && context.triggerKind !== vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
            validateLocation = true;
            rootNode = (0, parseDocument_1.getRootNode)(document, true);
            if (!rootNode) {
                return;
            }
            const flatNode = (0, util_1.getFlatNode)(rootNode, offset, true);
            const embeddedCssNode = (0, util_1.getEmbeddedCssNodeIfAny)(document, flatNode, position);
            currentNode = (0, util_1.getFlatNode)(embeddedCssNode, offset, true);
        }
        if (validateLocation && !(0, abbreviationActions_1.isValidLocationForEmmetAbbreviation)(document, rootNode, currentNode, syntax, offset, toRange(extractAbbreviationResults.abbreviationRange))) {
            return;
        }
        let isNoisePromise = Promise.resolve(false);
        // Fix for https://github.com/microsoft/vscode/issues/32647
        // Check for document symbols in js/ts/jsx/tsx and avoid triggering emmet for abbreviations of the form symbolName.sometext
        // Presence of > or * or + in the abbreviation denotes valid abbreviation that should trigger emmet
        if (!(0, util_1.isStyleSheet)(syntax) && (document.languageId === 'javascript' || document.languageId === 'javascriptreact' || document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
            const abbreviation = extractAbbreviationResults.abbreviation;
            // For the second condition, we don't want abbreviations that have [] characters but not ='s in them to expand
            // In turn, users must explicitly expand abbreviations of the form Component[attr1 attr2], but it means we don't try to expand a[i].
            if (abbreviation.startsWith('this.') || /\[[^\]=]*\]/.test(abbreviation)) {
                isNoisePromise = Promise.resolve(true);
            }
            else {
                isNoisePromise = vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri).then(symbols => {
                    return !!symbols && symbols.some(x => abbreviation === x.name || (abbreviation.startsWith(x.name + '.') && !/>|\*|\+/.test(abbreviation)));
                });
            }
        }
        return isNoisePromise.then((isNoise) => {
            if (isNoise) {
                return undefined;
            }
            const config = (0, util_1.getEmmetConfiguration)(syntax);
            const result = helper.doComplete((0, util_1.toLSTextDocument)(document), position, syntax, config);
            const newItems = [];
            if (result && result.items) {
                result.items.forEach((item) => {
                    const newItem = new vscode.CompletionItem(item.label);
                    newItem.documentation = item.documentation;
                    newItem.detail = item.detail;
                    newItem.insertText = new vscode.SnippetString(item.textEdit.newText);
                    const oldrange = item.textEdit.range;
                    newItem.range = new vscode.Range(oldrange.start.line, oldrange.start.character, oldrange.end.line, oldrange.end.character);
                    newItem.filterText = item.filterText;
                    newItem.sortText = item.sortText;
                    if (emmetConfig['showSuggestionsAsSnippets'] === true) {
                        newItem.kind = vscode.CompletionItemKind.Snippet;
                    }
                    newItems.push(newItem);
                });
            }
            return new vscode.CompletionList(newItems, true);
        });
    }
}
exports.DefaultCompletionItemProvider = DefaultCompletionItemProvider;
function toRange(lsRange) {
    return new vscode.Range(lsRange.start.line, lsRange.start.character, lsRange.end.line, lsRange.end.character);
}
//# sourceMappingURL=defaultCompletionProvider.js.map