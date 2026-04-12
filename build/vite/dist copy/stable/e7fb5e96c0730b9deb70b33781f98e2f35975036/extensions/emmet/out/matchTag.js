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
exports.matchTag = matchTag;
const vscode = __importStar(require("vscode"));
const util_1 = require("./util");
const parseDocument_1 = require("./parseDocument");
function matchTag() {
    if (!(0, util_1.validate)(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const document = editor.document;
    const rootNode = (0, parseDocument_1.getRootNode)(document, true);
    if (!rootNode) {
        return;
    }
    const updatedSelections = [];
    editor.selections.forEach(selection => {
        const updatedSelection = getUpdatedSelections(document, rootNode, selection.start);
        if (updatedSelection) {
            updatedSelections.push(updatedSelection);
        }
    });
    if (updatedSelections.length) {
        editor.selections = updatedSelections;
        editor.revealRange(editor.selections[updatedSelections.length - 1]);
    }
}
function getUpdatedSelections(document, rootNode, position) {
    const offset = document.offsetAt(position);
    const currentNode = (0, util_1.getHtmlFlatNode)(document.getText(), rootNode, offset, true);
    if (!currentNode) {
        return;
    }
    // If no opening/closing tag or cursor is between open and close tag, then no-op
    if (!currentNode.open
        || !currentNode.close
        || (offset > currentNode.open.end && offset < currentNode.close.start)) {
        return;
    }
    // Place cursor inside the close tag if cursor is inside the open tag, else place it inside the open tag
    const finalOffset = (offset <= currentNode.open.end) ? currentNode.close.start + 2 : currentNode.start + 1;
    return (0, util_1.offsetRangeToSelection)(document, finalOffset, finalOffset);
}
//# sourceMappingURL=matchTag.js.map