/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { shouldPasteTerminalText } from '../../browser/terminalClipboard.js';
import { TerminalClipboardSettingId } from '../../common/terminalClipboardConfiguration.js';

suite('TerminalClipboard', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('shouldPasteTerminalText', () => {
		let instantiationService: TestInstantiationService;
		let configurationService: TestConfigurationService;

		setup(async () => {
			instantiationService = store.add(new TestInstantiationService());
			configurationService = new TestConfigurationService({
				[TerminalSettingId.EnableMultiLinePasteWarning]: 'auto',
				[TerminalClipboardSettingId.EnableSmartPaste]: false
			});
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IDialogService, new TestDialogService(undefined, { result: { confirmed: false } }));
		});

		function setConfigValue(values: { enableMultiLinePaste?: unknown; enableSmartPaste?: boolean }) {
			values.enableSmartPaste ??= false;

			configurationService = new TestConfigurationService({
				[TerminalSettingId.EnableMultiLinePasteWarning]: values.enableMultiLinePaste,
				[TerminalClipboardSettingId.EnableSmartPaste]: values.enableSmartPaste
			});
			instantiationService.stub(IConfigurationService, configurationService);
		}

		async function testSmartPaste(path: string) {
			const shouldPaste = await instantiationService.invokeFunction(
				shouldPasteTerminalText, path, undefined, 'gitbash'
			);

			if (typeof shouldPaste === 'object') {
				return shouldPaste.modifiedText;
			}

			return shouldPaste;
		}

		test('Single line string', async () => {
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo', undefined, ''), true);

			setConfigValue({ enableMultiLinePaste: 'always', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo', undefined, ''), true);

			setConfigValue({ enableMultiLinePaste: 'never', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo', undefined, ''), true);
		});
		test('Single line string with trailing new line', async () => {
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\n', undefined, ''), true);

			setConfigValue({ enableMultiLinePaste: 'always', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\n', undefined, ''), false);

			setConfigValue({ enableMultiLinePaste: 'never', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\n', undefined, ''), true);
		});
		test('Multi-line string', async () => {
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined, ''), false);

			setConfigValue({ enableMultiLinePaste: 'always', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined, ''), false);

			setConfigValue({ enableMultiLinePaste: 'never', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined, ''), true);
		});
		test('Bracketed paste mode', async () => {
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true, ''), true);

			setConfigValue({ enableMultiLinePaste: 'always', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true, ''), false);

			setConfigValue({ enableMultiLinePaste: 'never', enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true, ''), true);
		});
		test('Legacy config', async () => {
			setConfigValue({ enableMultiLinePaste: true, enableSmartPaste: false }); // 'auto'
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined, ''), false);
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true, ''), true);

			setConfigValue({ enableMultiLinePaste: false, enableSmartPaste: false }); // 'never'
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true, ''), true);
		});
		test('Invalid config', async () => {
			setConfigValue({ enableMultiLinePaste: 123, enableSmartPaste: false });
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', undefined, ''), false);
			strictEqual(await instantiationService.invokeFunction(shouldPasteTerminalText, 'foo\nbar', true, ''), true);
		});

		/* Smart paste test cases */
		test('Smart paste windows', async () => {
			setConfigValue({ enableMultiLinePaste: 'auto', enableSmartPaste: true });
			strictEqual(await testSmartPaste('Z:\\Path Space'), '\"Z:\\\\Path Space\"');
			strictEqual(await testSmartPaste('Z:/Path Space'), '\"Z:/Path Space\"');

			setConfigValue({ enableMultiLinePaste: 'auto', enableSmartPaste: false });
			strictEqual(await testSmartPaste('Z:\\Path Space'), true);
			strictEqual(await testSmartPaste('Z:/Path Space'), true);
		});
		test('Smart paste unix', async () => {
			setConfigValue({ enableMultiLinePaste: 'auto', enableSmartPaste: true });
			strictEqual(await testSmartPaste('/home/path space'), '\"/home/path space\"');

			setConfigValue({ enableMultiLinePaste: 'auto', enableSmartPaste: false });
			strictEqual(await testSmartPaste('/home/path space'), true);
		});

		test('Smart paste relative paths', async () => {
			setConfigValue({ enableMultiLinePaste: 'auto', enableSmartPaste: true });
			strictEqual(await testSmartPaste('../../../../../Program Files'), '"../../../../../Program Files"');
			strictEqual(await testSmartPaste('..\\..\\..\\..\\..\\Program Files'), '"..\\\\..\\\\..\\\\..\\\\..\\\\Program Files"');

			setConfigValue({ enableMultiLinePaste: 'auto', enableSmartPaste: false });
			strictEqual(await testSmartPaste('../../../../../Program Files'), true);
		});
	});
});
