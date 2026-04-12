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
exports.nextItemStylesheet = nextItemStylesheet;
exports.prevItemStylesheet = prevItemStylesheet;
const vscode = __importStar(require("vscode"));
const util_1 = require("./util");
function nextItemStylesheet(document, startPosition, endPosition, rootNode) {
    const startOffset = document.offsetAt(startPosition);
    const endOffset = document.offsetAt(endPosition);
    let currentNode = (0, util_1.getFlatNode)(rootNode, endOffset, true);
    if (!currentNode) {
        currentNode = rootNode;
    }
    if (!currentNode) {
        return;
    }
    // Full property is selected, so select full property value next
    if (currentNode.type === 'property' &&
        startOffset === currentNode.start &&
        endOffset === currentNode.end) {
        return getSelectionFromProperty(document, currentNode, startOffset, endOffset, true, 'next');
    }
    // Part or whole of propertyValue is selected, so select the next word in the propertyValue
    if (currentNode.type === 'property' &&
        startOffset >= currentNode.valueToken.start &&
        endOffset <= currentNode.valueToken.end) {
        const singlePropertyValue = getSelectionFromProperty(document, currentNode, startOffset, endOffset, false, 'next');
        if (singlePropertyValue) {
            return singlePropertyValue;
        }
    }
    // Cursor is in the selector or in a property
    if ((currentNode.type === 'rule' && endOffset < currentNode.selectorToken.end)
        || (currentNode.type === 'property' && endOffset < currentNode.valueToken.end)) {
        return getSelectionFromNode(document, currentNode);
    }
    // Get the first child of current node which is right after the cursor
    let nextNode = currentNode.firstChild;
    while (nextNode && endOffset >= nextNode.end) {
        nextNode = nextNode.nextSibling;
    }
    // Get next sibling of current node or the parent
    while (!nextNode && currentNode) {
        nextNode = currentNode.nextSibling;
        currentNode = currentNode.parent;
    }
    return nextNode ? getSelectionFromNode(document, nextNode) : undefined;
}
function prevItemStylesheet(document, startPosition, endPosition, rootNode) {
    const startOffset = document.offsetAt(startPosition);
    const endOffset = document.offsetAt(endPosition);
    let currentNode = (0, util_1.getFlatNode)(rootNode, startOffset, false);
    if (!currentNode) {
        currentNode = rootNode;
    }
    if (!currentNode) {
        return;
    }
    // Full property value is selected, so select the whole property next
    if (currentNode.type === 'property' &&
        startOffset === currentNode.valueToken.start &&
        endOffset === currentNode.valueToken.end) {
        return getSelectionFromNode(document, currentNode);
    }
    // Part of propertyValue is selected, so select the prev word in the propertyValue
    if (currentNode.type === 'property' &&
        startOffset >= currentNode.valueToken.start &&
        endOffset <= currentNode.valueToken.end) {
        const singlePropertyValue = getSelectionFromProperty(document, currentNode, startOffset, endOffset, false, 'prev');
        if (singlePropertyValue) {
            return singlePropertyValue;
        }
    }
    if (currentNode.type === 'property' || !currentNode.firstChild ||
        (currentNode.type === 'rule' && startOffset <= currentNode.firstChild.start)) {
        return getSelectionFromNode(document, currentNode);
    }
    // Select the child that appears just before the cursor
    let prevNode = currentNode.firstChild;
    while (prevNode.nextSibling && startOffset >= prevNode.nextSibling.end) {
        prevNode = prevNode.nextSibling;
    }
    prevNode = (0, util_1.getDeepestFlatNode)(prevNode);
    return getSelectionFromProperty(document, prevNode, startOffset, endOffset, false, 'prev');
}
function getSelectionFromNode(document, node) {
    if (!node) {
        return;
    }
    const nodeToSelect = node.type === 'rule' ? node.selectorToken : node;
    return (0, util_1.offsetRangeToSelection)(document, nodeToSelect.start, nodeToSelect.end);
}
function getSelectionFromProperty(document, node, selectionStart, selectionEnd, selectFullValue, direction) {
    if (!node || node.type !== 'property') {
        return;
    }
    const propertyNode = node;
    const propertyValue = propertyNode.valueToken.stream.substring(propertyNode.valueToken.start, propertyNode.valueToken.end);
    selectFullValue = selectFullValue ||
        (direction === 'prev' && selectionStart === propertyNode.valueToken.start && selectionEnd < propertyNode.valueToken.end);
    if (selectFullValue) {
        return (0, util_1.offsetRangeToSelection)(document, propertyNode.valueToken.start, propertyNode.valueToken.end);
    }
    let pos = -1;
    if (direction === 'prev') {
        if (selectionStart === propertyNode.valueToken.start) {
            return;
        }
        const selectionStartChar = document.positionAt(selectionStart).character;
        const tokenStartChar = document.positionAt(propertyNode.valueToken.start).character;
        pos = selectionStart > propertyNode.valueToken.end ? propertyValue.length :
            selectionStartChar - tokenStartChar;
    }
    else if (direction === 'next') {
        if (selectionEnd === propertyNode.valueToken.end &&
            (selectionStart > propertyNode.valueToken.start || !propertyValue.includes(' '))) {
            return;
        }
        const selectionEndChar = document.positionAt(selectionEnd).character;
        const tokenStartChar = document.positionAt(propertyNode.valueToken.start).character;
        pos = selectionEnd === propertyNode.valueToken.end ? -1 :
            selectionEndChar - tokenStartChar - 1;
    }
    const [newSelectionStartOffset, newSelectionEndOffset] = direction === 'prev' ? (0, util_1.findPrevWord)(propertyValue, pos) : (0, util_1.findNextWord)(propertyValue, pos);
    if (!newSelectionStartOffset && !newSelectionEndOffset) {
        return;
    }
    const tokenStart = document.positionAt(propertyNode.valueToken.start);
    const newSelectionStart = tokenStart.translate(0, newSelectionStartOffset);
    const newSelectionEnd = tokenStart.translate(0, newSelectionEndOffset);
    return new vscode.Selection(newSelectionStart, newSelectionEnd);
}
//# sourceMappingURL=selectItemStylesheet.js.map