/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IConfigurationService, IConfigurationValue } from '../../../configuration/common/configuration.js';
import { AgentHostMapLegacySettingsToManagedSettingsSettingId, resolveManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from '../../common/agentHostSchema.js';

function createConfigurationService(values: Record<string, IConfigurationValue<unknown>>): IConfigurationService {
	return {
		inspect: <T>(key: string) => (values[key] ?? {}) as IConfigurationValue<T>,
	} as IConfigurationService;
}

suite('AgentHostManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('combines restrictive contributions from explicitly configured global values', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: false, policyValue: false },
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: { defaultValue: true, userValue: false },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			disableBypassPermissionsMode: 'disable',
			ask: ['Shell'],
		});
	});

	test('respects global precedence and ignores defaults and workspace values', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: false, userValue: false, policyValue: true },
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: { defaultValue: false, workspaceValue: false, workspaceFolderValue: false },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {});
	});

	test('does not promote user or application preferences to managed bypass restrictions', () => {
		const userConfigurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: false, userValue: false },
		});
		const applicationConfigurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: false, applicationValue: false },
		});

		assert.deepStrictEqual([
			resolveManagedSettingsPermissions(userConfigurationService),
			resolveManagedSettingsPermissions(applicationConfigurationService),
		], [{}, {}]);
	});

	test('does not map legacy settings while the compatibility bridge is disabled', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false },
			[GLOBAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: false, userValue: false },
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: { defaultValue: true, userValue: false },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {});
	});

	test('returns an empty contribution after explicit restrictions are removed', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, applicationValue: true },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {});
	});
});
