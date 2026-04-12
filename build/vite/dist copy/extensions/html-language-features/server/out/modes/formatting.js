"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = format;
const languageModes_1 = require("./languageModes");
const arrays_1 = require("../utils/arrays");
const strings_1 = require("../utils/strings");
async function format(languageModes, document, formatRange, formattingOptions, settings, enabledModes) {
    const result = [];
    const endPos = formatRange.end;
    let endOffset = document.offsetAt(endPos);
    const content = document.getText();
    if (endPos.character === 0 && endPos.line > 0 && endOffset !== content.length) {
        // if selection ends after a new line, exclude that new line
        const prevLineStart = document.offsetAt(languageModes_1.Position.create(endPos.line - 1, 0));
        while ((0, strings_1.isEOL)(content, endOffset - 1) && endOffset > prevLineStart) {
            endOffset--;
        }
        formatRange = languageModes_1.Range.create(formatRange.start, document.positionAt(endOffset));
    }
    // run the html formatter on the full range and pass the result content to the embedded formatters.
    // from the final content create a single edit
    // advantages of this approach are
    //  - correct indents in the html document
    //  - correct initial indent for embedded formatters
    //  - no worrying of overlapping edits
    // make sure we start in html
    const allRanges = languageModes.getModesInRange(document, formatRange);
    let i = 0;
    let startPos = formatRange.start;
    const isHTML = (range) => range.mode && range.mode.getId() === 'html';
    while (i < allRanges.length && !isHTML(allRanges[i])) {
        const range = allRanges[i];
        if (!range.attributeValue && range.mode && range.mode.format) {
            const edits = await range.mode.format(document, languageModes_1.Range.create(startPos, range.end), formattingOptions, settings);
            (0, arrays_1.pushAll)(result, edits);
        }
        startPos = range.end;
        i++;
    }
    if (i === allRanges.length) {
        return result;
    }
    // modify the range
    formatRange = languageModes_1.Range.create(startPos, formatRange.end);
    // perform a html format and apply changes to a new document
    const htmlMode = languageModes.getMode('html');
    const htmlEdits = await htmlMode.format(document, formatRange, formattingOptions, settings);
    let htmlFormattedContent = languageModes_1.TextDocument.applyEdits(document, htmlEdits);
    if (formattingOptions.insertFinalNewline && endOffset === content.length && !htmlFormattedContent.endsWith('\n')) {
        htmlFormattedContent = htmlFormattedContent + '\n';
        htmlEdits.push(languageModes_1.TextEdit.insert(endPos, '\n'));
    }
    const newDocument = languageModes_1.TextDocument.create(document.uri + '.tmp', document.languageId, document.version, htmlFormattedContent);
    try {
        // run embedded formatters on html formatted content: - formatters see correct initial indent
        const afterFormatRangeLength = document.getText().length - document.offsetAt(formatRange.end); // length of unchanged content after replace range
        const newFormatRange = languageModes_1.Range.create(formatRange.start, newDocument.positionAt(htmlFormattedContent.length - afterFormatRangeLength));
        const embeddedRanges = languageModes.getModesInRange(newDocument, newFormatRange);
        const embeddedEdits = [];
        for (const r of embeddedRanges) {
            const mode = r.mode;
            if (mode && mode.format && enabledModes[mode.getId()] && !r.attributeValue) {
                const edits = await mode.format(newDocument, r, formattingOptions, settings);
                for (const edit of edits) {
                    embeddedEdits.push(edit);
                }
            }
        }
        if (embeddedEdits.length === 0) {
            (0, arrays_1.pushAll)(result, htmlEdits);
            return result;
        }
        // apply all embedded format edits and create a single edit for all changes
        const resultContent = languageModes_1.TextDocument.applyEdits(newDocument, embeddedEdits);
        const resultReplaceText = resultContent.substring(document.offsetAt(formatRange.start), resultContent.length - afterFormatRangeLength);
        result.push(languageModes_1.TextEdit.replace(formatRange, resultReplaceText));
        return result;
    }
    finally {
        languageModes.onDocumentRemoved(newDocument);
    }
}
//# sourceMappingURL=formatting.js.map