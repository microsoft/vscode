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

	test('deduplicates a rule that more than one entry produces', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false, policyValue: true },
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: { defaultValue: [] },
			// Three spellings of the same host, which all normalize to one rule.
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: {
				defaultValue: [],
				policyValue: ['evil.example', 'https://evil.example/path', 'evil.example:8443'],
			},
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			deny: ['Domain(evil.example)'],
		});
	});

	test('reduces denied domains to the host the network filter matches on', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[AgentNetworkDomainSettingId.NetworkFilter]: { defaultValue: false, policyValue: true },
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: { defaultValue: [] },
			[AgentNetworkDomainSettingId.DeniedNetworkDomains]: {
				defaultValue: [],
				policyValue: ['https://blocked.example/some/path', 'ported.example:8443', '*.wild.example'],
			},
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			deny: ['Domain(blocked.example)', 'Domain(ported.example)', 'Domain(*.wild.example)'],
		});
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

	test('requires approval for explicitly denied terminal commands', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: {
				defaultValue: {},
				policyValue: { rm: false, 'git push': false, npm: true },
			},
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			ask: ['Shell(rm)', 'Shell(git push)'],
		});
	});

	test('skips terminal denials the SDK shell grammar cannot express', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: {
				defaultValue: {},
				policyValue: {
					'/^rm\\s/i': false,
					'curl': { approve: false, matchCommandLine: true },
					'wget': false,
				},
			},
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			ask: ['Shell(wget)'],
		});
	});

	test('keeps an absolute command path that VS Code treats as a literal', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			// Starts and ends with `/` but the trailing segment is not a flag list,
			// so the auto-approver reads it as a path rather than a regular expression.
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: {}, policyValue: { '/usr/bin/rm': false } },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			ask: ['Shell(/usr/bin/rm)'],
		});
	});

	test('skips a wildcard command key rather than broadening it', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			// `*` is a literal in VS Code but a command-boundary wildcard in the SDK,
			// so bridging this would require approval for every git command.
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: { defaultValue: {}, policyValue: { 'git *': false, 'rm': false } },
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			ask: ['Shell(rm)'],
		});
	});

	test('treats a long-form sub-command denial like a bare false', () => {
		const configurationService = createConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: { defaultValue: false, userValue: true },
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: {
				defaultValue: {},
				policyValue: { rm: { approve: false }, ls: { approve: true } },
			},
		});

		assert.deepStrictEqual(resolveManagedSettingsPermissions(configurationService), {
			ask: ['Shell(rm)'],
		});
	});
});
