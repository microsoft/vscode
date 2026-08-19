/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService, IConfigurationValue } from '../../../configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { formatAgentHostConfigurationSyncValueForLog, getAgentHostConfigurationSyncEntries, getGlobalConfigurationValue, inspectValue, resolveAgentHostConfigurationSyncPatch } from '../../common/agentHostConfigurationSync.js';

const ALL_HOSTS_SETTING = 'test.agentHostSync.allHosts';
const LOCAL_ONLY_SETTING = 'test.agentHostSync.localOnly';
const HIDDEN_SETTING = 'test.agentHostSync.hidden';
const UNSYNCED_SETTING = 'test.agentHostSync.unsynced';
const ENUM_SETTING = 'test.agentHostSync.enum';
const FREEFORM_SETTING = 'test.agentHostSync.freeform';

/**
 * Stands in for `IConfigurationService` with per-layer control over `inspect`,
 * which the global-value resolution depends on. `TestConfigurationService`
 * collapses every layer onto `userValue`, so it cannot express the workspace
 * layer this suite needs to assert is ignored.
 */
function createConfigurationService(values: Record<string, IConfigurationValue<unknown>>): IConfigurationService {
	return {
		inspect: <T>(key: string) => (values[key] ?? {}) as IConfigurationValue<T>,
	} as IConfigurationService;
}

