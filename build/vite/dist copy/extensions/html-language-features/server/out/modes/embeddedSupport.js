"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSS_STYLE_RULE = void 0;
exports.getDocumentRegions = getDocumentRegions;
const languageModes_1 = require("./languageModes");
exports.CSS_STYLE_RULE = '__';
function getDocumentRegions(languageService, document) {
    const regions = [];
    const scanner = languageService.createScanner(document.getText());
    let lastTagName = '';
    let lastAttributeName = null;
    let languageIdFromType = undefined;
    const importedScripts = [];
    let token = scanner.scan();
    while (token !== languageModes_1.TokenType.EOS) {
        switch (token) {
            case languageModes_1.TokenType.StartTag:
                lastTagName = scanner.getTokenText();
                lastAttributeName = null;
                languageIdFromType = 'javascript';
                break;
            case languageModes_1.TokenType.Styles:
                regions.push({ languageId: 'css', start: scanner.getTokenOffset(), end: scanner.getTokenEnd() });
                break;
            case languageModes_1.TokenType.Script:
                regions.push({ languageId: languageIdFromType, start: scanner.getTokenOffset(), end: scanner.getTokenEnd() });
                break;
            case languageModes_1.TokenType.AttributeName:
                lastAttributeName = scanner.getTokenText();
                break;
            case languageModes_1.TokenType.AttributeValue:
                if (lastAttributeName === 'src' && lastTagName.toLowerCase() === 'script') {
                    let value = scanner.getTokenText();
                    if (value[0] === '\'' || value[0] === '"') {
                        value = value.substr(1, value.length - 1);
                    }
                    importedScripts.push(value);
                }
                else if (lastAttributeName === 'type' && lastTagName.toLowerCase() === 'script') {
                    const token = scanner.getTokenText();
                    if (/["'](module|(text|application)\/(java|ecma)script|text\/babel)["']/.test(token) || token === 'module') {
                        languageIdFromType = 'javascript';
                    }
                    else if (/["']text\/typescript["']/.test(token)) {
                        languageIdFromType = 'typescript';
                    }
                    else {
                        languageIdFromType = undefined;
                    }
                }
                else {
                    const attributeLanguageId = getAttributeLanguage(lastAttributeName);
                    if (attributeLanguageId) {
                        let start = scanner.getTokenOffset();
                        let end = scanner.getTokenEnd();
                        const firstChar = document.getText()[start];
                        if (firstChar === '\'' || firstChar === '"') {
                            start++;
                            end--;
                        }
                        regions.push({ languageId: attributeLanguageId, start, end, attributeValue: true });
                    }
                }
                lastAttributeName = null;
                break;
        }
        token = scanner.scan();
    }
    return {
        getLanguageRanges: (range) => getLanguageRanges(document, regions, range),
        getEmbeddedDocument: (languageId, ignoreAttributeValues) => getEmbeddedDocument(document, regions, languageId, ignoreAttributeValues),
        getLanguageAtPosition: (position) => getLanguageAtPosition(document, regions, position),
        getLanguagesInDocument: () => getLanguagesInDocument(document, regions),
        getImportedScripts: () => importedScripts
    };
}
function getLanguageRanges(document, regions, range) {
    const result = [];
    let currentPos = range ? range.start : languageModes_1.Position.create(0, 0);
    let currentOffset = range ? document.offsetAt(range.start) : 0;
    const endOffset = range ? document.offsetAt(range.end) : document.getText().length;
    for (const region of regions) {
        if (region.end > currentOffset && region.start < endOffset) {
            const start = Math.max(region.start, currentOffset);
            const startPos = document.positionAt(start);
            if (currentOffset < region.start) {
                result.push({
                    start: currentPos,
                    end: startPos,
                    languageId: 'html'
                });
            }
            const end = Math.min(region.end, endOffset);
            const endPos = document.positionAt(end);
            if (end > region.start) {
                result.push({
                    start: startPos,
                    end: endPos,
                    languageId: region.languageId,
                    attributeValue: region.attributeValue
                });
            }
            currentOffset = end;
            currentPos = endPos;
        }
    }
    if (currentOffset < endOffset) {
        const endPos = range ? range.end : document.positionAt(endOffset);
        result.push({
            start: currentPos,
            end: endPos,
            languageId: 'html'
        });
    }
    return result;
}
function getLanguagesInDocument(_document, regions) {
    const result = [];
    for (const region of regions) {
        if (region.languageId && result.indexOf(region.languageId) === -1) {
            result.push(region.languageId);
            if (result.length === 3) {
                return result;
            }
        }
    }
    result.push('html');
    return result;
}
function getLanguageAtPosition(document, regions, position) {
    const offset = document.offsetAt(position);
    for (const region of regions) {
        if (region.start <= offset) {
            if (offset <= region.end) {
                return region.languageId;
            }
        }
        else {
            break;
        }
    }
    return 'html';
}
function getEmbeddedDocument(document, contents, languageId, ignoreAttributeValues) {
    let currentPos = 0;
    const oldContent = document.getText();
    let result = '';
    let lastSuffix = '';
    for (const c of contents) {
        if (c.languageId === languageId && (!ignoreAttributeValues || !c.attributeValue)) {
            result = substituteWithWhitespace(result, currentPos, c.start, oldContent, lastSuffix, getPrefix(c));
            result += updateContent(c, oldContent.substring(c.start, c.end));
            currentPos = c.end;
            lastSuffix = getSuffix(c);
        }
    }
    result = substituteWithWhitespace(result, currentPos, oldContent.length, oldContent, lastSuffix, '');
    return languageModes_1.TextDocument.create(document.uri, languageId, document.version, result);
}
function getPrefix(c) {
    if (c.attributeValue) {
        switch (c.languageId) {
            case 'css': return exports.CSS_STYLE_RULE + '{';
        }
    }
    return '';
}
function getSuffix(c) {
    if (c.attributeValue) {
        switch (c.languageId) {
            case 'css': return '}';
            case 'javascript': return ';';
        }
    }
    return '';
}
function updateContent(c, content) {
    if (!c.attributeValue && c.languageId === 'javascript') {
        return content.replace(`<!--`, `/* `).replace(`-->`, ` */`);
    }
    if (c.languageId === 'css') {
        const quoteEscape = /(&quot;|&#34;)/g;
        return content.replace(quoteEscape, (match, _, offset) => {
            const spaces = ' '.repeat(match.length - 1);
            const afterChar = content[offset + match.length];
            if (!afterChar || afterChar.includes(' ')) {
                return `${spaces}"`;
            }
            return `"${spaces}`;
        });
    }
    return content;
}
function substituteWithWhitespace(result, start, end, oldContent, before, after) {
    result += before;
    let accumulatedWS = -before.length; // start with a negative value to account for the before string
    for (let i = start; i < end; i++) {
        const ch = oldContent[i];
        if (ch === '\n' || ch === '\r') {
            // only write new lines, skip the whitespace
            accumulatedWS = 0;
            result += ch;
        }
        else {
            accumulatedWS++;
        }
    }
    result = append(result, ' ', accumulatedWS - after.length);
    result += after;
    return result;
}
function append(result, str, n) {
    while (n > 0) {
        if (n & 1) {
            result += str;
        }
        n >>= 1;
        str += str;
    }
    return result;
}
function getAttributeLanguage(attributeName) {
    const match = attributeName.match(/^(style)$|^(on\w+)$/i);
    if (!match) {
        return null;
    }
    return match[1] ? 'css' : 'javascript';
}
//# sourceMappingURL=embeddedSupport.js.map