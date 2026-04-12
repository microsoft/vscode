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
exports.InsertMarkdownLink = void 0;
exports.shouldInsertMarkdownLinkByDefault = shouldInsertMarkdownLinkByDefault;
exports.findValidUriInText = findValidUriInText;
const vscode = __importStar(require("vscode"));
const schemes_1 = require("../../util/schemes");
const smartPasteLineRegexes = [
    { regex: /(\[[^\[\]]*](?:\([^\(\)]*\)|\[[^\[\]]*]))/g }, // In a Markdown link
    { regex: /\$\$[\s\S]*?\$\$/gm }, // In a fenced math block
    { regex: /`[^`]*`/g }, // In inline code
    { regex: /\$[^$]*\$/g }, // In inline math
    { regex: /<[^<>\s]*>/g }, // Autolink
    { regex: /^[ ]{0,3}\[\w+\]:\s.*$/g, isWholeLine: true }, // Block link definition (needed as tokens are not generated for these)
];
async function shouldInsertMarkdownLinkByDefault(parser, document, pasteUrlSetting, ranges, token) {
    switch (pasteUrlSetting) {
        case InsertMarkdownLink.Always: {
            return true;
        }
        case InsertMarkdownLink.Smart: {
            return checkSmart();
        }
        case InsertMarkdownLink.SmartWithSelection: {
            // At least one range must not be empty
            if (!ranges.some(range => document.getText(range).trim().length > 0)) {
                return false;
            }
            // And all ranges must be smart
            return checkSmart();
        }
        default: {
            return false;
        }
    }
    async function checkSmart() {
        return (await Promise.all(ranges.map(range => shouldSmartPasteForSelection(parser, document, range, token)))).every(x => x);
    }
}
const textTokenTypes = new Set([
    'paragraph_open',
    'inline',
    'heading_open',
    'ordered_list_open',
    'bullet_list_open',
    'list_item_open',
    'blockquote_open',
]);
async function shouldSmartPasteForSelection(parser, document, selectedRange, token) {
    // Disable for multi-line selections
    if (selectedRange.start.line !== selectedRange.end.line) {
        return false;
    }
    const rangeText = document.getText(selectedRange);
    // Disable when the selection is already a link
    if (findValidUriInText(rangeText)) {
        return false;
    }
    if (/\[.*\]\(.*\)/.test(rangeText) || /!\[.*\]\(.*\)/.test(rangeText)) {
        return false;
    }
    // Check if selection is inside a special block level element using markdown engine
    const tokens = await parser.tokenize(document);
    if (token.isCancellationRequested) {
        return false;
    }
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token.map) {
            continue;
        }
        if (token.map[0] <= selectedRange.start.line && token.map[1] > selectedRange.start.line) {
            if (!textTokenTypes.has(token.type)) {
                return false;
            }
        }
        // Special case for html such as:
        //
        // <b>
        // |
        // </b>
        //
        // In this case pasting will cause the html block to be created even though the cursor is not currently inside a block
        if (token.type === 'html_block' && token.map[1] === selectedRange.start.line) {
            const nextToken = tokens.at(i + 1);
            // The next token does not need to be a html_block, but it must be on the next line
            if (nextToken?.map?.[0] === selectedRange.end.line + 1) {
                return false;
            }
        }
    }
    // Run additional regex checks on the current line to check if we are inside an inline element
    const line = document.getText(new vscode.Range(selectedRange.start.line, 0, selectedRange.start.line, Number.MAX_SAFE_INTEGER));
    for (const regex of smartPasteLineRegexes) {
        for (const match of line.matchAll(regex.regex)) {
            if (match.index === undefined) {
                continue;
            }
            if (regex.isWholeLine) {
                return false;
            }
            if (selectedRange.start.character > match.index && selectedRange.start.character < match.index + match[0].length) {
                return false;
            }
        }
    }
    return true;
}
const externalUriSchemes = new Set([
    schemes_1.Schemes.http,
    schemes_1.Schemes.https,
    schemes_1.Schemes.mailto,
    schemes_1.Schemes.file,
]);
function findValidUriInText(text) {
    const trimmedUrlList = text.trim();
    if (!/^\S+$/.test(trimmedUrlList) // Uri must consist of a single sequence of characters without spaces
        || !trimmedUrlList.includes(':') // And it must have colon somewhere for the scheme. We will verify the schema again later
    ) {
        return;
    }
    let uri;
    try {
        uri = vscode.Uri.parse(trimmedUrlList);
    }
    catch {
        // Could not parse
        return;
    }
    // `Uri.parse` is lenient and will return a `file:` uri even for non-uri text such as `abc`
    // Make sure that the resolved scheme starts the original text
    if (!trimmedUrlList.toLowerCase().startsWith(uri.scheme.toLowerCase() + ':')) {
        return;
    }
    // Only enable for an allow list of schemes. Otherwise this can be accidentally activated for non-uri text
    // such as `c:\abc` or `value:foo`
    if (!externalUriSchemes.has(uri.scheme.toLowerCase())) {
        return;
    }
    // Some part of the uri must not be empty
    // This disables the feature for text such as `http:`
    if (!uri.authority && uri.path.length < 2 && !uri.query && !uri.fragment) {
        return;
    }
    return trimmedUrlList;
}
var InsertMarkdownLink;
(function (InsertMarkdownLink) {
    InsertMarkdownLink["Always"] = "always";
    InsertMarkdownLink["SmartWithSelection"] = "smartWithSelection";
    InsertMarkdownLink["Smart"] = "smart";
    InsertMarkdownLink["Never"] = "never";
})(InsertMarkdownLink || (exports.InsertMarkdownLink = InsertMarkdownLink = {}));
//# sourceMappingURL=smartDropOrPaste.js.map