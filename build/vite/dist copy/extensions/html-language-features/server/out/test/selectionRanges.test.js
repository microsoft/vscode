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
require("mocha");
const assert = __importStar(require("assert"));
const languageModes_1 = require("../modes/languageModes");
const selectionRanges_1 = require("../modes/selectionRanges");
const nodeFs_1 = require("../node/nodeFs");
async function assertRanges(content, expected) {
    let message = `${content} gives selection range:\n`;
    const offset = content.indexOf('|');
    content = content.substr(0, offset) + content.substr(offset + 1);
    const workspace = {
        settings: {},
        folders: [{ name: 'foo', uri: 'test://foo' }]
    };
    const languageModes = (0, languageModes_1.getLanguageModes)({ css: true, javascript: true }, workspace, languageModes_1.ClientCapabilities.LATEST, (0, nodeFs_1.getNodeFileFS)());
    const document = languageModes_1.TextDocument.create('test://foo.html', 'html', 1, content);
    const actualRanges = await (0, selectionRanges_1.getSelectionRanges)(languageModes, document, [document.positionAt(offset)]);
    assert.strictEqual(actualRanges.length, 1);
    const offsetPairs = [];
    let curr = actualRanges[0];
    while (curr) {
        offsetPairs.push([document.offsetAt(curr.range.start), document.getText(curr.range)]);
        curr = curr.parent;
    }
    message += `${JSON.stringify(offsetPairs)}\n but should give:\n${JSON.stringify(expected)}\n`;
    assert.deepStrictEqual(offsetPairs, expected, message);
}
suite('HTML SelectionRange', () => {
    test('Embedded JavaScript', async () => {
        await assertRanges('<html><head><script>  function foo() { return ((1|+2)*6) }</script></head></html>', [
            [48, '1'],
            [48, '1+2'],
            [47, '(1+2)'],
            [47, '(1+2)*6'],
            [46, '((1+2)*6)'],
            [39, 'return ((1+2)*6)'],
            [22, 'function foo() { return ((1+2)*6) }'],
            [20, '  function foo() { return ((1+2)*6) }'],
            [12, '<script>  function foo() { return ((1+2)*6) }</script>'],
            [6, '<head><script>  function foo() { return ((1+2)*6) }</script></head>'],
            [0, '<html><head><script>  function foo() { return ((1+2)*6) }</script></head></html>'],
        ]);
    });
    test('Embedded CSS', async () => {
        await assertRanges('<html><head><style>foo { display: |none; } </style></head></html>', [
            [34, 'none'],
            [25, 'display: none'],
            [24, ' display: none; '],
            [23, '{ display: none; }'],
            [19, 'foo { display: none; }'],
            [19, 'foo { display: none; } '],
            [12, '<style>foo { display: none; } </style>'],
            [6, '<head><style>foo { display: none; } </style></head>'],
            [0, '<html><head><style>foo { display: none; } </style></head></html>'],
        ]);
    });
    test('Embedded style', async () => {
        await assertRanges('<div style="color: |red"></div>', [
            [19, 'red'],
            [12, 'color: red'],
            [11, '"color: red"'],
            [5, 'style="color: red"'],
            [1, 'div style="color: red"'],
            [0, '<div style="color: red"></div>']
        ]);
    });
});
//# sourceMappingURL=selectionRanges.test.js.map