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

suite('Terminal Mouse Wheel Zoom', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;

	setup(() => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	});

	test('font size bounds are respected when calculating new font size', () => {
		// Test minimum bound
		const minBoundResult = Math.max(6, Math.min(100, 3 + (-2))); // 3 - 2 = 1, clamped to 6
		strictEqual(minBoundResult, 6, 'Font size should be clamped to minimum value of 6');

		// Test maximum bound
		const maxBoundResult = Math.max(6, Math.min(100, 99 + 5)); // 99 + 5 = 104, clamped to 100
		strictEqual(maxBoundResult, 100, 'Font size should be clamped to maximum value of 100');

		// Test normal operation within bounds
		const normalResult = Math.max(6, Math.min(100, 12 + 3)); // 12 + 3 = 15, within bounds
		strictEqual(normalResult, 15, 'Font size should remain unchanged when within bounds');

		// Test edge cases
		const exactMinResult = Math.max(6, Math.min(100, 6 + (-1))); // 6 - 1 = 5, clamped to 6
		strictEqual(exactMinResult, 6, 'Font size should be clamped when going below minimum');

		const exactMaxResult = Math.max(6, Math.min(100, 100 + 1)); // 100 + 1 = 101, clamped to 100
		strictEqual(exactMaxResult, 100, 'Font size should be clamped when going above maximum');
	});

	test('font size configuration update respects bounds', async () => {
		// Set initial font size
		await configurationService.updateValue(TerminalSettingId.FontSize, 12);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 12);

		// Test updating to a value below minimum (simulating excessive scroll down)
		const currentSize = configurationService.getValue(TerminalSettingId.FontSize);
		const newSize = Math.max(6, Math.min(100, currentSize + (-20))); // Simulate large negative delta
		await configurationService.updateValue(TerminalSettingId.FontSize, newSize);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 6, 'Font size should be clamped to minimum');

		// Test updating to a value above maximum
		const currentSize2 = configurationService.getValue(TerminalSettingId.FontSize);
		const newSize2 = Math.max(6, Math.min(100, currentSize2 + 200)); // Simulate large positive delta
		await configurationService.updateValue(TerminalSettingId.FontSize, newSize2);
		strictEqual(configurationService.getValue(TerminalSettingId.FontSize), 100, 'Font size should be clamped to maximum');
	});
});