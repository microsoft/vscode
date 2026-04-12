/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastDeepPartial, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { TerminalClipboardContribution } from '../../browser/terminal.clipboard.contribution.js';
import { shouldPasteTerminalText } from '../../browser/terminalClipboard.js';
suite('TerminalClipboard', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suite('shouldPasteTerminalText', () => {
        let instantiationService;
        let configurationService;
        setup(async () => {
            instantiationService = store.add(new TestInstantiationService());
            configurationService = new TestConfigurationService({
                ["terminal.integrated.enableMultiLinePasteWarning" /* TerminalSettingId.EnableMultiLinePasteWarning */]: 'auto'
            });
            instantiationService.stub(IConfigurationService, configurationService);
            instantiationService.stub(IDialogService, new TestDialogService(undefined, { result: { confirmed: false } }));
        });
        function setConfigValue(value) {
            configurationService = new TestConfigurationService({
                ["terminal.integrated.enableMultiLinePasteWarning" /* TerminalSettingId.EnableMultiLinePasteWarning */]: value
            });
            instantiationService.stub(IConfigurationService, configurationService);
        }
        test('Single line string', async () => {
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo', undefined), true);
            setConfigValue('always');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo', undefined), true);
            setConfigValue('never');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo', undefined), true);
        });
        test('Single line string with trailing new line', async () => {
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\n', undefined), true);
            setConfigValue('always');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\n', undefined), false);
            setConfigValue('never');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\n', undefined), true);
        });
        test('Multi-line string', async () => {
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined), false);
            setConfigValue('always');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined), false);
            setConfigValue('never');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined), true);
        });
        test('Bracketed paste mode', async () => {
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true), true);
            setConfigValue('always');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true), false);
            setConfigValue('never');
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true), true);
        });
        test('Legacy config', async () => {
            setConfigValue(true); // 'auto'
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined), false);
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true), true);
            setConfigValue(false); // 'never'
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true), true);
        });
        test('Invalid config', async () => {
            setConfigValue(123);
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined), false);
            strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true), true);
        });
    });
    suite('TerminalClipboardContribution.paste', () => {
        let instantiationService;
        let clipboardService;
        let contribution;
        let pasted;
        setup(async () => {
            instantiationService = store.add(new TestInstantiationService());
            instantiationService.stub(IConfigurationService, new TestConfigurationService({
                ["terminal.integrated.enableMultiLinePasteWarning" /* TerminalSettingId.EnableMultiLinePasteWarning */]: 'never'
            }));
            instantiationService.stub(IDialogService, new TestDialogService());
            instantiationService.stub(INotificationService, new TestNotificationService());
            instantiationService.stub(ITerminalConfigurationService, upcastPartial({}));
            clipboardService = new TestClipboardService();
            instantiationService.stub(IClipboardService, clipboardService);
            const ctx = upcastPartial({
                instance: upcastPartial({
                    focus: () => { }
                })
            });
            contribution = store.add(instantiationService.createInstance(TerminalClipboardContribution, ctx));
            contribution.xtermReady(upcastDeepPartial({
                onDidRequestCopyAsHtml: Event.None,
                raw: {
                    onSelectionChange: Event.None,
                    modes: { bracketedPasteMode: false },
                    paste: () => { }
                }
            }));
            pasted = undefined;
            store.add(contribution.onDidPaste(e => pasted = e));
        });
        test('Clipboard text', async () => {
            await clipboardService.writeText('hello');
            await clipboardService.writeResources([URI.file('/should/not/be/used')]);
            await contribution.paste();
            strictEqual(pasted, 'hello');
        });
        test('Clipboard resource fallback when text is empty', async () => {
            await clipboardService.writeResources([URI.file('/foo/bar.png'), URI.file('/foo/baz.png')]);
            await contribution.paste();
            strictEqual(pasted, URI.file('/foo/bar.png').fsPath);
        });
        test('Clipboard resource fallback ignores non-file URIs', async () => {
            await clipboardService.writeResources([URI.parse('https://example.com/foo/bar')]);
            await contribution.paste();
            strictEqual(pasted, '');
        });
        test('Empty clipboard', async () => {
            await contribution.paste();
            strictEqual(pasted, '');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDbGlwYm9hcmQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jbGlwYm9hcmQvdGVzdC9icm93c2VyL3Rlcm1pbmFsQ2xpcGJvYXJkLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM5RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUNoSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDeEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDdEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFFekgsT0FBTyxFQUFFLDZCQUE2QixFQUFxQyxN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