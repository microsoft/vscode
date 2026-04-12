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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateImageSize = updateImageSize;
// Based on @sergeche's work on the emmet plugin for atom
const vscode_1 = require("vscode");
const path = __importStar(require("path"));
const imageSizeHelper_1 = require("./imageSizeHelper");
const util_1 = require("./util");
const locateFile_1 = require("./locateFile");
const css_parser_1 = __importDefault(require("@emmetio/css-parser"));
const parseDocument_1 = require("./parseDocument");
/**
 * Updates size of context image in given editor
 */
function updateImageSize() {
    if (!(0, util_1.validate)() || !vscode_1.window.activeTextEditor) {
        return;
    }
    const editor = vscode_1.window.activeTextEditor;
    const allUpdatesPromise = Array.from(editor.selections).reverse().map(selection => {
        const position = selection.isReversed ? selection.active : selection.anchor;
        if (!(0, util_1.isStyleSheet)(editor.document.languageId)) {
            return updateImageSizeHTML(editor, position);
        }
        else {
            return updateImageSizeCSSFile(editor, position);
        }
    });
    return Promise.all(allUpdatesPromise).then((updates) => {
        return editor.edit(builder => {
            updates.forEach(update => {
                update.forEach((textEdit) => {
                    builder.replace(textEdit.range, textEdit.newText);
                });
            });
        });
    });
}
/**
 * Updates image size of context tag of HTML model
 */
function updateImageSizeHTML(editor, position) {
    const imageNode = getImageHTMLNode(editor, position);
    const src = imageNode && getImageSrcHTML(imageNode);
    if (!src) {
        return updateImageSizeStyleTag(editor, position);
    }
    return (0, locateFile_1.locateFile)(path.dirname(editor.document.fileName), src)
        .then(imageSizeHelper_1.getImageSize)
        .then((size) => {
        // since this action is asynchronous, we have to ensure that editor wasn't
        // changed and user didn't moved caret outside <img> node
        const img = getImageHTMLNode(editor, position);
        if (img && getImageSrcHTML(img) === src) {
            return updateHTMLTag(editor, img, size.width, size.height);
        }
        return [];
    })
        .catch(err => { console.warn('Error while updating image size:', err); return []; });
}
function updateImageSizeStyleTag(editor, position) {
    const getPropertyInsiderStyleTag = (editor) => {
        const document = editor.document;
        const rootNode = (0, parseDocument_1.getRootNode)(document, true);
        const offset = document.offsetAt(position);
        const currentNode = (0, util_1.getFlatNode)(rootNode, offset, true);
        if (currentNode && currentNode.name === 'style'
            && currentNode.open && currentNode.close
            && currentNode.open.end < offset
            && currentNode.close.start > offset) {
            const buffer = ' '.repeat(currentNode.open.end) +
                document.getText().substring(currentNode.open.end, currentNode.close.start);
            const innerRootNode = (0, css_parser_1.default)(buffer);
            const innerNode = (0, util_1.getFlatNode)(innerRootNode, offset, true);
            return (innerNode && innerNode.type === 'property') ? innerNode : null;
        }
        return null;
    };
    return updateImageSizeCSS(editor, position, getPropertyInsiderStyleTag);
}
function updateImageSizeCSSFile(editor, position) {
    return updateImageSizeCSS(editor, position, getImageCSSNode);
}
/**
 * Updates image size of context rule of stylesheet model
 */
function updateImageSizeCSS(editor, position, fetchNode) {
    const node = fetchNode(editor, position);
    const src = node && getImageSrcCSS(editor, node, position);
    if (!src) {
        return Promise.reject(new Error('No valid image source'));
    }
    return (0, locateFile_1.locateFile)(path.dirname(editor.document.fileName), src)
        .then(imageSizeHelper_1.getImageSize)
        .then((size) => {
        // since this action is asynchronous, we have to ensure that editor wasn't
        // changed and user didn't moved caret outside <img> node
        const prop = fetchNode(editor, position);
        if (size && prop && getImageSrcCSS(editor, prop, position) === src) {
            return updateCSSNode(editor, prop, size.width, size.height);
        }
        return [];
    })
        .catch(err => { console.warn('Error while updating image size:', err); return []; });
}
/**
 * Returns <img> node under caret in given editor or `null` if such node cannot
 * be found
 */
function getImageHTMLNode(editor, position) {
    const document = editor.document;
    const rootNode = (0, parseDocument_1.getRootNode)(document, true);
    const offset = document.offsetAt(position);
    const node = (0, util_1.getFlatNode)(rootNode, offset, true);
    return node && node.name.toLowerCase() === 'img' ? node : null;
}
/**
 * Returns css property under caret in given editor or `null` if such node cannot
 * be found
 */
