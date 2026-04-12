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
suite.skip('TypeScript Quick Fix', () => {
    const _disposables = [];
    setup(async () => {
        // the tests assume that typescript features are registered
        await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
    });
    teardown(async () => {
        (0, dispose_1.disposeAll)(_disposables);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
    test('Fix all should not be marked as preferred #97866', async () => {
        const testDocumentUri = vscode.Uri.parse('untitled:test.ts');
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `export const _ = 1;`, `const a$0 = 1;`, `const b = 2;`);
        await (0, testUtils_1.retryUntilDocumentChanges)(testDocumentUri, { retries: 10, timeout: 500 }, _disposables, () => {
            return vscode.commands.executeCommand('editor.action.autoFix');
        });
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`export const _ = 1;`, `const b = 2;`));
    });
    test('Add import should be a preferred fix if there is only one possible import', async () => {
        const testDocumentUri = workspaceFile('foo.ts');
        await (0, testUtils_1.createTestEditor)(testDocumentUri, `export const foo = 1;`);
        const editor = await (0, testUtils_1.createTestEditor)(workspaceFile('index.ts'), `export const _ = 1;`, `foo$0;`);
        await (0, testUtils_1.retryUntilDocumentChanges)(testDocumentUri, { retries: 10, timeout: 500 }, _disposables, () => {
            return vscode.commands.executeCommand('editor.action.autoFix');
        });
        // Document should not have been changed here
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`import { foo } from "./foo";`, ``, `export const _ = 1;`, `foo;`));
    });
    test('Add import should not be a preferred fix if are multiple possible imports', async () => {
        await (0, testUtils_1.createTestEditor)(workspaceFile('foo.ts'), `export const foo = 1;`);
        await (0, testUtils_1.createTestEditor)(workspaceFile('bar.ts'), `export const foo = 1;`);
        const editor = await (0, testUtils_1.createTestEditor)(workspaceFile('index.ts'), `export const _ = 1;`, `foo$0;`);
        await (0, testUtils_1.wait)(3000);
        await vscode.commands.executeCommand('editor.action.autoFix');
        await (0, testUtils_1.wait)(500);
        assert.strictEqual(editor.document.getText(), (0, testUtils_1.joinLines)(`export const _ = 1;`, `foo;`));
    });
    test('Only a single ts-ignore should be returned if there are multiple errors on one line #98274', async () => {
        const testDocumentUri = workspaceFile('foojs.js');
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `//@ts-check`, `const a = require('./bla');`);
        await (0, testUtils_1.wait)(3000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, editor.document.lineAt(1).range);
        const ignoreFixes = fixes?.filter(x => x.title === 'Ignore this error message');
        assert.strictEqual(ignoreFixes?.length, 1);
    });
    test('Should prioritize implement interface over remove unused #94212', async () => {
        const testDocumentUri = workspaceFile('foo.ts');
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `export interface IFoo { value: string; }`, `class Foo implements IFoo { }`);
        await (0, testUtils_1.wait)(3000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, editor.document.lineAt(1).range);
        assert.strictEqual(fixes?.length, 2);
        assert.strictEqual(fixes[0].title, `Implement interface 'IFoo'`);
        assert.strictEqual(fixes[1].title, `Remove unused declaration for: 'Foo'`);
    });
    test('Should prioritize implement abstract class over remove unused #101486', async () => {
        const testDocumentUri = workspaceFile('foo.ts');
        const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `export abstract class Foo { abstract foo(): number; }`, `class ConcreteFoo extends Foo { }`);
        await (0, testUtils_1.wait)(3000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', testDocumentUri, editor.document.lineAt(1).range);
        assert.strictEqual(fixes?.length, 2);
        assert.strictEqual(fixes[0].title, `Implement inherited abstract class`);
        assert.strictEqual(fixes[1].title, `Remove unused declaration for: 'ConcreteFoo'`);
    });
    test('Add all missing imports should come after other add import fixes #98613', async () => {
        await (0, testUtils_1.createTestEditor)(workspaceFile('foo.ts'), `export const foo = 1;`);
        await (0, testUtils_1.createTestEditor)(workspaceFile('bar.ts'), `export const foo = 1;`);
        const editor = await (0, testUtils_1.createTestEditor)(workspaceFile('index.ts'), `export const _ = 1;`, `foo$0;`, `foo$0;`);
        await (0, testUtils_1.wait)(3000);
        const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', workspaceFile('index.ts'), editor.document.lineAt(1).range);
        assert.strictEqual(fixes?.length, 3);
        assert.strictEqual(fixes[0].title, `Import 'foo' from module "./bar"`);
        assert.strictEqual(fixes[1].title, `Import 'foo' from module "./foo"`);
        assert.strictEqual(fixes[2].title, `Add all missing imports`);
    });
});
function workspaceFile(fileName) {
    return vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, fileName);
}
//# sourceMappingURL=quickFix.test.js.map