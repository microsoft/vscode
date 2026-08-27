/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { TelemetryConfiguration, TelemetryLevel } from '../../common/telemetry.js';
import { cleanRemoteAuthority, countConfigurationValue, getKeyedChanges, getTelemetryLevel } from '../../common/telemetryUtils.js';

suite('TelemetryUtils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getTelemetryLevel fails closed for invalid configuration', () => {
		assert.deepStrictEqual([
			getTelemetryLevel(new TestConfigurationService()),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.ON })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.ERROR })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.CRASH })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': TelemetryConfiguration.OFF })),
			getTelemetryLevel(new TestConfigurationService({ 'telemetry.telemetryLevel': 'invalid' })),
			getTelemetryLevel(new class extends TestConfigurationService {
				override getValue<T>(): T {
					return null!;
				}
			}()),
		], [
			TelemetryLevel.USAGE,
			TelemetryLevel.USAGE,
			TelemetryLevel.ERROR,
			TelemetryLevel.CRASH,
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
		]);
	});

	test('counts explicit configuration values with caller-defined enablement', () => {
		const classifyEntry = (entry: unknown, value: unknown) => Array.isArray(value)
			? true
			: typeof entry === 'boolean' ? entry : undefined;

		assert.deepStrictEqual([
			countConfigurationValue(undefined, classifyEntry),
			countConfigurationValue([], classifyEntry),
			countConfigurationValue(['one', 'two'], classifyEntry),
			countConfigurationValue({ enabled: true, disabled: false, other: 'value' }, classifyEntry),
			countConfigurationValue(false, classifyEntry),
			countConfigurationValue('value', classifyEntry),
		], [
			{ configurationPresent: 0, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 },
			{ configurationPresent: 1, configuredEntryCount: 0, enabledEntryCount: 0, disabledEntryCount: 0 },
			{ configurationPresent: 1, configuredEntryCount: 2, enabledEntryCount: 2, disabledEntryCount: 0 },
			{ configurationPresent: 1, configuredEntryCount: 3, enabledEntryCount: 1, disabledEntryCount: 1 },
			{ configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 0, disabledEntryCount: 1 },
			{ configurationPresent: 1, configuredEntryCount: 1, enabledEntryCount: 0, disabledEntryCount: 0 },
		]);
	});

	test('returns changed and removed keyed values', () => {
		const previous = new Map([
			['same', { count: 1 }],
			['changed', { count: 1 }],
			['removed', { count: 1 }],
		]);
		const current = new Map([
			['same', { count: 1 }],
			['changed', { count: 2 }],
			['added', { count: 1 }],
		]);

		assert.deepStrictEqual(getKeyedChanges(previous, current), {
			changed: [{ count: 2 }, { count: 1 }],
			removed: [{ count: 1 }],
		});
	});

	suite('cleanRemoteAuthority', () => {

		test('returns "none" when remoteAuthority is undefined', () => {
			const config = {
				remoteExtensionTips: { 'ssh-remote': {} },
				virtualWorkspaceExtensionTips: { 'codespaces': {} }
			};

			const result = cleanRemoteAuthority(undefined, config);
			assert.strictEqual(result, 'none');
		});

		test('returns remoteName when it exists in remoteExtensionTips', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {},
					'dev-container': {},
					'wsl': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'ssh-remote');
			assert.strictEqual(cleanRemoteAuthority('dev-container', config), 'dev-container');
			assert.strictEqual(cleanRemoteAuthority('wsl', config), 'wsl');
		});

		test('returns remoteName when it exists in virtualWorkspaceExtensionTips', () => {
			const config = {
				remoteExtensionTips: {},
				virtualWorkspaceExtensionTips: {
					'codespaces': {},
					'tunnel': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'codespaces');
			assert.strictEqual(cleanRemoteAuthority('tunnel', config), 'tunnel');
		});

		test('returns "other" when remoteName is not in either config', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {},
					'dev-container': {}
				},
				virtualWorkspaceExtensionTips: {
					'codespaces': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('unknown-remote', config), 'other');
			assert.strictEqual(cleanRemoteAuthority('custom-remote', config), 'other');
		});

		test('returns "other" when config is empty', () => {
			const config = {
				remoteExtensionTips: {},
				virtualWorkspaceExtensionTips: {}
			};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
		});

		test('handles config with undefined remoteExtensionTips', () => {
			const config = {
				virtualWorkspaceExtensionTips: {
					'codespaces': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'codespaces');
			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
		});

		test('handles config with undefined virtualWorkspaceExtensionTips', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {}
				}
			};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'ssh-remote');
			assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'other');
		});

		test('handles empty config object', () => {
			const config = {};

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
			assert.strictEqual(cleanRemoteAuthority(undefined, config), 'none');
		});

		test('handles remoteAuthority with additional path segments', () => {
			const config = {
				remoteExtensionTips: {
					'ssh-remote': {}
				}
			};

			// getRemoteName should extract just the authority name
			assert.strictEqual(cleanRemoteAuthority('ssh-remote+server1.example.com', config), 'ssh-remote');
		});

		test('handles undefined config object', () => {
			const config = undefined!;

			assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
			assert.strictEqual(cleanRemoteAuthority(undefined, config), 'none');
		});
	});
});
