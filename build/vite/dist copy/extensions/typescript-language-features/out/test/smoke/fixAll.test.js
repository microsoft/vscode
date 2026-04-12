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
const assert = __importStar(require("assert"));
require("mocha");
const vscode = __importStar(require("vscode"));
const testUtils_1 = require("../../test/testUtils");
const dispose_1 = require("../../utils/dispose");
const testDocumentUri = vscode.Uri.parse('untitled:test.ts');
const emptyRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
suite.skip('TypeScript Fix All', () => {
    const _disposables = [];
    setup(async () => {
        // the tests assume that typescript features are registered
        await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
    });
    teardown(async () => {
        (0, dispose_1.disposeAll)(_disposables);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
    test('Fix all should remove unreachable code', async () => {
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `function foo() {`, `    return 1;`, `    return 2;`, `};`, `function boo() {`, `    return 3;`, `    return 4;`, `};`);
        await (0, testUtils_1.wait)(2000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, emptyRange, vscode.CodeActionKind.SourceFixAll);
        await vscode.workspace.applyEdit(fixes[0].edit);
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`function foo() {`, `    return 1;`, `};`, `function boo() {`, `    return 3;`, `};`));
    });
    test('Fix all should implement interfaces', async () => {
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `interface I {`, `    x: number;`, `}`, `class A implements I {}`, `class B implements I {}`);
        await (0, testUtils_1.wait)(2000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, emptyRange, vscode.CodeActionKind.SourceFixAll);
        await vscode.workspace.applyEdit(fixes[0].edit);
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`interface I {`, `    x: number;`, `}`, `class A implements I {`, `    x: number;`, `}`, `class B implements I {`, `    x: number;`, `}`));
    });
    test('Remove unused should handle nested ununused', async () => {
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `export const _ = 1;`, `function unused() {`, `    const a = 1;`, `}`, `function used() {`, `    const a = 1;`, `}`, `used();`);
        await (0, testUtils_1.wait)(2000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, emptyRange, vscode.CodeActionKind.Source.append('removeUnused'));
        await vscode.workspace.applyEdit(fixes[0].edit);
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`export const _ = 1;`, `function used() {`, `}`, `used();`));
    });
    test('Remove unused should remove unused interfaces', async () => {
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `export const _ = 1;`, `interface Foo {}`);
        await (0, testUtils_1.wait)(2000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, emptyRange, vscode.CodeActionKind.Source.append('removeUnused'));
        await vscode.workspace.applyEdit(fixes[0].edit);
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`export const _ = 1;`, ``));
    });
});
//# sourceMappingURL=fixAll.test.js.map