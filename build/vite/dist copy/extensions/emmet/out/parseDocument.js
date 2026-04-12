"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRootNode = getRootNode;
exports.addFileToParseCache = addFileToParseCache;
exports.removeFileFromParseCache = removeFileFromParseCache;
exports.clearParseCache = clearParseCache;
const html_matcher_1 = __importDefault(require("@emmetio/html-matcher"));
const css_parser_1 = __importDefault(require("@emmetio/css-parser"));
const util_1 = require("./util");
// Map(filename, Pair(fileVersion, rootNodeOfParsedContent))
const _parseCache = new Map();
function getRootNode(document, useCache) {
    const key = document.uri.toString();
    const result = _parseCache.get(key);
    const documentVersion = document.version;
    if (useCache && result) {
        if (documentVersion === result.key) {
            return result.value;
        }
    }
    const parseContent = (0, util_1.isStyleSheet)(document.languageId) ? css_parser_1.default : html_matcher_1.default;
    const rootNode = parseContent(document.getText());
    if (useCache) {
        _parseCache.set(key, { key: documentVersion, value: rootNode });
    }
    return rootNode;
}
function addFileToParseCache(document) {
    const filename = document.uri.toString();
    _parseCache.set(filename, undefined);
}
function removeFileFromParseCache(document) {
    const filename = document.uri.toString();
    _parseCache.delete(filename);
}
function clearParseCache() {
    _parseCache.clear();
}
//# sourceMappingURL=parseDocument.js.map