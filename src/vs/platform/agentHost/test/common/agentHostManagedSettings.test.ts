/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IConfigurationService, IConfigurationValue } from '../../../configuration/common/configuration.js';
import { AgentHostMapLegacySettingsToManagedSettingsSettingId, resolveManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID } from '../../common/agentHostSchema.js';

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

	test('deduplicates rules contributed by more than one setting', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: { defaultValue: true, userValue: false },
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: {}, userValue: { npm: false } },
		});

		const permissions = resolveManagedSettingsPermissions(configurationService);
		assert.deepStrictEqual(permissions.ask, [...new Set(permissions.ask)]);
	});

	test('denies configured domains while the network filter is on', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false, policyValue: true },
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: { defaultValue: [], policyValue: ['evil.com', '*.tracker.example'] },
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: { defaultValue: [], policyValue: ['github.com'] },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			deny: ['Domain(evil.com)', 'Domain(*.tracker.example)'],
		});
	});

	test('denies every domain when the filter is on and neither list is configured', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false, policyValue: true },
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: { defaultValue: [] },
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: { defaultValue: [] },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), { deny: ['Domain'] });
	});

	test('contributes nothing from domain lists while the network filter is off', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false },
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: { defaultValue: [], policyValue: ['evil.com'] },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {});
	});

	test('skips denied domain patterns the SDK cannot express', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false, policyValue: true },
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: { defaultValue: [], policyValue: ['$(evil)', 'ok.example'] },
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: { defaultValue: [] },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			deny: ['Domain(ok.example)'],
		});
	});

	test('maps a bare wildcard denial onto the all-domains family rule', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false, policyValue: true },
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: { defaultValue: [], policyValue: ['*'] },
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: { defaultValue: [] },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), { deny: ['Domain'] });
	});
});
