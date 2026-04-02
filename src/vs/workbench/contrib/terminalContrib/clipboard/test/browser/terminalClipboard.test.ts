/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
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
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalConfigurationService, ITerminalInstance, IXtermTerminal } from '../../../../terminal/browser/terminal.js';
import { ITerminalContributionContext } from '../../../../terminal/browser/terminalExtensions.js';
import { TerminalClipboardContribution } from '../../browser/terminal.clipboard.contribution.js';
import { shouldPasteTerminalText } from '../../browser/terminalClipboard.js';

suite('TerminalClipboard', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('shouldPasteTerminalText', () => {
		let instantiationService: TestInstantiationService;
		let configurationService: TestConfigurationService;

		setup(async () => {
			instantiationService = store.add(new TestInstantiationService());
			configurationService = new TestConfigurationService({
				[TerminalSettingId.EnableMultiLinePasteWarning]: 'auto'
			});
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IDialogService, new TestDialogService(undefined, { result: { confirmed: false } }));
		});

		function setConfigValue(value: unknown) {
			configurationService = new TestConfigurationService({
				[TerminalSettingId.EnableMultiLinePasteWarning]: value
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
		let instantiationService: TestInstantiationService;
		let clipboardService: TestClipboardService;
		let contribution: TerminalClipboardContribution;
		let pasted: string | undefined;

		setup(async () => {
			instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[TerminalSettingId.EnableMultiLinePasteWarning]: 'never'
			}));
			instantiationService.stub(IDialogService, new TestDialogService());
			instantiationService.stub(INotificationService, new TestNotificationService());
			instantiationService.stub(ITerminalConfigurationService, upcastPartial<ITerminalConfigurationService>({}));
			clipboardService = new TestClipboardService();
			instantiationService.stub(IClipboardService, clipboardService);

			const ctx = upcastPartial<ITerminalContributionContext>({
				instance: upcastPartial<ITerminalInstance>({
					focus: () => { }
				})
			});
			contribution = store.add(instantiationService.createInstance(TerminalClipboardContribution, ctx));
			contribution.xtermReady(upcastDeepPartial<IXtermTerminal & { raw: RawXtermTerminal }>({
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
