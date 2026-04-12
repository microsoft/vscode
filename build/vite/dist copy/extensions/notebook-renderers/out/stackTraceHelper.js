"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStackTrace = formatStackTrace;
function formatStackTrace(stack, trustHtml) {
    let cleaned;
    // Ansi colors are described here:
    // https://en.wikipedia.org/wiki/ANSI_escape_code under the SGR section
    // Remove background colors. The ones from IPython don't work well with
    // themes 40-49 sets background color
    cleaned = stack.replace(/\u001b\[4\dm/g, '');
    cleaned = cleaned.replace(/(?<=\u001b\[[\d;]*?);4\d(?=m)/g, '');
    // Also remove specific foreground colors (38 is the ascii code for picking one) (they don't translate either)
    // Turn them into default foreground
    cleaned = cleaned.replace(/\u001b\[38;.*?\d+m/g, '\u001b[39m');
    // Turn all foreground colors after the --> to default foreground
    cleaned = cleaned.replace(/(;32m[ ->]*?)(\d+)(.*)\n/g, (_s, prefix, num, suffix) => {
        suffix = suffix.replace(/\u001b\[3\d+m/g, '\u001b[39m');
        return `${prefix}${num}${suffix}\n`;
    });
    if (isIpythonStackTrace(cleaned) && trustHtml) {
        return linkifyStack(cleaned);
    }
    return { formattedStack: cleaned };
}
const formatSequence = /\u001b\[.+?m/g;
const fileRegex = /File\s+(?:\u001b\[.+?m)?(.+):(\d+)/;
// look for the "--->" before a line number
const lineNumberRegex = /(-+>(?:\u001b\[[\d;]*m|\s)*)(\d+)(.*)/;
// just capturing parts of "Cell In[3], line 2" with lots of formatting in between
const cellRegex = /^(?<prefix>(?:\u001b\[[\d;]*m|\s)*Cell(?:\u001b\[[\d;]*m|\s)*In(?:\u001b\[[\d;]*m|\s)*\[(?<executionCount>\d+)\](?:\u001b\[[\d;]*m|\s|,)+)(?<lineLabel>line (?<lineNumber>\d+))[^\n]*$/m;
// older versions of IPython ~8.3.0
const inputRegex = /(?<prefix>Input\s+?(?:\u001b\[.+?m)(?<cellLabel>In\s*\[(?<executionCount>\d+)\]))(?<postfix>.*)/;
function isIpythonStackTrace(stack) {
    return cellRegex.test(stack) || inputRegex.test(stack) || fileRegex.test(stack);
}
function stripFormatting(text) {
    return text.replace(formatSequence, '').trim();
}
function linkifyStack(stack) {
    const lines = stack.split('\n');
    let fileOrCell;
    let locationLink = '';
    for (const i in lines) {
        const original = lines[i];
        if (fileRegex.test(original)) {
            const fileMatch = lines[i].match(fileRegex);
            fileOrCell = { kind: 'file', path: stripFormatting(fileMatch[1]) };
            continue;
        }
        else if (cellRegex.test(original)) {
            fileOrCell = {
                kind: 'cell',
                path: stripFormatting(original.replace(cellRegex, 'vscode-notebook-cell:?execution_count=$<executionCount>'))
            };
            const link = original.replace(cellRegex, `<a href=\'${fileOrCell.path}&line=$<lineNumber>\'>line $<lineNumber></a>`);
            lines[i] = original.replace(cellRegex, `$<prefix>${link}`);
            locationLink = locationLink || link;
            continue;
        }
        else if (inputRegex.test(original)) {
            fileOrCell = {
                kind: 'cell',
                path: stripFormatting(original.replace(inputRegex, 'vscode-notebook-cell:?execution_count=$<executionCount>'))
            };
            const link = original.replace(inputRegex, `<a href=\'${fileOrCell.path}\'>$<cellLabel></a>`);
            lines[i] = original.replace(inputRegex, `Input ${link}$<postfix>`);
            continue;
        }
        else if (!fileOrCell || original.trim() === '') {
            // we don't have a location, so don't linkify anything
            fileOrCell = undefined;
            continue;
        }
        else if (lineNumberRegex.test(original)) {
            lines[i] = original.replace(lineNumberRegex, (_s, prefix, num, suffix) => {
                return fileOrCell?.kind === 'file' ?
                    `${prefix}<a href='${fileOrCell?.path}:${num}'>${num}</a>${suffix}` :
                    `${prefix}<a href='${fileOrCell?.path}&line=${num}'>${num}</a>${suffix}`;
            });
            continue;
        }
    }
    const errorLocation = locationLink;
    return { formattedStack: lines.join('\n'), errorLocation };
}
//# sourceMappingURL=stackTraceHelper.js.map