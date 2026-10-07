/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from '../../browser/agentHostCompletionAction.js';
import { autoApprovePolicyValue, getAgentHostPermissionState, isAutoApprovePolicyRestricted, usesAgentHostPermissionState, validateAgentHostPermissionState } from '../../common/agentHostConfigPolicy.js';
import { ChatConfiguration } from '../../common/constants.js';
import { resetShownWarnings } from '../../common/chatPermissionWarnings.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';

/** Test configuration service whose `inspect` reports a fixed `policyValue` for the global auto-approve setting. */
class PolicyTestConfigurationService extends TestConfigurationService {
	constructor(private readonly _globalAutoApprovePolicyValue: boolean | undefined) {
		super();
	}
	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const base = super.inspect<T>(key, overrides);
		if (key === ChatConfiguration.GlobalAutoApprove) {
			return { ...base, policyValue: this._globalAutoApprovePolicyValue as T };
		}
		return base;
	}
}

suite('applyAgentHostCompletionAction', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => resetShownWarnings());

	test('auto-approve policy ignores preview policy and honors the bypass restriction', () => {
		assert.deepStrictEqual([
			autoApprovePolicyValue({ chat_preview_features_enabled: false }),
			autoApprovePolicyValue({ managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' } }),
			autoApprovePolicyValue({ managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' } }),
		], [
			undefined,
			false,
			undefined,
		]);
	});

	test('applies a non-elevated (mode) change without a dialog', async () => {
		const dialog = new TestDialogService(); // default confirms if prompted
		const storage = store.add(new InMemoryStorageService());
		let applied: Record<string, string> | undefined;
		const result = await applyAgentHostCompletionAction(
			{ applyConfig: { mode: 'autopilot' } },
			dialog,
			storage,
			config => { applied = { ...config }; },
		);
		assert.strictEqual(result, true);
		assert.deepStrictEqual(applied, { mode: 'autopilot' });
	});

	test('applies an elevated autoApprove change when the confirmation is accepted', async () => {
		const dialog = new TestDialogService(); // first (confirm) button returns true
		const storage = store.add(new InMemoryStorageService());
		let applied: Record<string, string> | undefined;
		const result = await applyAgentHostCompletionAction(
			{ applyConfig: { autoApprove: 'autoApprove' } },
			dialog,
			storage,
			config => { applied = { ...config }; },
		);
		assert.strictEqual(result, true);
		assert.deepStrictEqual(applied, { autoApprove: 'autoApprove' });
	});

	test('does not apply an elevated change when the confirmation is cancelled', async () => {
		const dialog = new TestDialogService(undefined, { result: false });
		const storage = store.add(new InMemoryStorageService());
		let applied = false;
		const result = await applyAgentHostCompletionAction(
			{ applyConfig: { autoApprove: 'autoApprove' } },
			dialog,
			storage,
			() => { applied = true; },
		);
		assert.strictEqual(result, false);
		assert.strictEqual(applied, false);
	});

	suite('isPolicyBlockedCompletionAction', () => {
		test('host availability controls completions independently of the client policy', () => {
			const configuration = new PolicyTestConfigurationService(false);
			const config = permissionConfig();
			config.values.availableApprovalModes = ['default', 'assisted'];
			assert.deepStrictEqual([true, false, undefined].map(isLocal =>
				['assisted', 'autoApprove'].map(autoApprove => isPolicyBlockedCompletionAction({ applyConfig: { autoApprove } }, configuration, usesAgentHostPermissionState(isLocal, 'copilotcli'), config))
			), [[false, true], [true, true], [true, true]]);
		});

		test('missing host state blocks every approval completion, but not a mode-only action', () => {
			const configuration = new PolicyTestConfigurationService(undefined);
			assert.deepStrictEqual([
				...['default', 'assisted', 'autoApprove'].map(autoApprove => isPolicyBlockedCompletionAction({ applyConfig: { autoApprove } }, configuration, true)),
				isPolicyBlockedCompletionAction({ applyConfig: { mode: 'plan' } }, configuration, true),
			], [true, true, true, false]);
		});

		test('elevated autoApprove is blocked only when policy restricts auto-approval', () => {
			const restricted = new PolicyTestConfigurationService(false);
			const unrestricted = new PolicyTestConfigurationService(undefined);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'autoApprove' } }, restricted), true);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'assisted' } }, restricted), true);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'autoApprove' } }, unrestricted), false);
		});

		function permissionConfig(): ResolveSessionConfigResult {
			return {
				schema: { type: 'object', properties: {
					autoApprove: { type: 'string', title: 'Permissions', enum: ['default', 'assisted', 'autoApprove'], sessionMutable: true },
					availableApprovalModes: { type: 'array', title: 'Available', readOnly: true },
					effectiveApprovalMode: { type: 'string', title: 'Effective', readOnly: true },
				} },
				values: { autoApprove: 'autoApprove', availableApprovalModes: ['default', 'assisted', 'autoApprove'], effectiveApprovalMode: 'default' },
			};
		}

		suite('Agent Host permission authority', () => {
			test('only an explicitly local Copilot connection bypasses client policy interpretation', () => {
				const configuration = new PolicyTestConfigurationService(false);
				assert.deepStrictEqual([true, false, undefined].flatMap(isLocal =>
					['copilotcli', 'claude', 'codex', undefined].map(provider => isAutoApprovePolicyRestricted(configuration, isLocal, provider))
				), [false, true, true, true, true, true, true, true, true, true, true, true]);
			});

			test('rejects incomplete or malformed reports without synthesizing Manual', () => {
				const config = permissionConfig();
				const values = [
					{}, { availableApprovalModes: ['default'] }, { effectiveApprovalMode: 'default' },
					{ availableApprovalModes: 'default', effectiveApprovalMode: 'default' },
					{ availableApprovalModes: [], effectiveApprovalMode: 'default' },
					{ availableApprovalModes: ['default', 'default'], effectiveApprovalMode: 'default' },
					{ availableApprovalModes: ['default', 'unknown'], effectiveApprovalMode: 'default' },
					{ availableApprovalModes: ['default'], effectiveApprovalMode: 'assisted' },
					{ availableApprovalModes: ['default'], effectiveApprovalMode: 'default' },
				];
				assert.deepStrictEqual(values.map(values => getAgentHostPermissionState({ ...config, values })), [
					undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
					{ available: ['default'], effective: 'default' },
				]);
				assert.throws(() => validateAgentHostPermissionState(undefined, true), /could not resolve session permissions/);
				assert.doesNotThrow(() => validateAgentHostPermissionState(undefined, false));
			});

			test('read-only host declarations are required; requested intent does not select the effective mode', () => {
				const config = permissionConfig();
				const reported = getAgentHostPermissionState(config);
				config.schema.properties.effectiveApprovalMode = { type: 'string', title: 'Effective' };
				assert.deepStrictEqual([reported, getAgentHostPermissionState(config)], [
					{ available: ['default', 'assisted', 'autoApprove'], effective: 'default' },
					undefined,
				]);
			});
		});

		test('non-elevated and mode-axis actions are never policy-blocked', () => {
			const restricted = new PolicyTestConfigurationService(false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'default' } }, restricted), false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { mode: 'autopilot' } }, restricted), false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: {} }, restricted), false);
		});
	});
});
