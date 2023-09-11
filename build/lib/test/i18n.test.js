"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const i18n = require("../i18n");
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
        assert.strictEqual(xlfString.replace(/\s{2,}/g, ''), sampleXlf);
    });
    test('XLF to keys & messages conversion', () => {
        i18n.XLF.parse(sampleTranslatedXlf).then(function (resolvedFiles) {
            assert.deepStrictEqual(resolvedFiles[0].messages, translatedMessages);
            assert.strictEqual(resolvedFiles[0].name, name);
        });
    });
    test('JSON file source path to Transifex resource match', () => {
        const editorProject = 'vscode-editor', workbenchProject = 'vscode-workbench';
        const platform = { name: 'vs/platform', project: editorProject }, editorContrib = { name: 'vs/editor/contrib', project: editorProject }, editor = { name: 'vs/editor', project: editorProject }, base = { name: 'vs/base', project: editorProject }, code = { name: 'vs/code', project: workbenchProject }, workbenchParts = { name: 'vs/workbench/contrib/html', project: workbenchProject }, workbenchServices = { name: 'vs/workbench/services/textfile', project: workbenchProject }, workbench = { name: 'vs/workbench', project: workbenchProject };
        assert.deepStrictEqual(i18n.getResource('vs/platform/actions/browser/menusExtensionPoint'), platform);
        assert.deepStrictEqual(i18n.getResource('vs/editor/contrib/clipboard/browser/clipboard'), editorContrib);
        assert.deepStrictEqual(i18n.getResource('vs/editor/common/modes/modesRegistry'), editor);
        assert.deepStrictEqual(i18n.getResource('vs/base/common/errorMessage'), base);
        assert.deepStrictEqual(i18n.getResource('vs/code/electron-main/window'), code);
        assert.deepStrictEqual(i18n.getResource('vs/workbench/contrib/html/browser/webview'), workbenchParts);
        assert.deepStrictEqual(i18n.getResource('vs/workbench/services/textfile/node/testFileService'), workbenchServices);
        assert.deepStrictEqual(i18n.getResource('vs/workbench/browser/parts/panel/panelActions'), workbench);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaTE4bi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaTE4bi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsaUNBQWtDO0FBQ2xDLGdDQUFpQztBQUVqQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO0lBQzlCLE1BQU0sU0FBUyxHQUFHLGtYQUFrWCxDQUFDO0lBQ3JZLE1BQU0sbUJBQW1CLEdBQUcsaWNBQWljLENBQUM7SUFDOWQsTUFBTSxJQUFJLEdBQUcsMkJBQTJCLENBQUM7SUFDekMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDOUIsTUFBTSxRQUFRLEdBQUcsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDeEMsTUFBTSxrQkFBa0IsR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxDQUFDO0lBRXRFLElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7UUFDOUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDN0MsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVqQyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRTtRQUM5QyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLGFBQWE7WUFDL0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLGtCQUFrQixDQUFDLENBQUM7WUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1FBQzlELE1BQU0sYUFBYSxHQUFXLGVBQWUsRUFDNUMsZ0JBQWdCLEdBQVcsa0JBQWtCLENBQUM7UUFFL0MsTUFBTSxRQUFRLEdBQWtCLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLEVBQzlFLGFBQWEsR0FBRyxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLEVBQ3JFLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxFQUN0RCxJQUFJLEdBQUcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsRUFDbEQsSUFBSSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsRUFDckQsY0FBYyxHQUFHLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxFQUNqRixpQkFBaUIsR0FBRyxFQUFFLElBQUksRUFBRSxnQ0FBZ0MsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsRUFDekYsU0FBUyxHQUFHLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztRQUVqRSxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsaURBQWlELENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN0RyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsK0NBQStDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUN6RyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsc0NBQXNDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN6RixNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsNkJBQTZCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvRSxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsMkNBQTJDLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN0RyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMscURBQXFELENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ25ILE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQywrQ0FBK0MsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3RHLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==