function getImageCSSNode(editor, position) {
    const document = editor.document;
    const rootNode = (0, parseDocument_1.getRootNode)(document, true);
    const offset = document.offsetAt(position);
    const node = (0, util_1.getFlatNode)(rootNode, offset, true);
    return node && node.type === 'property' ? node : null;
}
/**
 * Returns image source from given <img> node
 */
function getImageSrcHTML(node) {
    const srcAttr = getAttribute(node, 'src');
    if (!srcAttr) {
        return;
    }
    return srcAttr.value.value;
}
/**
 * Returns image source from given `url()` token
 */
function getImageSrcCSS(editor, node, position) {
    if (!node) {
        return;
    }
    const urlToken = findUrlToken(editor, node, position);
    if (!urlToken) {
        return;
    }
    // A stylesheet token may contain either quoted ('string') or unquoted URL
    let urlValue = urlToken.item(0);
    if (urlValue && urlValue.type === 'string') {
        urlValue = urlValue.item(0);
    }
    return urlValue && urlValue.valueOf();
}
/**
 * Updates size of given HTML node
 */
function updateHTMLTag(editor, node, width, height) {
    const document = editor.document;
    const srcAttr = getAttribute(node, 'src');
    if (!srcAttr) {
        return [];
    }
    const widthAttr = getAttribute(node, 'width');
    const heightAttr = getAttribute(node, 'height');
    const quote = getAttributeQuote(editor, srcAttr);
    const endOfAttributes = node.attributes[node.attributes.length - 1].end;
    const edits = [];
    let textToAdd = '';
    if (!widthAttr) {
        textToAdd += ` width=${quote}${width}${quote}`;
    }
    else {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, widthAttr.value.start, widthAttr.value.end), String(width)));
    }
    if (!heightAttr) {
        textToAdd += ` height=${quote}${height}${quote}`;
    }
    else {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, heightAttr.value.start, heightAttr.value.end), String(height)));
    }
    if (textToAdd) {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, endOfAttributes, endOfAttributes), textToAdd));
    }
    return edits;
}
/**
 * Updates size of given CSS rule
 */
function updateCSSNode(editor, srcProp, width, height) {
    const document = editor.document;
    const rule = srcProp.parent;
    const widthProp = (0, util_1.getCssPropertyFromRule)(rule, 'width');
    const heightProp = (0, util_1.getCssPropertyFromRule)(rule, 'height');
    // Detect formatting
    const separator = srcProp.separator || ': ';
    const before = getPropertyDelimitor(editor, srcProp);
    const edits = [];
    if (!srcProp.terminatorToken) {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, srcProp.end, srcProp.end), ';'));
    }
    let textToAdd = '';
    if (!widthProp) {
        textToAdd += `${before}width${separator}${width}px;`;
    }
    else {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, widthProp.valueToken.start, widthProp.valueToken.end), `${width}px`));
    }
    if (!heightProp) {
        textToAdd += `${before}height${separator}${height}px;`;
    }
    else {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, heightProp.valueToken.start, heightProp.valueToken.end), `${height}px`));
    }
    if (textToAdd) {
        edits.push(new vscode_1.TextEdit((0, util_1.offsetRangeToVsRange)(document, srcProp.end, srcProp.end), textToAdd));
    }
    return edits;
}
/**
 * Returns attribute object with `attrName` name from given HTML node
 */
function getAttribute(node, attrName) {
    attrName = attrName.toLowerCase();
    return node && node.attributes.find(attr => attr.name.toString().toLowerCase() === attrName);
}
/**
 * Returns quote character, used for value of given attribute. May return empty
 * string if attribute wasn't quoted

 */
function getAttributeQuote(editor, attr) {
    const begin = attr.value ? attr.value.end : attr.end;
    const end = attr.end;
    return begin === end ? '' : editor.document.getText().substring(begin, end);
}
/**
 * Finds 'url' token for given `pos` point in given CSS property `node`
 */
function findUrlToken(editor, node, pos) {
    const offset = editor.document.offsetAt(pos);
    if (!('parsedValue' in node) || !Array.isArray(node.parsedValue)) {
        return undefined;
    }
    for (let i = 0, il = node.parsedValue.length, url; i < il; i++) {
        (0, util_1.iterateCSSToken)(node.parsedValue[i], (token) => {
            if (token.type === 'url' && token.start <= offset && token.end >= offset) {
                url = token;
                return false;
            }
            return true;
        });
        if (url) {
            return url;
        }
    }
    return undefined;
}
/**
 * Returns a string that is used to delimit properties in current node's rule
 */
function getPropertyDelimitor(editor, node) {
    let anchor;
    if (anchor = (node.previousSibling || node.parent.contentStartToken)) {
        return editor.document.getText().substring(anchor.end, node.start);
    }
    else if (anchor = (node.nextSibling || node.parent.contentEndToken)) {
        return editor.document.getText().substring(node.end, anchor.start);
    }
    return '';
}
//# sourceMappingURL=updateImageSize.js.map