suite('AgentHostConfigurationSync', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const node = {
		id: 'testAgentHostSync',
		type: 'object' as const,
		properties: {
			[ALL_HOSTS_SETTING]: {
				type: 'boolean' as const,
				default: true,
				agentHost: { key: 'allHostsValue' },
			},
			[LOCAL_ONLY_SETTING]: {
				type: 'boolean' as const,
				default: false,
				agentHost: { key: 'localOnlyValue', localOnly: true },
			},
			[HIDDEN_SETTING]: {
				type: 'boolean' as const,
				default: false,
				// Hidden settings land in the registry's excluded bucket; mirroring
				// must still pick them up.
				included: false,
				agentHost: { key: 'hiddenValue', transform: (value: unknown) => value === true ? 'on' : 'off' },
			},
			[UNSYNCED_SETTING]: {
				type: 'boolean' as const,
				default: true,
			},
			[ENUM_SETTING]: {
				type: 'string' as const,
				enum: ['none', 'all'],
				default: 'none',
				agentHost: { key: 'enumValue' },
			},
			[FREEFORM_SETTING]: {
				type: 'string' as const,
				default: '',
				agentHost: { key: 'freeformValue' },
			},
		},
	};

	suiteSetup(() => registry.registerConfiguration(node));
	suiteTeardown(() => registry.deregisterConfigurations([node]));

	test('resolves the global value, ignoring workspace and folder layers', () => {
		const configurationService = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, userValue: false, workspaceValue: true, workspaceFolderValue: true },
		});

		assert.strictEqual(getGlobalConfigurationValue(configurationService, ALL_HOSTS_SETTING), false);
	});

	test('prefers policy over user, user over application, and falls back to the default', () => {
		const policyWins = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, applicationValue: true, userValue: true, policyValue: false },
		});
		const userWins = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, applicationValue: true, userValue: false },
		});
		const applicationWins = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, applicationValue: false },
		});
		const defaultWins = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true },
		});

		assert.deepStrictEqual([
			getGlobalConfigurationValue(policyWins, ALL_HOSTS_SETTING),
			getGlobalConfigurationValue(userWins, ALL_HOSTS_SETTING),
			getGlobalConfigurationValue(applicationWins, ALL_HOSTS_SETTING),
			getGlobalConfigurationValue(defaultWins, ALL_HOSTS_SETTING),
		], [false, false, false, true]);
	});

	test('resolves only explicit global layers when requested', () => {
		const policyWins = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, applicationValue: true, userValue: true, policyValue: false, workspaceValue: true },
		});
		const malformedUserFallsBack = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, applicationValue: false, userValue: 'yes' as unknown as boolean },
		});
		const defaultOnly = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, workspaceValue: false, workspaceFolderValue: false },
		});

		assert.deepStrictEqual([
			inspectValue(policyWins, ALL_HOSTS_SETTING),
			inspectValue(malformedUserFallsBack, ALL_HOSTS_SETTING),
			inspectValue(defaultOnly, ALL_HOSTS_SETTING),
		], [
			[false, 'policyValue'],
			[false, 'applicationValue'],
			undefined,
		]);
	});

	test('formats closed-set values for logging and redacts everything else', () => {
		assert.deepStrictEqual([
			formatAgentHostConfigurationSyncValueForLog(ALL_HOSTS_SETTING, true),
			formatAgentHostConfigurationSyncValueForLog(ENUM_SETTING, 'all'),
			formatAgentHostConfigurationSyncValueForLog(ENUM_SETTING, 'c:\\Users\\someone\\secret'),
			formatAgentHostConfigurationSyncValueForLog(FREEFORM_SETTING, 'c:\\Users\\someone\\secret'),
			formatAgentHostConfigurationSyncValueForLog(UNSYNCED_SETTING, { '**/secret/**': true }),
			formatAgentHostConfigurationSyncValueForLog(UNSYNCED_SETTING, ['c:\\Users\\someone']),
		], ['true', 'all', '<string>', '<string>', '<object>', '<array>']);
	});

	test('builds a patch applying transforms, including for hidden settings', () => {
		const configurationService = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true },
			[LOCAL_ONLY_SETTING]: { defaultValue: false, userValue: true },
			[HIDDEN_SETTING]: { defaultValue: false, userValue: true },
		});

		const patch = resolveAgentHostConfigurationSyncPatch(configurationService, true);

		assert.deepStrictEqual({
			allHostsValue: patch.allHostsValue,
			localOnlyValue: patch.localOnlyValue,
			hiddenValue: patch.hiddenValue,
		}, {
			allHostsValue: true,
			localOnlyValue: true,
			hiddenValue: 'on',
		});
	});

	test('omits localOnly settings for a remote host', () => {
		const configurationService = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true },
			[LOCAL_ONLY_SETTING]: { defaultValue: false, userValue: true },
		});

		const patch = resolveAgentHostConfigurationSyncPatch(configurationService, false);

		assert.deepStrictEqual({
			allHostsValue: patch.allHostsValue,
			mirroredKeys: Object.keys(patch).filter(key => key === 'localOnlyValue'),
		}, {
			allHostsValue: true,
			mirroredKeys: [],
		});
	});

	test('only settings declaring `agentHost` are mirrored', () => {
		const settingIds = getAgentHostConfigurationSyncEntries(true).map(entry => entry.settingId);

		assert.deepStrictEqual({
			hasSynced: settingIds.includes(ALL_HOSTS_SETTING),
			hasHidden: settingIds.includes(HIDDEN_SETTING),
			hasUnsynced: settingIds.includes(UNSYNCED_SETTING),
		}, {
			hasSynced: true,
			hasHidden: true,
			hasUnsynced: false,
		});
	});

	test('skips layers whose value does not match the declared type', () => {
		// Replaces the per-setting `value === true` / `value !== false` transforms:
		// a malformed layer is skipped, so resolution lands on the next valid layer
		// and ultimately on the registered default.
		const malformedUser = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, userValue: 'yes' as unknown as boolean },
		});
		const malformedUserValidApplication = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, applicationValue: false, userValue: 'yes' as unknown as boolean },
		});
		const validFalse = createConfigurationService({
			[ALL_HOSTS_SETTING]: { defaultValue: true, userValue: false },
		});

		assert.deepStrictEqual([
			getGlobalConfigurationValue(malformedUser, ALL_HOSTS_SETTING),
			getGlobalConfigurationValue(malformedUserValidApplication, ALL_HOSTS_SETTING),
			getGlobalConfigurationValue(validFalse, ALL_HOSTS_SETTING),
		], [true, false, false]);
	});

	test('falls back to the declared default for hidden settings', () => {
		// `included: false` settings are absent from the default-configuration
		// model, so `inspect().defaultValue` is undefined for them. Without the
		// schema-default fallback they would be silently omitted from the patch
		// while visible siblings are mirrored — verified against a live agent host.
		const configurationService = createConfigurationService({});

		assert.deepStrictEqual({
			hidden: getGlobalConfigurationValue(configurationService, HIDDEN_SETTING),
			visible: getGlobalConfigurationValue(configurationService, ALL_HOSTS_SETTING),
			mirrored: Object.keys(resolveAgentHostConfigurationSyncPatch(configurationService, true)).includes('hiddenValue'),
		}, {
			hidden: false,
			visible: true,
			mirrored: true,
		});
	});

	test('deregistering drops mirroring entries, including for hidden settings', () => {
		const node = {
			id: 'testAgentHostSyncTransient',
			type: 'object' as const,
			properties: {
				'test.agentHostSync.transient': {
					type: 'boolean' as const,
					default: false,
					agentHost: { key: 'transientValue' },
				},
				'test.agentHostSync.transientHidden': {
					type: 'boolean' as const,
					default: false,
					// Registration strips hidden keys from `node.properties`, so
					// deregistration has to find them another way.
					included: false,
					agentHost: { key: 'transientHiddenValue' },
				},
			},
		};

		registry.registerConfiguration(node);
		const whileRegistered = getAgentHostConfigurationSyncEntries(true).map(entry => entry.settingId);
		registry.deregisterConfigurations([node]);
		const afterDeregister = getAgentHostConfigurationSyncEntries(true).map(entry => entry.settingId);

		assert.deepStrictEqual({
			registeredVisible: whileRegistered.includes('test.agentHostSync.transient'),
			registeredHidden: whileRegistered.includes('test.agentHostSync.transientHidden'),
			leakedVisible: afterDeregister.includes('test.agentHostSync.transient'),
			leakedHidden: afterDeregister.includes('test.agentHostSync.transientHidden'),
		}, {
			registeredVisible: true,
			registeredHidden: true,
			leakedVisible: false,
			leakedHidden: false,
		});
	});
});
