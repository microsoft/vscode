/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestCommandId } from '../../common/constants.js';
import { TestingConfigKeys } from '../../common/configuration.js';

suite('Toggle Coverage in Explorer Command', () => {

	test('Command ID is correctly defined', () => {
		// Verify the command ID exists and has the expected value
		assert.strictEqual(TestCommandId.CoverageToggleInExplorer, 'testing.toggleCoverageInExplorer');
	});

	test('Setting key is correctly defined', () => {
		// Verify the configuration key exists and has the expected value
		assert.strictEqual(TestingConfigKeys.ShowCoverageInExplorer, 'testing.showCoverageInExplorer');
	});

	test('Configuration values match expected pattern', () => {
		// Verify that the command ID and config key follow the expected naming convention
		const expectedConfigKey = 'testing.showCoverageInExplorer';
		const expectedCommandId = 'testing.toggleCoverageInExplorer';
		
		assert.strictEqual(TestingConfigKeys.ShowCoverageInExplorer, expectedConfigKey);
		assert.strictEqual(TestCommandId.CoverageToggleInExplorer, expectedCommandId);
		
		// Verify the relationship between command and config names
		assert.ok(TestCommandId.CoverageToggleInExplorer.includes('toggle'), 'Command should include "toggle"');
		assert.ok(TestingConfigKeys.ShowCoverageInExplorer.includes('show'), 'Config should include "show"');
		assert.ok(TestCommandId.CoverageToggleInExplorer.includes('CoverageInExplorer'), 'Command should reference explorer');
		assert.ok(TestingConfigKeys.ShowCoverageInExplorer.includes('CoverageInExplorer'), 'Config should reference explorer');
	});

});