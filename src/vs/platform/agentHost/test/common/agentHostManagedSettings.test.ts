/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from '../../common/agentHostSchema.js';
import { managedPermissionsSettingMappings, resolveManagedPermissions } from '../../common/agentHostManagedSettings.js';

suite('agentHostManagedSettings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps effective values through declarative entries', () => {
		const configurationService = new TestConfigurationService({
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: true,
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: false,
		});
		assert.deepStrictEqual({
			mappingIds: managedPermissionsSettingMappings.map(entry => entry.settingId),
			permissions: resolveManagedPermissions(configurationService),
		}, {
			mappingIds: [GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID],
			permissions: { ask: ['Shell'] },
		});
	});

	test('combines contributions', () => {
		const configurationService = new TestConfigurationService({
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: false,
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: false,
		});
		assert.deepStrictEqual(resolveManagedPermissions(configurationService), {
			disableBypassPermissionsMode: 'disable',
			ask: ['Shell'],
		});
	});
});
