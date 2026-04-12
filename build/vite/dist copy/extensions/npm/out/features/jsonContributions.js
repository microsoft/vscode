"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.xhrDisabled = exports.JSONCompletionItemProvider = exports.JSONHoverProvider = void 0;
exports.addJSONProviders = addJSONProviders;
const jsonc_parser_1 = require("jsonc-parser");
const packageJSONContribution_1 = require("./packageJSONContribution");
const vscode_1 = require("vscode");
function addJSONProviders(xhr, npmCommandPath) {
    const contributions = [new packageJSONContribution_1.PackageJSONContribution(xhr, npmCommandPath)];
    const subscriptions = [];
    contributions.forEach(contribution => {
        const selector = contribution.getDocumentSelector();
        subscriptions.push(vscode_1.languages.registerCompletionItemProvider(selector, new JSONCompletionItemProvider(contribution), '"', ':'));
        subscriptions.push(vscode_1.languages.registerHoverProvider(selector, new JSONHoverProvider(contribution)));
    });
    return vscode_1.Disposable.from(...subscriptions);
}
class JSONHoverProvider {
    jsonContribution;
    constructor(jsonContribution) {
        this.jsonContribution = jsonContribution;
    }
    provideHover(document, position, _token) {
        const offset = document.offsetAt(position);
        const location = (0, jsonc_parser_1.getLocation)(document.getText(), offset);
        if (!location.previousNode) {
            return null;
        }
        const node = location.previousNode;
        if (node && node.offset <= offset && offset <= node.offset + node.length) {
            const promise = this.jsonContribution.getInfoContribution(document.uri, location);
            if (promise) {
                return promise.then(htmlContent => {
                    const range = new vscode_1.Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
                    const result = {
                        contents: htmlContent || [],
                        range: range
                    };
                    return result;
                });
            }
        }
        return null;
    }
}
exports.JSONHoverProvider = JSONHoverProvider;
class JSONCompletionItemProvider {
    jsonContribution;
    lastResource;
    constructor(jsonContribution) {
        this.jsonContribution = jsonContribution;
    }
    resolveCompletionItem(item, _token) {
        if (this.jsonContribution.resolveSuggestion) {
            const resolver = this.jsonContribution.resolveSuggestion(this.lastResource, item);
            if (resolver) {
                return resolver;
            }
        }
        return Promise.resolve(item);
    }
    provideCompletionItems(document, position, _token) {
        this.lastResource = document.uri;
        const currentWord = this.getCurrentWord(document, position);
        let overwriteRange;
        const items = [];
        let isIncomplete = false;
        const offset = document.offsetAt(position);
        const location = (0, jsonc_parser_1.getLocation)(document.getText(), offset);
        const node = location.previousNode;
        if (node && node.offset <= offset && offset <= node.offset + node.length && (node.type === 'property' || node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
            overwriteRange = new vscode_1.Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
        }
        else {
            overwriteRange = new vscode_1.Range(document.positionAt(offset - currentWord.length), position);
        }
        const proposed = {};
        const collector = {
            add: (suggestion) => {
                const key = typeof suggestion.label === 'string'
                    ? suggestion.label
                    : suggestion.label.label;
                if (!proposed[key]) {
                    proposed[key] = true;
                    suggestion.range = { replacing: overwriteRange, inserting: new vscode_1.Range(overwriteRange.start, overwriteRange.start) };
                    items.push(suggestion);
                }
            },
            setAsIncomplete: () => isIncomplete = true,
            error: (message) => console.error(message),
            log: (message) => console.log(message)
        };
        let collectPromise = null;
        if (location.isAtPropertyKey) {
            const scanner = (0, jsonc_parser_1.createScanner)(document.getText(), true);
            const addValue = !location.previousNode || !this.hasColonAfter(scanner, location.previousNode.offset + location.previousNode.length);
            const isLast = this.isLast(scanner, document.offsetAt(position));
            collectPromise = this.jsonContribution.collectPropertySuggestions(document.uri, location, currentWord, addValue, isLast, collector);
        }
        else {
            if (location.path.length === 0) {
                collectPromise = this.jsonContribution.collectDefaultSuggestions(document.uri, collector);
            }
            else {
                collectPromise = this.jsonContribution.collectValueSuggestions(document.uri, location, collector);
            }
        }
        if (collectPromise) {
            return collectPromise.then(() => {
                if (items.length > 0 || isIncomplete) {
                    return new vscode_1.CompletionList(items, isIncomplete);
                }
                return null;
            });
        }
        return null;
    }
    getCurrentWord(document, position) {
        let i = position.character - 1;
        const text = document.lineAt(position.line).text;
        while (i >= 0 && ' \t\n\r\v":{[,'.indexOf(text.charAt(i)) === -1) {
            i--;
        }
        return text.substring(i + 1, position.character);
    }
    isLast(scanner, offset) {
        scanner.setPosition(offset);
        let nextToken = scanner.scan();
        if (nextToken === 10 /* SyntaxKind.StringLiteral */ && scanner.getTokenError() === 2 /* ScanError.UnexpectedEndOfString */) {
            nextToken = scanner.scan();
        }
        return nextToken === 2 /* SyntaxKind.CloseBraceToken */ || nextToken === 17 /* SyntaxKind.EOF */;
    }
    hasColonAfter(scanner, offset) {
        scanner.setPosition(offset);
        return scanner.scan() === 6 /* SyntaxKind.ColonToken */;
    }
}
exports.JSONCompletionItemProvider = JSONCompletionItemProvider;
const xhrDisabled = () => Promise.reject({ responseText: 'Use of online resources is disabled.' });
exports.xhrDisabled = xhrDisabled;
//# sourceMappingURL=jsonContributions.js.map