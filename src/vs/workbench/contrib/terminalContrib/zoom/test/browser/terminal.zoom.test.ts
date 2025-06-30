/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { clampTerminalFontSize } from '../../browser/terminal.zoom.contribution.js';

suite('Terminal Mouse Wheel Zoom', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;

	setup(() => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	});

	test('clamps font size to minimum value when below bounds', () => {
		const result = clampTerminalFontSize(3 + (-2)); // 3 - 2 = 1, clamped to 6
		strictEqual(result, 6, 'Font size should be clamped to minimum value of 6');
	});

	test('clamps font size to maximum value when above bounds', () => {
		const result = clampTerminalFontSize(99 + 5); // 99 + 5 = 104, clamped to 100
		strictEqual(result, 100, 'Font size should be clamped to maximum value of 100');
	});

	test('preserves font size when within bounds', () => {
		const result = clampTerminalFontSize(12 + 3); // 12 + 3 = 15, within bounds
		strictEqual(result, 15, 'Font size should remain unchanged when within bounds');
	});

	test('clamps font size when going below minimum', () => {
		const result = clampTerminalFontSize(6 + (-1)); // 6 - 1 = 5, clamped to 6
		strictEqual(result, 6, 'Font size should be clamped when going below minimum');
	});

	test('clamps font size when going above maximum', () => {
		const result = clampTerminalFontSize(100 + 1); // 100 + 1 = 101, clamped to 100
		strictEqual(result, 100, 'Font size should be clamped when going above maximum');
	});

	test('clamps font size to minimum when configuration updated below bounds', async () => {
		// Set initial font size
		await configurationService.updateValue(TerminalSettingId.FontSize, 12);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 12);

		// Test updating to a value below minimum (simulating excessive scroll down)
		const currentSize = configurationService.getValue(TerminalSettingId.FontSize);
		const newSize = clampTerminalFontSize(currentSize + (-20)); // Simulate large negative delta
		await configurationService.updateValue(TerminalSettingId.FontSize, newSize);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 6, 'Font size should be clamped to minimum');
	});

	test('clamps font size to maximum when configuration updated above bounds', async () => {
		// Set initial font size
		await configurationService.updateValue(TerminalSettingId.FontSize, 12);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 12);

		// Test updating to a value above maximum
		const currentSize = configurationService.getValue(TerminalSettingId.FontSize);
		const newSize = clampTerminalFontSize(currentSize + 200); // Simulate large positive delta
		await configurationService.updateValue(TerminalSettingId.FontSize, newSize);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 100, 'Font size should be clamped to maximum');
	});
});
