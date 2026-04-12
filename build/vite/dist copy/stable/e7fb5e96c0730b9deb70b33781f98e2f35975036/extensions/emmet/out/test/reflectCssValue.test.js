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
const reflectCssValue_1 = require("../reflectCssValue");
function reflectCssValue() {
    const result = (0, reflectCssValue_1.reflectCssValue)();
    assert.ok(result);
    return result;
}
suite('Tests for Emmet: Reflect CSS Value command', () => {
    teardown(testUtils_1.closeAllEditors);
    const cssContents = `
	.header {
		margin: 10px;
		padding: 10px;
		transform: rotate(50deg);
		-moz-transform: rotate(20deg);
		-o-transform: rotate(50deg);
		-webkit-transform: rotate(50deg);
		-ms-transform: rotate(50deg);
	}
	`;
    const htmlContents = `
	<html>
		<style>
			.header {
				margin: 10px;
				padding: 10px;
				transform: rotate(50deg);
				-moz-transform: rotate(20deg);
				-o-transform: rotate(50deg);
				-webkit-transform: rotate(50deg);
				-ms-transform: rotate(50deg);
			}
		</style>
	</html>
	`;
    test('Reflect Css Value in css file', function () {
        return (0, testUtils_1.withRandomFileEditor)(cssContents, '.css', (editor, doc) => {
            editor.selections = [new vscode_1.Selection(5, 10, 5, 10)];
            return reflectCssValue().then(() => {
                assert.strictEqual(doc.getText(), cssContents.replace(/\(50deg\)/g, '(20deg)'));
                return Promise.resolve();
            });
        });
    });
    test('Reflect Css Value in css file, selecting entire property', function () {
        return (0, testUtils_1.withRandomFileEditor)(cssContents, '.css', (editor, doc) => {
            editor.selections = [new vscode_1.Selection(5, 2, 5, 32)];
            return reflectCssValue().then(() => {
                assert.strictEqual(doc.getText(), cssContents.replace(/\(50deg\)/g, '(20deg)'));
                return Promise.resolve();
            });
        });
    });
    test('Reflect Css Value in html file', function () {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, '.html', (editor, doc) => {
            editor.selections = [new vscode_1.Selection(7, 20, 7, 20)];
            return reflectCssValue().then(() => {
                assert.strictEqual(doc.getText(), htmlContents.replace(/\(50deg\)/g, '(20deg)'));
                return Promise.resolve();
            });
        });
    });
    test('Reflect Css Value in html file, selecting entire property', function () {
        return (0, testUtils_1.withRandomFileEditor)(htmlContents, '.html', (editor, doc) => {
            editor.selections = [new vscode_1.Selection(7, 4, 7, 34)];
            return reflectCssValue().then(() => {
                assert.strictEqual(doc.getText(), htmlContents.replace(/\(50deg\)/g, '(20deg)'));
                return Promise.resolve();
            });
        });
    });
});
//# sourceMappingURL=reflectCssValue.test.js.map