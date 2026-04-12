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
const util_1 = require("./util");
const testFileA = workspaceFile('a.md');
const debug = false;
function debugLog(...args) {
    if (debug) {
        console.log(...args);
    }
}
function workspaceFile(...segments) {
    return vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, ...segments);
}
async function getLinksForFile(file) {
    debugLog('getting links', file.toString(), Date.now());
    const r = (await vscode.commands.executeCommand('vscode.executeLinkProvider', file, /*linkResolveCount*/ 100));
    debugLog('got links', file.toString(), Date.now());
    return r;
}
(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('Markdown Document links', () => {
    setup(async () => {
        // the tests make the assumption that link providers are already registered
        await vscode.extensions.getExtension('vscode.markdown-language-features').activate();
    });
    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
    test('Should navigate to markdown file', async () => {
        await withFileContents(testFileA, '[b](b.md)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('b.md'));
    });
    test('Should navigate to markdown file with leading ./', async () => {
        await withFileContents(testFileA, '[b](./b.md)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('b.md'));
    });
    test('Should navigate to markdown file with leading /', async () => {
        await withFileContents(testFileA, '[b](./b.md)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('b.md'));
    });
    test('Should navigate to markdown file without file extension', async () => {
        await withFileContents(testFileA, '[b](b)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('b.md'));
    });
    test('Should navigate to markdown file in directory', async () => {
        await withFileContents(testFileA, '[b](sub/c)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
    });
    test('Should navigate to fragment by title in file', async () => {
        await withFileContents(testFileA, '[b](sub/c#second)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
        assert.strictEqual(vscode.window.activeTextEditor.selection.start.line, 1);
    });
    test('Should navigate to fragment by line', async () => {
        await withFileContents(testFileA, '[b](sub/c#L2)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
        assert.strictEqual(vscode.window.activeTextEditor.selection.start.line, 1);
    });
    test('Should navigate to line number within non-md file', async () => {
        await withFileContents(testFileA, '[b](sub/foo.txt#L3)');
        const [link] = await getLinksForFile(testFileA);
        await executeLink(link);
        assertActiveDocumentUri(workspaceFile('sub', 'foo.txt'));
        assert.strictEqual(vscode.window.activeTextEditor.selection.start.line, 2);
    });
    test('Should navigate to fragment within current file', async () => {
        await withFileContents(testFileA, (0, util_1.joinLines)('[](a#header)', '[](#header)', '# Header'));
        const links = await getLinksForFile(testFileA);
        {
            await executeLink(links[0]);
            assertActiveDocumentUri(workspaceFile('a.md'));
            assert.strictEqual(vscode.window.activeTextEditor.selection.start.line, 2);
        }
        {
            await executeLink(links[1]);
            assertActiveDocumentUri(workspaceFile('a.md'));
            assert.strictEqual(vscode.window.activeTextEditor.selection.start.line, 2);
        }
    });
    test.skip('Should navigate to fragment within current untitled file', async () => {
        const testFile = workspaceFile('x.md').with({ scheme: 'untitled' });
        await withFileContents(testFile, (0, util_1.joinLines)('[](#second)', '# Second'));
        const [link] = await getLinksForFile(testFile);
        await executeLink(link);
        assertActiveDocumentUri(testFile);
        assert.strictEqual(vscode.window.activeTextEditor.selection.start.line, 1);
    });
});
function assertActiveDocumentUri(expectedUri) {
    assert.strictEqual(vscode.window.activeTextEditor.document.uri.fsPath, expectedUri.fsPath);
}
async function withFileContents(file, contents) {
    debugLog('openTextDocument', file.toString(), Date.now());
    const document = await vscode.workspace.openTextDocument(file);
    debugLog('showTextDocument', file.toString(), Date.now());
    const editor = await vscode.window.showTextDocument(document);
    debugLog('editTextDocument', file.toString(), Date.now());
    await editor.edit(edit => {
        edit.replace(new vscode.Range(0, 0, 1000, 0), contents);
    });
    debugLog('opened done', vscode.window.activeTextEditor?.document.toString(), Date.now());
}
async function executeLink(link) {
    debugLog('executingLink', link.target?.toString(), Date.now());
    await vscode.commands.executeCommand('vscode.open', link.target);
    debugLog('executedLink', vscode.window.activeTextEditor?.document.toString(), Date.now());
}
//# sourceMappingURL=documentLink.test.js.map