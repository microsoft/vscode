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
const vscode_1 = require("vscode");
const testUtils_1 = require("./testUtils");
const evaluateMathExpression_1 = require("../evaluateMathExpression");
suite('Tests for Evaluate Math Expression', () => {
    teardown(testUtils_1.closeAllEditors);
    function testEvaluateMathExpression(fileContents, selection, expectedFileContents) {
        return (0, testUtils_1.withRandomFileEditor)(fileContents, 'html', async (editor, _doc) => {
            const selectionToUse = typeof selection === 'number' ?
                new vscode_1.Selection(new vscode_1.Position(0, selection), new vscode_1.Position(0, selection)) :
                new vscode_1.Selection(new vscode_1.Position(0, selection[0]), new vscode_1.Position(0, selection[1]));
            editor.selection = selectionToUse;
            await (0, evaluateMathExpression_1.evaluateMathExpression)();
            assert.strictEqual(editor.document.getText(), expectedFileContents);
            return Promise.resolve();
        });
    }
    test('Selected sanity check', () => {
        return testEvaluateMathExpression('1 + 2', [0, 5], '3');
    });
    test('Selected with surrounding text', () => {
        return testEvaluateMathExpression('test1 + 2test', [4, 9], 'test3test');
    });
    test('Selected with number not part of selection', () => {
        return testEvaluateMathExpression('test3 1+2', [6, 9], 'test3 3');
    });
    test('Non-selected sanity check', () => {
        return testEvaluateMathExpression('1 + 2', 5, '3');
    });
    test('Non-selected midway', () => {
        return testEvaluateMathExpression('1 + 2', 1, '1 + 2');
    });
    test('Non-selected with surrounding text', () => {
        return testEvaluateMathExpression('test1 + 3test', 9, 'test4test');
    });
});
//# sourceMappingURL=evaluateMathExpression.test.js.map