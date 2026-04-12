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
exports.balanceOut = balanceOut;
exports.balanceIn = balanceIn;
const vscode = __importStar(require("vscode"));
const util_1 = require("./util");
const parseDocument_1 = require("./parseDocument");
let balanceOutStack = [];
let lastBalancedSelections = [];
function balanceOut() {
    balance(true);
}
function balanceIn() {
    balance(false);
}
function balance(out) {
    if (!(0, util_1.validate)(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const document = editor.document;
    const rootNode = (0, parseDocument_1.getRootNode)(document, true);
    if (!rootNode) {
        return;
    }
    const rangeFn = out ? getRangeToBalanceOut : getRangeToBalanceIn;
    let newSelections = editor.selections.map(selection => {
        return rangeFn(document, rootNode, selection);
    });
    // check whether we are starting a balance elsewhere
    if (areSameSelections(lastBalancedSelections, editor.selections)) {
        // we are not starting elsewhere, so use the stack as-is
        if (out) {
            // make sure we are able to expand outwards
            if (!areSameSelections(editor.selections, newSelections)) {
                balanceOutStack.push(editor.selections);
            }
        }
        else if (balanceOutStack.length) {
            newSelections = balanceOutStack.pop();
        }
    }
    else {
        // we are starting elsewhere, so reset the stack
        balanceOutStack = out ? [editor.selections] : [];
    }
    editor.selections = newSelections;
    lastBalancedSelections = editor.selections;
}
function getRangeToBalanceOut(document, rootNode, selection) {
    const offset = document.offsetAt(selection.start);
    const nodeToBalance = (0, util_1.getHtmlFlatNode)(document.getText(), rootNode, offset, false);
    if (!nodeToBalance) {
        return selection;
    }
    if (!nodeToBalance.open || !nodeToBalance.close) {
        return (0, util_1.offsetRangeToSelection)(document, nodeToBalance.start, nodeToBalance.end);
    }
    // Set reverse direction if we were in the end tag
    let innerSelection;
    let outerSelection;
    if (nodeToBalance.close.start <= offset && nodeToBalance.close.end > offset) {
        innerSelection = (0, util_1.offsetRangeToSelection)(document, nodeToBalance.close.start, nodeToBalance.open.end);
        outerSelection = (0, util_1.offsetRangeToSelection)(document, nodeToBalance.close.end, nodeToBalance.open.start);
    }
    else {
        innerSelection = (0, util_1.offsetRangeToSelection)(document, nodeToBalance.open.end, nodeToBalance.close.start);
        outerSelection = (0, util_1.offsetRangeToSelection)(document, nodeToBalance.open.start, nodeToBalance.close.end);
    }
    if (innerSelection.contains(selection) && !innerSelection.isEqual(selection)) {
        return innerSelection;
    }
    if (outerSelection.contains(selection) && !outerSelection.isEqual(selection)) {
        return outerSelection;
    }
    return selection;
}
function getRangeToBalanceIn(document, rootNode, selection) {
    const offset = document.offsetAt(selection.start);
    const nodeToBalance = (0, util_1.getHtmlFlatNode)(document.getText(), rootNode, offset, true);
    if (!nodeToBalance) {
        return selection;
    }
    const selectionStart = document.offsetAt(selection.start);
    const selectionEnd = document.offsetAt(selection.end);
    if (nodeToBalance.open && nodeToBalance.close) {
        const entireNodeSelected = selectionStart === nodeToBalance.start && selectionEnd === nodeToBalance.end;
        const startInOpenTag = selectionStart > nodeToBalance.open.start && selectionStart < nodeToBalance.open.end;
        const startInCloseTag = selectionStart > nodeToBalance.close.start && selectionStart < nodeToBalance.close.end;
        if (entireNodeSelected || startInOpenTag || startInCloseTag) {
            return (0, util_1.offsetRangeToSelection)(document, nodeToBalance.open.end, nodeToBalance.close.start);
        }
    }
    if (!nodeToBalance.firstChild) {
        return selection;
    }
    const firstChild = nodeToBalance.firstChild;
    if (selectionStart === firstChild.start
        && selectionEnd === firstChild.end
        && firstChild.open
        && firstChild.close) {
        return (0, util_1.offsetRangeToSelection)(document, firstChild.open.end, firstChild.close.start);
    }
    return (0, util_1.offsetRangeToSelection)(document, firstChild.start, firstChild.end);
}
function areSameSelections(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (!a[i].isEqual(b[i])) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=balance.js.map