/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import type { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { ManagedSettingsData, NullManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { getSemanticSearchManagedPolicyState, isSemanticSearchDisabledByManagedPolicy } from '../../../browser/agentSessions/agentHost/semanticSearchManagedPolicy.js';

suite('SemanticSearchManagedPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function state(managedSettings: ManagedSettingsData, configuration: Record<string, IConfigurationValue<unknown>> = {}) {
		const managedSettingsService = new class extends NullManagedSettingsService {
			override getManagedSettingValue(key: string) { return managedSettings[key]; }
		}();
		const configurationService = {
			inspect: <T>(key: string) => (configuration[key] ?? {}) as IConfigurationValue<T>,
		} as IConfigurationService;
		return getSemanticSearchManagedPolicyState(managedSettingsService, configurationService);
	}

	test('disables semantic search for managed rules everywhere and for bridged rules only on hosts that receive them', () => {
		const cases = {
			none: state({}),
			emptyRuleLists: state({ 'permissions.deny': '[]', 'permissions.ask': '[]' }),
			modeLockOnly: state({ 'permissions.disableBypassPermissionsMode': 'disable' }),
			managedRule: state({ 'permissions.deny': '["Read(/denied/**)"]' }),
			bridgedRule: state({}, { [TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: { defaultValue: true, policyValue: false } }),
			personalPreferenceOnly: state({}, { [TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: { defaultValue: true, userValue: false } }),
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, {
			state: value,
			localHost: isSemanticSearchDisabledByManagedPolicy(value, true),
			remoteHost: isSemanticSearchDisabledByManagedPolicy(value, false),
		}])), {
			none: { state: { managedRules: false, bridgedRules: false }, localHost: false, remoteHost: false },
			emptyRuleLists: { state: { managedRules: false, bridgedRules: false }, localHost: false, remoteHost: false },
			modeLockOnly: { state: { managedRules: false, bridgedRules: false }, localHost: false, remoteHost: false },
			managedRule: { state: { managedRules: true, bridgedRules: false }, localHost: true, remoteHost: true },
			bridgedRule: { state: { managedRules: false, bridgedRules: true }, localHost: true, remoteHost: false },
			personalPreferenceOnly: { state: { managedRules: false, bridgedRules: false }, localHost: false, remoteHost: false },
		});
	});
});
