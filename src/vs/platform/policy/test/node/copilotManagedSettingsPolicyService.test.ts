/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_MANAGED_SETTINGS_POLICY_NAME } from '../../common/copilotManagedSettings.js';
import { PolicyValue } from '../../common/policy.js';
import { CopilotManagedSettingsPolicyService, CopilotPolicyWatcherFactory } from '../../node/copilotManagedSettingsPolicyService.js';

suite('CopilotManagedSettingsPolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const policyName = 'ChatToolsAutoApprove';

	test('watches managed-settings keys from policy definitions and publishes raw managed settings', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		const watcherFactory: CopilotPolicyWatcherFactory = (_productName, policies, callback) => {
			assert.deepStrictEqual(policies, { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' } });
			onDidChange = callback;
			callback({});
			return Disposable.None;
		};

		const service = disposables.add(new CopilotManagedSettingsPolicyService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		assert.strictEqual(service.getPolicyValue(COPILOT_MANAGED_SETTINGS_POLICY_NAME), '{"permissions.disableBypassPermissionsMode":"disable"}');

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' });
		assert.strictEqual(service.getPolicyValue(COPILOT_MANAGED_SETTINGS_POLICY_NAME), '{"permissions.disableBypassPermissionsMode":"enable"}');
	});

	test('does not create the watcher until a managed-settings policy definition is registered', async () => {
		let watcherCreated = false;
		const watcherFactory: CopilotPolicyWatcherFactory = () => {
			watcherCreated = true;
			return Disposable.None;
		};

		const service = disposables.add(new CopilotManagedSettingsPolicyService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({ OtherPolicy: { type: 'boolean' } });

		assert.strictEqual(watcherCreated, false);
	});

	test('clears stale watcher values when managed-settings definitions are removed', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		let disposeCount = 0;
		const watcherFactory: CopilotPolicyWatcherFactory = (_productName, _policies, callback) => {
			onDidChange = callback;
			callback({});
			return { dispose: () => disposeCount++ };
		};

		const service = disposables.add(new CopilotManagedSettingsPolicyService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		await service.updatePolicyDefinitions({});

		assert.deepStrictEqual({ value: service.getPolicyValue(COPILOT_MANAGED_SETTINGS_POLICY_NAME), disposeCount }, { value: undefined, disposeCount: 1 });
	});

	test('keeps raw managed settings while at least one managed-settings definition remains', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		const watcherFactory: CopilotPolicyWatcherFactory = (_productName, _policies, callback) => {
			onDidChange = callback;
			callback({});
			return Disposable.None;
		};

		const service = disposables.add(new CopilotManagedSettingsPolicyService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			},
			OtherPolicy: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		assert.strictEqual(service.getPolicyValue(COPILOT_MANAGED_SETTINGS_POLICY_NAME), '{"permissions.disableBypassPermissionsMode":"disable"}');
	});
});
