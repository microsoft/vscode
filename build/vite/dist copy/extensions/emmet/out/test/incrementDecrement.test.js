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
const incrementDecrement_1 = require("../incrementDecrement");
function incrementDecrement(delta) {
    const result = (0, incrementDecrement_1.incrementDecrement)(delta);
    assert.ok(result);
    return result;
}
suite('Tests for Increment/Decrement Emmet Commands', () => {
    teardown(testUtils_1.closeAllEditors);
    const contents = `
	hello 123.43 there
	hello 999.9 there
	hello 100 there
	`;
    test('incrementNumberByOne', function () {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'txt', async (editor, doc) => {
            editor.selections = [new vscode_1.Selection(1, 7, 1, 10), new vscode_1.Selection(2, 7, 2, 10)];
            await incrementDecrement(1);
            assert.strictEqual(doc.getText(), contents.replace('123', '124').replace('999', '1000'));
            return Promise.resolve();
        });
    });
    test('incrementNumberByTen', function () {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'txt', async (editor, doc) => {
            editor.selections = [new vscode_1.Selection(1, 7, 1, 10), new vscode_1.Selection(2, 7, 2, 10)];
            await incrementDecrement(10);
            assert.strictEqual(doc.getText(), contents.replace('123', '133').replace('999', '1009'));
            return Promise.resolve();
        });
    });
    test('incrementNumberByOneTenth', function () {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'txt', async (editor, doc) => {
            editor.selections = [new vscode_1.Selection(1, 7, 1, 13), new vscode_1.Selection(2, 7, 2, 12)];
            await incrementDecrement(0.1);
            assert.strictEqual(doc.getText(), contents.replace('123.43', '123.53').replace('999.9', '1000'));
            return Promise.resolve();
        });
    });
    test('decrementNumberByOne', function () {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'txt', async (editor, doc) => {
            editor.selections = [new vscode_1.Selection(1, 7, 1, 10), new vscode_1.Selection(3, 7, 3, 10)];
            await incrementDecrement(-1);
            assert.strictEqual(doc.getText(), contents.replace('123', '122').replace('100', '99'));
            return Promise.resolve();
        });
    });
    test('decrementNumberByTen', function () {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'txt', async (editor, doc) => {
            editor.selections = [new vscode_1.Selection(1, 7, 1, 10), new vscode_1.Selection(3, 7, 3, 10)];
            await incrementDecrement(-10);
            assert.strictEqual(doc.getText(), contents.replace('123', '113').replace('100', '90'));
            return Promise.resolve();
        });
    });
    test('decrementNumberByOneTenth', function () {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'txt', async (editor, doc) => {
            editor.selections = [new vscode_1.Selection(1, 7, 1, 13), new vscode_1.Selection(3, 7, 3, 10)];
            await incrementDecrement(-0.1);
            assert.strictEqual(doc.getText(), contents.replace('123.43', '123.33').replace('100', '99.9'));
            return Promise.resolve();
        });
    });
});
//# sourceMappingURL=incrementDecrement.test.js.map