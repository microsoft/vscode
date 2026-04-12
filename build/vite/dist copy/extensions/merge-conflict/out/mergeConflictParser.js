"use strict";
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
exports.MergeConflictParser = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
const documentMergeConflict_1 = require("./documentMergeConflict");
const startHeaderMarker = '<<<<<<<';
const commonAncestorsMarker = '|||||||';
const splitterMarker = '=======';
const endFooterMarker = '>>>>>>>';
class MergeConflictParser {
    static scanDocument(document, telemetryReporter) {
        // Scan each line in the document, we already know there is at least a <<<<<<< and
        // >>>>>> marker within the document, we need to group these into conflict ranges.
        // We initially build a scan match, that references the lines of the header, splitter
        // and footer. This is then converted into a full descriptor containing all required
        // ranges.
        let currentConflict = null;
        const conflictDescriptors = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            // Ignore empty lines
            if (!line || line.isEmptyOrWhitespace) {
                continue;
            }
            // Is this a start line? <<<<<<<
            if (line.text.startsWith(startHeaderMarker)) {
                if (currentConflict !== null) {
                    // Error, we should not see a startMarker before we've seen an endMarker
                    currentConflict = null;
                    // Give up parsing, anything matched up this to this point will be decorated
                    // anything after will not
                    break;
                }
                // Create a new conflict starting at this line
                currentConflict = { startHeader: line, commonAncestors: [] };
            }
            // Are we within a conflict block and is this a common ancestors marker? |||||||
            else if (currentConflict && !currentConflict.splitter && line.text.startsWith(commonAncestorsMarker)) {
                currentConflict.commonAncestors.push(line);
            }
            // Are we within a conflict block and is this a splitter? =======
            else if (currentConflict && !currentConflict.splitter && line.text === splitterMarker) {
                currentConflict.splitter = line;
            }
            // Are we within a conflict block and is this a footer? >>>>>>>
            else if (currentConflict && line.text.startsWith(endFooterMarker)) {
                currentConflict.endFooter = line;
                // Create a full descriptor from the lines that we matched. This can return
                // null if the descriptor could not be completed.
                const completeDescriptor = MergeConflictParser.scanItemTolMergeConflictDescriptor(document, currentConflict);
                if (completeDescriptor !== null) {
                    conflictDescriptors.push(completeDescriptor);
                }
                // Reset the current conflict to be empty, so we can match the next
                // starting header marker.
                currentConflict = null;
            }
        }
        return conflictDescriptors
            .filter(Boolean)
            .map(descriptor => new documentMergeConflict_1.DocumentMergeConflict(descriptor, telemetryReporter));
    }
    static scanItemTolMergeConflictDescriptor(document, scanned) {
        // Validate we have all the required lines within the scan item.
        if (!scanned.startHeader || !scanned.splitter || !scanned.endFooter) {
            return null;
        }
        const tokenAfterCurrentBlock = scanned.commonAncestors[0] || scanned.splitter;
        // Assume that descriptor.current.header, descriptor.incoming.header and descriptor.splitter
        // have valid ranges, fill in content and total ranges from these parts.
        // NOTE: We need to shift the decorator range back one character so the splitter does not end up with
        // two decoration colors (current and splitter), if we take the new line from the content into account
        // the decorator will wrap to the next line.
        return {
            current: {
                header: scanned.startHeader.range,
                decoratorContent: new vscode.Range(scanned.startHeader.rangeIncludingLineBreak.end, MergeConflictParser.shiftBackOneCharacter(document, tokenAfterCurrentBlock.range.start, scanned.startHeader.rangeIncludingLineBreak.end)),
                // Current content is range between header (shifted for linebreak) and splitter or common ancestors mark start
                content: new vscode.Range(scanned.startHeader.rangeIncludingLineBreak.end, tokenAfterCurrentBlock.range.start),
                name: scanned.startHeader.text.substring(startHeaderMarker.length + 1)
            },
            commonAncestors: scanned.commonAncestors.map((currentTokenLine, index, commonAncestors) => {
                const nextTokenLine = commonAncestors[index + 1] || scanned.splitter;
                return {
                    header: currentTokenLine.range,
                    decoratorContent: new vscode.Range(currentTokenLine.rangeIncludingLineBreak.end, MergeConflictParser.shiftBackOneCharacter(document, nextTokenLine.range.start, currentTokenLine.rangeIncludingLineBreak.end)),
                    // Each common ancestors block is range between one common ancestors token
                    // (shifted for linebreak) and start of next common ancestors token or splitter
                    content: new vscode.Range(currentTokenLine.rangeIncludingLineBreak.end, nextTokenLine.range.start),
                    name: currentTokenLine.text.substring(commonAncestorsMarker.length + 1)
                };
            }),
            splitter: scanned.splitter.range,
            incoming: {
                header: scanned.endFooter.range,
                decoratorContent: new vscode.Range(scanned.splitter.rangeIncludingLineBreak.end, MergeConflictParser.shiftBackOneCharacter(document, scanned.endFooter.range.start, scanned.splitter.rangeIncludingLineBreak.end)),
                // Incoming content is range between splitter (shifted for linebreak) and footer start
                content: new vscode.Range(scanned.splitter.rangeIncludingLineBreak.end, scanned.endFooter.range.start),
                name: scanned.endFooter.text.substring(endFooterMarker.length + 1)
            },
            // Entire range is between current header start and incoming header end (including line break)
            range: new vscode.Range(scanned.startHeader.range.start, scanned.endFooter.rangeIncludingLineBreak.end)
        };
    }
    static containsConflict(document) {
        if (!document) {
            return false;
        }
        const text = document.getText();
        return text.includes(startHeaderMarker) && text.includes(endFooterMarker);
    }
    static shiftBackOneCharacter(document, range, unlessEqual) {
        if (range.isEqual(unlessEqual)) {
            return range;
        }
        let line = range.line;
        let character = range.character - 1;
        if (character < 0) {
            line--;
            character = document.lineAt(line).range.end.character;
        }
        return new vscode.Position(line, character);
    }
}
exports.MergeConflictParser = MergeConflictParser;
//# sourceMappingURL=mergeConflictParser.js.map