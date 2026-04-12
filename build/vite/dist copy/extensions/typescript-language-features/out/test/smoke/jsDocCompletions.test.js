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
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../../utils/dispose");
const suggestTestHelpers_1 = require("../suggestTestHelpers");
const testUtils_1 = require("../testUtils");
const testDocumentUri = vscode.Uri.parse('untitled:test.ts');
suite('JSDoc Completions', () => {
    const _disposables = [];
    const configDefaults = Object.freeze({
        [testUtils_1.Config.snippetSuggestions]: 'inline',
    });
    let oldConfig = {};
    setup(async () => {
        // the tests assume that typescript features are registered
        await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
        // Save off config and apply defaults
        oldConfig = await (0, testUtils_1.updateConfig)(testDocumentUri, configDefaults);
    });
    teardown(async () => {
        (0, dispose_1.disposeAll)(_disposables);
        // Restore config
        await (0, testUtils_1.updateConfig)(testDocumentUri, oldConfig);
        return vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
    test('Should complete jsdoc inside single line comment', async () => {
        await (0, testUtils_1.enumerateConfig)(testDocumentUri, testUtils_1.Config.insertMode, testUtils_1.insertModesValues, async (config) => {
            const editor = await (0, testUtils_1.createTestEditor)(testDocumentUri, `/**$0 */`, `function abcdef(x, y) { }`);
            await (0, suggestTestHelpers_1.acceptFirstSuggestion)(testDocumentUri, _disposables);
            (0, testUtils_1.assertEditorContents)(editor, (0, testUtils_1.joinLines)(`/**`, ` * `, ` * @param x ${testUtils_1.CURSOR}`, ` * @param y `, ` */`, `function abcdef(x, y) { }`), `Config: ${config}`);
        });
    });
});
//# sourceMappingURL=jsDocCompletions.test.js.map