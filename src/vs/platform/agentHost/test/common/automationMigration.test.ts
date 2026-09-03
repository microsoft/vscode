/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyLegacyAutomationSessionConfig, migrateLegacyAutomationSessionConfig } from '../../common/automationMigration.js';

suite('Automation migration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('steady-state writes do not reinterpret generic or custom modes as Autopilot', () => {
		assert.deepStrictEqual([
			applyLegacyAutomationSessionConfig('copilotcli', { mode: 'agent', autoApprove: 'assisted' }, 'agent', 'assisted'),
			applyLegacyAutomationSessionConfig('copilotcli', { mode: 'reviewer', autoApprove: 'assisted' }, 'reviewer', 'assisted'),
		], [
			{ mode: 'agent', autoApprove: 'assisted' },
			{ mode: 'reviewer', autoApprove: 'assisted' },
		]);
	});

	test('load-time migration still repairs transitional and combined Autopilot rows', () => {
		assert.deepStrictEqual([
			migrateLegacyAutomationSessionConfig('copilotcli', { mode: 'agent', autoApprove: 'assisted' }),
			migrateLegacyAutomationSessionConfig('copilotcli', { autoApprove: 'autopilot' }),
		], [
			{ mode: 'autopilot', autoApprove: 'assisted' },
			{ mode: 'autopilot', autoApprove: 'assisted' },
		]);
	});
});
