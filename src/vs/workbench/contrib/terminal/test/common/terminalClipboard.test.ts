/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal';
import { shouldPasteTerminalText } from '../../common/terminalClipboard';

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
});
