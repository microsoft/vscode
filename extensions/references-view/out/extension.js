"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const calls = require("./calls");
const references = require("./references");
const tree_1 = require("./tree");
const types = require("./types");
function activate(context) {
    const tree = new tree_1.SymbolsTree();
    references.register(tree, context);
    calls.register(tree, context);
    types.register(tree, context);
    function setInput(input) {
        tree.setInput(input);
    }
    function getInput() {
        return tree.getInput();
    }
    return { setInput, getInput };
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map