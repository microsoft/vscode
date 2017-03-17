/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var assert = require("assert");
var i18n = require("../i18n");
suite('XLF Parser Tests', function () {
    var sampleXlf = '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="vs/base/common/keybinding" source-language="en" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source></trans-unit></body></file></xliff>';
    var sampleTranslatedXlf = '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="vs/base/common/keybinding" source-language="en" target-language="ru" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source><target>Кнопка #1</target></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source><target>Кнопка #2 &amp;</target></trans-unit></body></file></xliff>';
    var originalFilePath = 'vs/base/common/keybinding';
    var keys = ['key1', 'key2'];
    var messages = ['Key #1', 'Key #2 &'];
    var translatedMessages = { key1: 'Кнопка #1', key2: 'Кнопка #2 &' };
    test('Keys & messages to XLF conversion', function () {
        var xlf = new i18n.XLF('vscode-workbench');
        xlf.addFile(originalFilePath, keys, messages);
        var xlfString = xlf.toString();
        assert.strictEqual(xlfString.replace(/\s{2,}/g, ''), sampleXlf);
    });
    test('XLF to keys & messages conversion', function () {
        i18n.XLF.parse(sampleTranslatedXlf).then(function (resolvedFiles) {
            assert.deepEqual(resolvedFiles[0].messages, translatedMessages);
            assert.strictEqual(resolvedFiles[0].originalFilePath, originalFilePath);
        });
    });
    test('JSON file source path to Transifex resource match', function () {
        var editorProject = 'vscode-editor', workbenchProject = 'vscode-workbench';
        var platform = { name: 'vs/platform', project: editorProject }, editorContrib = { name: 'vs/editor/contrib', project: editorProject }, editor = { name: 'vs/editor', project: editorProject }, base = { name: 'vs/base', project: editorProject }, code = { name: 'vs/code', project: workbenchProject }, workbenchParts = { name: 'vs/workbench/parts/html', project: workbenchProject }, workbenchServices = { name: 'vs/workbench/services/files', project: workbenchProject }, workbench = { name: 'vs/workbench', project: workbenchProject };
        assert.deepEqual(i18n.getResource('vs/platform/actions/browser/menusExtensionPoint'), platform);
        assert.deepEqual(i18n.getResource('vs/editor/contrib/clipboard/browser/clipboard'), editorContrib);
        assert.deepEqual(i18n.getResource('vs/editor/common/modes/modesRegistry'), editor);
        assert.deepEqual(i18n.getResource('vs/base/common/errorMessage'), base);
        assert.deepEqual(i18n.getResource('vs/code/electron-main/window'), code);
        assert.deepEqual(i18n.getResource('vs/workbench/parts/html/browser/webview'), workbenchParts);
        assert.deepEqual(i18n.getResource('vs/workbench/services/files/node/fileService'), workbenchServices);
        assert.deepEqual(i18n.getResource('vs/workbench/browser/parts/panel/panelActions'), workbench);
    });
});
