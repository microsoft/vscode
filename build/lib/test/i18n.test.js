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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const i18n = __importStar(require("../i18n"));
suite('XLF Parser Tests', () => {
    const sampleXlf = '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="vs/base/common/keybinding" source-language="en" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source></trans-unit></body></file></xliff>';
    const sampleTranslatedXlf = '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="vs/base/common/keybinding" source-language="en" target-language="ru" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source><target>Кнопка #1</target></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source><target>Кнопка #2 &amp;</target></trans-unit></body></file></xliff>';
    const name = 'vs/base/common/keybinding';
    const keys = ['key1', 'key2'];
    const messages = ['Key #1', 'Key #2 &'];
    const translatedMessages = { key1: 'Кнопка #1', key2: 'Кнопка #2 &' };
    test('Keys & messages to XLF conversion', () => {
        const xlf = new i18n.XLF('vscode-workbench');
        xlf.addFile(name, keys, messages);
        const xlfString = xlf.toString();
        assert_1.default.strictEqual(xlfString.replace(/\s{2,}/g, ''), sampleXlf);
    });
    test('XLF to keys & messages conversion', () => {
        i18n.XLF.parse(sampleTranslatedXlf).then(function (resolvedFiles) {
            assert_1.default.deepStrictEqual(resolvedFiles[0].messages, translatedMessages);
            assert_1.default.strictEqual(resolvedFiles[0].name, name);
        });
    });
    test('JSON file source path to Transifex resource match', () => {
        const editorProject = 'vscode-editor', workbenchProject = 'vscode-workbench';
        const platform = { name: 'vs/platform', project: editorProject }, editorContrib = { name: 'vs/editor/contrib', project: editorProject }, editor = { name: 'vs/editor', project: editorProject }, base = { name: 'vs/base', project: editorProject }, code = { name: 'vs/code', project: workbenchProject }, workbenchParts = { name: 'vs/workbench/contrib/html', project: workbenchProject }, workbenchServices = { name: 'vs/workbench/services/textfile', project: workbenchProject }, workbench = { name: 'vs/workbench', project: workbenchProject };
        assert_1.default.deepStrictEqual(i18n.getResource('vs/platform/actions/browser/menusExtensionPoint'), platform);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/editor/contrib/clipboard/browser/clipboard'), editorContrib);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/editor/common/modes/modesRegistry'), editor);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/base/common/errorMessage'), base);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/code/electron-main/window'), code);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/workbench/contrib/html/browser/webview'), workbenchParts);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/workbench/services/textfile/node/testFileService'), workbenchServices);
        assert_1.default.deepStrictEqual(i18n.getResource('vs/workbench/browser/parts/panel/panelActions'), workbench);
    });
});
//# sourceMappingURL=i18n.test.js.map