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
exports.toggleComment = toggleComment;
const vscode = __importStar(require("vscode"));
const util_1 = require("./util");
const css_parser_1 = __importDefault(require("@emmetio/css-parser"));
const parseDocument_1 = require("./parseDocument");
let startCommentStylesheet;
let endCommentStylesheet;
let startCommentHTML;
let endCommentHTML;
function toggleComment() {
    if (!(0, util_1.validate)() || !vscode.window.activeTextEditor) {
        return;
    }
    setupCommentSpacing();
    const editor = vscode.window.activeTextEditor;
    const rootNode = (0, parseDocument_1.getRootNode)(editor.document, true);
    if (!rootNode) {
        return;
    }
    return editor.edit(editBuilder => {
        const allEdits = [];
        Array.from(editor.selections).reverse().forEach(selection => {
            const edits = (0, util_1.isStyleSheet)(editor.document.languageId) ? toggleCommentStylesheet(editor.document, selection, rootNode) : toggleCommentHTML(editor.document, selection, rootNode);
            if (edits.length > 0) {
                allEdits.push(edits);
            }
        });
        // Apply edits in order so we can skip nested ones.
        allEdits.sort((arr1, arr2) => {
            const result = arr1[0].range.start.line - arr2[0].range.start.line;
            return result === 0 ? arr1[0].range.start.character - arr2[0].range.start.character : result;
        });
        let lastEditPosition = new vscode.Position(0, 0);
        for (const edits of allEdits) {
            if (edits[0].range.end.isAfterOrEqual(lastEditPosition)) {
                edits.forEach(x => {
                    editBuilder.replace(x.range, x.newText);
                    lastEditPosition = x.range.end;
                });
            }
        }
    });
}
function toggleCommentHTML(document, selection, rootNode) {
    const selectionStart = selection.isReversed ? selection.active : selection.anchor;
    const selectionEnd = selection.isReversed ? selection.anchor : selection.active;
    const selectionStartOffset = document.offsetAt(selectionStart);
    const selectionEndOffset = document.offsetAt(selectionEnd);
    const documentText = document.getText();
    const startNode = (0, util_1.getHtmlFlatNode)(documentText, rootNode, selectionStartOffset, true);
    const endNode = (0, util_1.getHtmlFlatNode)(documentText, rootNode, selectionEndOffset, true);
    if (!startNode || !endNode) {
        return [];
    }
    if ((0, util_1.sameNodes)(startNode, endNode) && startNode.name === 'style'
        && startNode.open && startNode.close
        && startNode.open.end < selectionStartOffset
        && startNode.close.start > selectionEndOffset) {
        const buffer = ' '.repeat(startNode.open.end) +
            documentText.substring(startNode.open.end, startNode.close.start);
        const cssRootNode = (0, css_parser_1.default)(buffer);
        return toggleCommentStylesheet(document, selection, cssRootNode);
    }
    const allNodes = (0, util_1.getNodesInBetween)(startNode, endNode);
    let edits = [];
    allNodes.forEach(node => {
        edits = edits.concat(getRangesToUnCommentHTML(node, document));
    });
    if (startNode.type === 'comment') {
        return edits;
    }
    edits.push(new vscode.TextEdit((0, util_1.offsetRangeToVsRange)(document, allNodes[0].start, allNodes[0].start), startCommentHTML));
    edits.push(new vscode.TextEdit((0, util_1.offsetRangeToVsRange)(document, allNodes[allNodes.length - 1].end, allNodes[allNodes.length - 1].end), endCommentHTML));
    return edits;
}
function getRangesToUnCommentHTML(node, document) {
    let unCommentTextEdits = [];
    // If current node is commented, then uncomment and return
    if (node.type === 'comment') {
        unCommentTextEdits.push(new vscode.TextEdit((0, util_1.offsetRangeToVsRange)(document, node.start, node.start + startCommentHTML.length), ''));
        unCommentTextEdits.push(new vscode.TextEdit((0, util_1.offsetRangeToVsRange)(document, node.end - endCommentHTML.length, node.end), ''));
        return unCommentTextEdits;
    }
    // All children of current node should be uncommented
    node.children.forEach(childNode => {
        unCommentTextEdits = unCommentTextEdits.concat(getRangesToUnCommentHTML(childNode, document));
    });
    return unCommentTextEdits;
}
function toggleCommentStylesheet(document, selection, rootNode) {
    const selectionStart = selection.isReversed ? selection.active : selection.anchor;
    const selectionEnd = selection.isReversed ? selection.anchor : selection.active;
    let selectionStartOffset = document.offsetAt(selectionStart);
    let selectionEndOffset = document.offsetAt(selectionEnd);
    const startNode = (0, util_1.getFlatNode)(rootNode, selectionStartOffset, true);
    const endNode = (0, util_1.getFlatNode)(rootNode, selectionEndOffset, true);
    if (!selection.isEmpty) {
        selectionStartOffset = adjustStartNodeCss(startNode, selectionStartOffset, rootNode);
        selectionEndOffset = adjustEndNodeCss(endNode, selectionEndOffset, rootNode);
        selection = (0, util_1.offsetRangeToSelection)(document, selectionStartOffset, selectionEndOffset);
    }
    else if (startNode) {
        selectionStartOffset = startNode.start;
        selectionEndOffset = startNode.end;
        selection = (0, util_1.offsetRangeToSelection)(document, selectionStartOffset, selectionEndOffset);
    }
    // Uncomment the comments that intersect with the selection.
    const rangesToUnComment = [];
    const edits = [];
    rootNode.comments.forEach(comment => {
        const commentRange = (0, util_1.offsetRangeToVsRange)(document, comment.start, comment.end);
        if (selection.intersection(commentRange)) {
            rangesToUnComment.push(commentRange);
            edits.push(new vscode.TextEdit((0, util_1.offsetRangeToVsRange)(document, comment.start, comment.start + startCommentStylesheet.length), ''));
            edits.push(new vscode.TextEdit((0, util_1.offsetRangeToVsRange)(document, comment.end - endCommentStylesheet.length, comment.end), ''));
        }
    });
    if (edits.length > 0) {
        return edits;
    }
    return [
        new vscode.TextEdit(new vscode.Range(selection.start, selection.start), startCommentStylesheet),
        new vscode.TextEdit(new vscode.Range(selection.end, selection.end), endCommentStylesheet)
    ];
}
function setupCommentSpacing() {
    const config = vscode.workspace.getConfiguration('editor.comments').get('insertSpace');
    if (config) {
        startCommentStylesheet = '/* ';
        endCommentStylesheet = ' */';
        startCommentHTML = '<!-- ';
        endCommentHTML = ' -->';
    }
    else {
        startCommentStylesheet = '/*';
        endCommentStylesheet = '*/';
        startCommentHTML = '<!--';
        endCommentHTML = '-->';
    }
}
function adjustStartNodeCss(node, offset, rootNode) {
    for (const comment of rootNode.comments) {
        if (comment.start <= offset && offset <= comment.end) {
            return offset;
        }
    }
    if (!node) {
        return offset;
    }
    if (node.type === 'property') {
        return node.start;
    }
    const rule = node;
    if (offset < rule.contentStartToken.end || !rule.firstChild) {
        return rule.start;
    }
    if (offset < rule.firstChild.start) {
        return offset;
    }
    let newStartNode = rule.firstChild;
    while (newStartNode.nextSibling && offset > newStartNode.end) {
        newStartNode = newStartNode.nextSibling;
    }
    return newStartNode.start;
}
function adjustEndNodeCss(node, offset, rootNode) {
    for (const comment of rootNode.comments) {
        if (comment.start <= offset && offset <= comment.end) {
            return offset;
        }
    }
    if (!node) {
        return offset;
    }
    if (node.type === 'property') {
        return node.end;
    }
    const rule = node;
    if (offset === rule.contentEndToken.end || !rule.firstChild) {
        return rule.end;
    }
    if (offset > rule.children[rule.children.length - 1].end) {
        return offset;
    }
    let newEndNode = rule.children[rule.children.length - 1];
    while (newEndNode.previousSibling && offset < newEndNode.start) {
        newEndNode = newEndNode.previousSibling;
    }
    return newEndNode.end;
}
//# sourceMappingURL=toggleComment.js.map