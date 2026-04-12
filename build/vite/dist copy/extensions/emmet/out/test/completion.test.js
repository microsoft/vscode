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
const vscode_1 = require("vscode");
const defaultCompletionProvider_1 = require("../defaultCompletionProvider");
const testUtils_1 = require("./testUtils");
const completionProvider = new defaultCompletionProvider_1.DefaultCompletionItemProvider();
suite('Tests for completion in CSS embedded in HTML', () => {
    teardown(testUtils_1.closeAllEditors);
    test('style attribute & attribute value in html', async () => {
        await testCompletionProvider('html', '<div style="|"', [{ label: 'padding: ;' }]);
        await testCompletionProvider('html', `<div style='|'`, [{ label: 'padding: ;' }]);
        await testCompletionProvider('html', `<div style='p|'`, [{ label: 'padding: ;' }]);
        await testCompletionProvider('html', `<div style='color: #0|'`, [{ label: '#000000' }]);
    });
    // https://github.com/microsoft/vscode/issues/79766
    test('microsoft/vscode#79766, correct region determination', async () => {
        await testCompletionProvider('html', `<div style="color: #000">di|</div>`, [
            { label: 'div', documentation: `<div>|</div>` }
        ]);
    });
    // https://github.com/microsoft/vscode/issues/86941
    test('microsoft/vscode#86941, widows should be completed after width', async () => {
        await testCompletionProvider('css', `.foo { wi| }`, [
            { label: 'width: ;', documentation: `width: |;` }
        ]);
        await testCompletionProvider('css', `.foo { wid| }`, [
            { label: 'width: ;', documentation: `width: |;` }
        ]);
        try {
            await testCompletionProvider('css', `.foo { wi| }`, [
                { label: 'widows: ;', documentation: `widows: |;` }
            ]);
        }
        catch (e) {
            assert.strictEqual(e.message, `Didn't find completion item with label widows: ;`);
        }
        try {
            await testCompletionProvider('css', `.foo { wid| }`, [
                { label: 'widows: ;', documentation: `widows: |;` }
            ]);
        }
        catch (e) {
            assert.strictEqual(e.message, `Didn't find completion item with label widows: ;`);
        }
        await testCompletionProvider('css', `.foo { wido| }`, [
            { label: 'widows: ;', documentation: `widows: |;` }
        ]);
    });
    // https://github.com/microsoft/vscode/issues/117020
    test('microsoft/vscode#117020, ! at end of abbreviation should have completion', async () => {
        await testCompletionProvider('css', `.foo { bdbn!| }`, [
            { label: 'border-bottom: none !important;', documentation: `border-bottom: none !important;` }
        ]);
    });
    // https://github.com/microsoft/vscode/issues/138461
    test('microsoft/vscode#138461, JSX array noise', async () => {
        await testCompletionProvider('jsx', 'a[i]', undefined);
        await testCompletionProvider('jsx', 'Component[a b]', undefined);
        await testCompletionProvider('jsx', '[a, b]', undefined);
        await testCompletionProvider('jsx', '[a=b]', [
            { label: '<div a="b"></div>', documentation: '<div a="b">|</div>' }
        ]);
    });
    // https://github.com/microsoft/vscode-emmet-helper/pull/90
    test('microsoft/vscode-emmet-helper#90', async () => {
        await testCompletionProvider('html', 'dialog', [
            { label: '<dialog></dialog>', documentation: '<dialog>|</dialog>' }
        ]);
    });
});
function testCompletionProvider(fileExtension, contents, expectedItems) {
    const cursorPos = contents.indexOf('|');
    const slicedContents = contents.slice(0, cursorPos) + contents.slice(cursorPos + 1);
    return (0, testUtils_1.withRandomFileEditor)(slicedContents, fileExtension, async (editor, _doc) => {
        const selection = new vscode_1.Selection(editor.document.positionAt(cursorPos), editor.document.positionAt(cursorPos));
        editor.selection = selection;
        const cancelSrc = new vscode_1.CancellationTokenSource();
        const completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, { triggerKind: vscode_1.CompletionTriggerKind.Invoke, triggerCharacter: undefined });
        if (!completionPromise) {
            return Promise.resolve();
        }
        const completionList = await completionPromise;
        if (!completionList || !completionList.items || !completionList.items.length) {
            if (completionList === undefined) {
                assert.strictEqual(expectedItems, completionList);
            }
            return Promise.resolve();
        }
        assert.strictEqual(expectedItems === undefined, false);
        expectedItems.forEach(eItem => {
            const matches = completionList.items.filter(i => i.label === eItem.label);
            const match = matches && matches.length > 0 ? matches[0] : undefined;
            assert.ok(match, `Didn't find completion item with label ${eItem.label}`);
            if (match) {
                assert.strictEqual(match.detail, 'Emmet Abbreviation', `Match needs to come from Emmet`);
                if (eItem.documentation) {
                    assert.strictEqual(match.documentation, eItem.documentation, `Emmet completion Documentation doesn't match`);
                }
            }
        });
        return Promise.resolve();
    });
}
//# sourceMappingURL=completion.test.js.map