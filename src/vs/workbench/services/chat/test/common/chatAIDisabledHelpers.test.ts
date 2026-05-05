/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ConfigurationTarget, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EnablementState } from '../../../extensionManagement/common/extensionManagement.js';
import {
	computeAIDisabledClearForGlobalOptIn,
	computeAIDisabledOverrideForWorkspaceEnable,
	computeAIDisabledSyncOnExtensionEnabled,
} from '../../common/chatAIDisabledHelpers.js';

type Inspect = Partial<IConfigurationValue<boolean>>;

suite('chat - chatSetupAIDisabled', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('computeAIDisabledSyncOnExtensionEnabled (issue #309947)', () => {

		// Repro for https://github.com/microsoft/vscode/issues/309947: a user has
		// `chat.disableAIFeatures: true` at user/profile
		// scope. During startup or a profile switch the chat extension is reported with state
		// `EnabledGlobally` (its default state). The previous code unconditionally wrote
		// `false` without an explicit ConfigurationTarget, which removed the user-scope
		// override from settings.json - silently re-enabling AI features.
		test('does not modify user-scope setting when extension is EnabledGlobally', () => {
			const inspect: Inspect = { value: true, userValue: true };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.EnabledGlobally, inspect);
			assert.strictEqual(update, undefined, 'must not auto-modify user-scope setting from extension events');
		});

		test('does not modify application-scope setting when extension is EnabledGlobally', () => {
			const inspect: Inspect = { value: true, applicationValue: true };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.EnabledGlobally, inspect);
			assert.strictEqual(update, undefined, 'must not auto-modify application-scope setting from extension events');
		});

		test('does not write when extension is EnabledGlobally and setting unset', () => {
			const inspect: Inspect = {};
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.EnabledGlobally, inspect);
			assert.strictEqual(update, undefined);
		});

		test('writes workspace false when extension is EnabledWorkspace and workspace setting is true', () => {
			const inspect: Inspect = { value: true, workspaceValue: true };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.EnabledWorkspace, inspect);
			assert.deepStrictEqual(update, { value: false, target: ConfigurationTarget.WORKSPACE });
		});

		test('does not write when extension is EnabledWorkspace and workspace setting is unset', () => {
			const inspect: Inspect = { value: true, userValue: true };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.EnabledWorkspace, inspect);
			assert.strictEqual(update, undefined, 'must not touch user setting when only workspace was changed');
		});

		test('does not write when extension is EnabledWorkspace and workspace setting already false', () => {
			const inspect: Inspect = { value: false, workspaceValue: false };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.EnabledWorkspace, inspect);
			assert.strictEqual(update, undefined);
		});

		test('does not write when extension is DisabledGlobally', () => {
			const inspect: Inspect = { value: true, userValue: true };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.DisabledGlobally, inspect);
			assert.strictEqual(update, undefined);
		});

		test('does not write when extension is DisabledWorkspace', () => {
			const inspect: Inspect = { value: true, workspaceValue: true };
			const update = computeAIDisabledSyncOnExtensionEnabled(EnablementState.DisabledWorkspace, inspect);
			assert.strictEqual(update, undefined);
		});
	});

	suite('computeAIDisabledOverrideForWorkspaceEnable (issue #311898)', () => {

		// Repro for https://github.com/microsoft/vscode/issues/311898: a user has
		// `chat.disableAIFeatures: true` at user/profile
		// scope and clicks "Enable AI Features (Workspace)" on a workspace where the setting
		// is unset. The previous code only wrote `false` at workspace scope when
		// `workspaceValue === true`, leaving the merged value `true`. After a reload,
		// `handleChatDisabled` sees merged-true and disables the extension again - so the
		// per-workspace opt-in does not persist.
		test('writes workspace false when user-scope is true and workspace is unset', () => {
			const inspect: Inspect = { value: true, userValue: true };
			const update = computeAIDisabledOverrideForWorkspaceEnable(inspect);
			assert.deepStrictEqual(update, { value: false, target: ConfigurationTarget.WORKSPACE });
		});

		test('writes workspace false when application-scope is true and workspace is unset', () => {
			const inspect: Inspect = { value: true, applicationValue: true };
			const update = computeAIDisabledOverrideForWorkspaceEnable(inspect);
			assert.deepStrictEqual(update, { value: false, target: ConfigurationTarget.WORKSPACE });
		});

		test('writes workspace false when workspace setting is true', () => {
			const inspect: Inspect = { value: true, workspaceValue: true };
			const update = computeAIDisabledOverrideForWorkspaceEnable(inspect);
			assert.deepStrictEqual(update, { value: false, target: ConfigurationTarget.WORKSPACE });
		});

		test('does not write when merged value is already false', () => {
			const inspect: Inspect = { value: false };
			const update = computeAIDisabledOverrideForWorkspaceEnable(inspect);
			assert.strictEqual(update, undefined);
		});

		test('does not write when workspace already explicitly enables AI', () => {
			const inspect: Inspect = { value: false, userValue: true, workspaceValue: false };
			const update = computeAIDisabledOverrideForWorkspaceEnable(inspect);
			assert.strictEqual(update, undefined);
		});
	});

	suite('computeAIDisabledClearForGlobalOptIn', () => {

		// The chat setup trigger and "Enable AI Features" actions explicitly opt the user in.
		// They must clear any disable override and ensure the merged value becomes false,
		// without relying on `updateValue`'s implicit scope-walking which is what causes
		// issue https://github.com/microsoft/vscode/issues/309947 to manifest in other call sites.
		test('returns no updates when merged is already false', () => {
			const inspect: Inspect = { value: false };
			assert.deepStrictEqual(computeAIDisabledClearForGlobalOptIn(inspect), []);
		});

		test('clears user-scope when only user is true', () => {
			const inspect: Inspect = { value: true, userValue: true };
			assert.deepStrictEqual(computeAIDisabledClearForGlobalOptIn(inspect), [
				{ value: false, target: ConfigurationTarget.USER },
			]);
		});

		test('clears application-scope when only application is true', () => {
			const inspect: Inspect = { value: true, applicationValue: true };
			assert.deepStrictEqual(computeAIDisabledClearForGlobalOptIn(inspect), [
				{ value: false, target: ConfigurationTarget.APPLICATION },
			]);
		});

		test('clears workspace-scope when workspace is true', () => {
			const inspect: Inspect = { value: true, workspaceValue: true };
			assert.deepStrictEqual(computeAIDisabledClearForGlobalOptIn(inspect), [
				{ value: false, target: ConfigurationTarget.WORKSPACE },
			]);
		});

		test('clears all overrides when set in multiple scopes', () => {
			const inspect: Inspect = {
				value: true,
				applicationValue: true,
				userValue: true,
				workspaceValue: true,
			};
			assert.deepStrictEqual(computeAIDisabledClearForGlobalOptIn(inspect), [
				{ value: false, target: ConfigurationTarget.APPLICATION },
				{ value: false, target: ConfigurationTarget.USER },
				{ value: false, target: ConfigurationTarget.WORKSPACE },
			]);
		});

		test('does not duplicate a USER write when userLocalValue mirrors userValue', () => {
			const inspect: Inspect = { value: true, userValue: true, userLocalValue: true };
			assert.deepStrictEqual(computeAIDisabledClearForGlobalOptIn(inspect), [
				{ value: false, target: ConfigurationTarget.USER },
			]);
		});
	});
});
