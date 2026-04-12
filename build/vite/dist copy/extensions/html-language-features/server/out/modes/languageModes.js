"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILE_PROTOCOL = exports.TextDocument = exports.TokenType = exports.ClientCapabilities = exports.TextDocumentIdentifier = exports.SelectionRange = exports.DiagnosticSeverity = exports.ParameterInformation = exports.SignatureInformation = exports.WorkspaceEdit = exports.ColorPresentation = exports.ColorInformation = exports.Color = exports.TextEdit = exports.SymbolKind = exports.SymbolInformation = exports.Range = exports.Position = exports.Location = exports.Hover = exports.FormattingOptions = exports.FoldingRangeKind = exports.FoldingRange = exports.DocumentLink = exports.DocumentHighlightKind = exports.DocumentHighlight = exports.Diagnostic = exports.CompletionItemKind = exports.CompletionList = exports.CompletionItem = exports.WorkspaceFolder = void 0;
exports.isCompletionItemData = isCompletionItemData;
exports.getLanguageModes = getLanguageModes;
const vscode_css_languageservice_1 = require("vscode-css-languageservice");
const vscode_html_languageservice_1 = require("vscode-html-languageservice");
const languageModelCache_1 = require("../languageModelCache");
const cssMode_1 = require("./cssMode");
const embeddedSupport_1 = require("./embeddedSupport");
const htmlMode_1 = require("./htmlMode");
const javascriptMode_1 = require("./javascriptMode");
const vscode_languageserver_1 = require("vscode-languageserver");
Object.defineProperty(exports, "WorkspaceFolder", { enumerable: true, get: function () { return vscode_languageserver_1.WorkspaceFolder; } });
Object.defineProperty(exports, "CompletionItem", { enumerable: true, get: function () { return vscode_languageserver_1.CompletionItem; } });
Object.defineProperty(exports, "CompletionList", { enumerable: true, get: function () { return vscode_languageserver_1.CompletionList; } });
Object.defineProperty(exports, "CompletionItemKind", { enumerable: true, get: function () { return vscode_languageserver_1.CompletionItemKind; } });
Object.defineProperty(exports, "Diagnostic", { enumerable: true, get: function () { return vscode_languageserver_1.Diagnostic; } });
Object.defineProperty(exports, "DocumentHighlight", { enumerable: true, get: function () { return vscode_languageserver_1.DocumentHighlight; } });
Object.defineProperty(exports, "DocumentHighlightKind", { enumerable: true, get: function () { return vscode_languageserver_1.DocumentHighlightKind; } });
Object.defineProperty(exports, "DocumentLink", { enumerable: true, get: function () { return vscode_languageserver_1.DocumentLink; } });
Object.defineProperty(exports, "FoldingRange", { enumerable: true, get: function () { return vscode_languageserver_1.FoldingRange; } });
Object.defineProperty(exports, "FoldingRangeKind", { enumerable: true, get: function () { return vscode_languageserver_1.FoldingRangeKind; } });
Object.defineProperty(exports, "FormattingOptions", { enumerable: true, get: function () { return vscode_languageserver_1.FormattingOptions; } });
Object.defineProperty(exports, "Hover", { enumerable: true, get: function () { return vscode_languageserver_1.Hover; } });
Object.defineProperty(exports, "Location", { enumerable: true, get: function () { return vscode_languageserver_1.Location; } });
Object.defineProperty(exports, "Position", { enumerable: true, get: function () { return vscode_languageserver_1.Position; } });
Object.defineProperty(exports, "Range", { enumerable: true, get: function () { return vscode_languageserver_1.Range; } });
Object.defineProperty(exports, "SymbolInformation", { enumerable: true, get: function () { return vscode_languageserver_1.SymbolInformation; } });
Object.defineProperty(exports, "SymbolKind", { enumerable: true, get: function () { return vscode_languageserver_1.SymbolKind; } });
Object.defineProperty(exports, "TextEdit", { enumerable: true, get: function () { return vscode_languageserver_1.TextEdit; } });
Object.defineProperty(exports, "Color", { enumerable: true, get: function () { return vscode_languageserver_1.Color; } });
Object.defineProperty(exports, "ColorInformation", { enumerable: true, get: function () { return vscode_languageserver_1.ColorInformation; } });
Object.defineProperty(exports, "ColorPresentation", { enumerable: true, get: function () { return vscode_languageserver_1.ColorPresentation; } });
Object.defineProperty(exports, "WorkspaceEdit", { enumerable: true, get: function () { return vscode_languageserver_1.WorkspaceEdit; } });
Object.defineProperty(exports, "SignatureInformation", { enumerable: true, get: function () { return vscode_languageserver_1.SignatureInformation; } });
Object.defineProperty(exports, "ParameterInformation", { enumerable: true, get: function () { return vscode_languageserver_1.ParameterInformation; } });
Object.defineProperty(exports, "DiagnosticSeverity", { enumerable: true, get: function () { return vscode_languageserver_1.DiagnosticSeverity; } });
Object.defineProperty(exports, "SelectionRange", { enumerable: true, get: function () { return vscode_languageserver_1.SelectionRange; } });
Object.defineProperty(exports, "TextDocumentIdentifier", { enumerable: true, get: function () { return vscode_languageserver_1.TextDocumentIdentifier; } });
const vscode_html_languageservice_2 = require("vscode-html-languageservice");
Object.defineProperty(exports, "ClientCapabilities", { enumerable: true, get: function () { return vscode_html_languageservice_2.ClientCapabilities; } });
Object.defineProperty(exports, "TokenType", { enumerable: true, get: function () { return vscode_html_languageservice_2.TokenType; } });
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
Object.defineProperty(exports, "TextDocument", { enumerable: true, get: function () { return vscode_languageserver_textdocument_1.TextDocument; } });
function isCompletionItemData(value) {
    return value && typeof value.languageId === 'string' && typeof value.uri === 'string' && typeof value.offset === 'number';
}
exports.FILE_PROTOCOL = 'html-server';
function getLanguageModes(supportedLanguages, workspace, clientCapabilities, requestService) {
    const htmlLanguageService = (0, vscode_html_languageservice_1.getLanguageService)({ clientCapabilities, fileSystemProvider: requestService });
    const cssLanguageService = (0, vscode_css_languageservice_1.getCSSLanguageService)({ clientCapabilities, fileSystemProvider: requestService });
    const documentRegions = (0, languageModelCache_1.getLanguageModelCache)(10, 60, document => (0, embeddedSupport_1.getDocumentRegions)(htmlLanguageService, document));
    let modelCaches = [];
    modelCaches.push(documentRegions);
    let modes = Object.create(null);
    modes['html'] = (0, htmlMode_1.getHTMLMode)(htmlLanguageService, workspace);
    if (supportedLanguages['css']) {
        modes['css'] = (0, cssMode_1.getCSSMode)(cssLanguageService, documentRegions, workspace);
    }
    if (supportedLanguages['javascript']) {
        modes['javascript'] = (0, javascriptMode_1.getJavaScriptMode)(documentRegions, 'javascript', workspace);
        modes['typescript'] = (0, javascriptMode_1.getJavaScriptMode)(documentRegions, 'typescript', workspace);
    }
    return {
        async updateDataProviders(dataProviders) {
            htmlLanguageService.setDataProviders(true, dataProviders);
        },
        getModeAtPosition(document, position) {
            const languageId = documentRegions.get(document).getLanguageAtPosition(position);
            if (languageId) {
                return modes[languageId];
            }
            return undefined;
        },
        getModesInRange(document, range) {
            return documentRegions.get(document).getLanguageRanges(range).map((r) => {
                return {
                    start: r.start,
                    end: r.end,
                    mode: r.languageId && modes[r.languageId],
                    attributeValue: r.attributeValue
                };
            });
        },
        getAllModesInDocument(document) {
            const result = [];
            for (const languageId of documentRegions.get(document).getLanguagesInDocument()) {
                const mode = modes[languageId];
                if (mode) {
                    result.push(mode);
                }
            }
            return result;
        },
        getAllModes() {
            const result = [];
            for (const languageId in modes) {
                const mode = modes[languageId];
                if (mode) {
                    result.push(mode);
                }
            }
            return result;
        },
        getMode(languageId) {
            return modes[languageId];
        },
        onDocumentRemoved(document) {
            modelCaches.forEach(mc => mc.onDocumentRemoved(document));
            for (const mode in modes) {
                modes[mode].onDocumentRemoved(document);
            }
        },
        dispose() {
            modelCaches.forEach(mc => mc.dispose());
            modelCaches = [];
            for (const mode in modes) {
                modes[mode].dispose();
            }
            modes = {};
        }
    };
}
//# sourceMappingURL=languageModes.js.map