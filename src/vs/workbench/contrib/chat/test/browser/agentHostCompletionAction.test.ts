/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from '../../browser/agentHostCompletionAction.js';
import { ChatConfiguration } from '../../common/constants.js';
import { resetShownWarnings } from '../../common/chatPermissionWarnings.js';

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
		test('elevated autoApprove is blocked only when policy restricts auto-approval', () => {
			const restricted = new PolicyTestConfigurationService(false);
			const unrestricted = new PolicyTestConfigurationService(undefined);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'autoApprove' } }, restricted), true);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'assisted' } }, restricted), true);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'autoApprove' } }, unrestricted), false);
		});

		test('non-elevated and mode-axis actions are never policy-blocked', () => {
			const restricted = new PolicyTestConfigurationService(false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { autoApprove: 'default' } }, restricted), false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: { mode: 'autopilot' } }, restricted), false);
			assert.strictEqual(isPolicyBlockedCompletionAction({ applyConfig: {} }, restricted), false);
		});
	});
});
