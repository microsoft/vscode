"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHTMLMode = getHTMLMode;
const languageModelCache_1 = require("../languageModelCache");
function getHTMLMode(htmlLanguageService, workspace) {
    const htmlDocuments = (0, languageModelCache_1.getLanguageModelCache)(10, 60, document => htmlLanguageService.parseHTMLDocument(document));
    return {
        getId() {
            return 'html';
        },
        async getSelectionRange(document, position) {
            return htmlLanguageService.getSelectionRanges(document, [position])[0];
        },
        doComplete(document, position, documentContext, settings = workspace.settings) {
            const htmlSettings = settings?.html;
            const options = merge(htmlSettings?.suggest, {});
            options.hideAutoCompleteProposals = htmlSettings?.autoClosingTags === true;
            options.attributeDefaultValue = htmlSettings?.completion?.attributeDefaultValue ?? 'doublequotes';
            const htmlDocument = htmlDocuments.get(document);
            const completionList = htmlLanguageService.doComplete2(document, position, htmlDocument, documentContext, options);
            return completionList;
        },
        async doHover(document, position, settings) {
            return htmlLanguageService.doHover(document, position, htmlDocuments.get(document), settings?.html?.hover);
        },
        async findDocumentHighlight(document, position) {
            return htmlLanguageService.findDocumentHighlights(document, position, htmlDocuments.get(document));
        },
        async findDocumentLinks(document, documentContext) {
            return htmlLanguageService.findDocumentLinks(document, documentContext);
        },
        async findDocumentSymbols(document) {
            return htmlLanguageService.findDocumentSymbols(document, htmlDocuments.get(document));
        },
        async format(document, range, formatParams, settings = workspace.settings) {
            const formatSettings = merge(settings?.html?.format, {});
            if (formatSettings.contentUnformatted) {
                formatSettings.contentUnformatted = formatSettings.contentUnformatted + ',script';
            }
            else {
                formatSettings.contentUnformatted = 'script';
            }
            merge(formatParams, formatSettings);
            return htmlLanguageService.format(document, range, formatSettings);
        },
        async getFoldingRanges(document) {
            return htmlLanguageService.getFoldingRanges(document);
        },
        async doAutoInsert(document, position, kind, settings = workspace.settings) {
            const offset = document.offsetAt(position);
            const text = document.getText();
            if (kind === 'autoQuote') {
                if (offset > 0 && text.charAt(offset - 1) === '=') {
                    const htmlSettings = settings?.html;
                    const options = merge(htmlSettings?.suggest, {});
                    options.attributeDefaultValue = htmlSettings?.completion?.attributeDefaultValue ?? 'doublequotes';
                    return htmlLanguageService.doQuoteComplete(document, position, htmlDocuments.get(document), options);
                }
            }
            else if (kind === 'autoClose') {
                if (offset > 0 && text.charAt(offset - 1).match(/[>\/]/g)) {
                    return htmlLanguageService.doTagComplete(document, position, htmlDocuments.get(document));
                }
            }
            return null;
        },
        async doRename(document, position, newName) {
            const htmlDocument = htmlDocuments.get(document);
            return htmlLanguageService.doRename(document, position, newName, htmlDocument);
        },
        async onDocumentRemoved(document) {
            htmlDocuments.onDocumentRemoved(document);
        },
        async findMatchingTagPosition(document, position) {
            const htmlDocument = htmlDocuments.get(document);
            return htmlLanguageService.findMatchingTagPosition(document, position, htmlDocument);
        },
        async doLinkedEditing(document, position) {
            const htmlDocument = htmlDocuments.get(document);
            return htmlLanguageService.findLinkedEditingRanges(document, position, htmlDocument);
        },
        dispose() {
            htmlDocuments.dispose();
        }
    };
}
function merge(src, dst) {
    if (src) {
        for (const key in src) {
            if (src.hasOwnProperty(key)) {
                dst[key] = src[key];
            }
        }
    }
    return dst;
}
//# sourceMappingURL=htmlMode.js.map