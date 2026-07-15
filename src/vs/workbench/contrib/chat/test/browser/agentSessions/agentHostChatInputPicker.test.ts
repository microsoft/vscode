/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ClaudeSessionConfigKey } from '../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import type { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { getConfigPickerItemHover, getConfigPickerListOptions, getConfigPickerTriggerHover, resolveConfigChipValue } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.js';
import { getAgentHostPickerProperty, OpenAgentHostAutoApprovePickerAction, OpenAgentHostCodexApprovalsPickerAction, OpenAgentHostModePickerAction, OpenAgentHostPermissionModePickerAction } from '../../../browser/agentSessions/agentHost/agentHostChatInputPicker.contribution.js';
import { isAutoApproveValuePolicyRestricted, isAutoApproveValueVisible, normalizeSessionConfigValue } from '../../../common/agentHostConfigPolicy.js';
import { ChatPermissionLevel } from '../../../common/constants.js';

suite('AgentHostChatInputPicker - action mapping', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps dedicated actions to their session config properties', () => {
		assert.deepStrictEqual([
			getAgentHostPickerProperty(OpenAgentHostModePickerAction.ID),
			getAgentHostPickerProperty(OpenAgentHostAutoApprovePickerAction.ID),
			getAgentHostPickerProperty(OpenAgentHostPermissionModePickerAction.ID),
			getAgentHostPickerProperty(OpenAgentHostCodexApprovalsPickerAction.ID),
		], [
			SessionConfigKey.Mode,
			SessionConfigKey.AutoApprove,
			ClaudeSessionConfigKey.PermissionMode,
			CodexSessionConfigKey.PermissionsPreset,
		]);
	});
});

suite('AgentHostChatInputPicker - list options', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the compact wrapped layout for Codex approvals', () => {
		assert.deepStrictEqual(getConfigPickerListOptions(CodexSessionConfigKey.PermissionsPreset), {
			className: 'codex-approvals-picker',
			minWidth: 340,
			maxWidth: 340,
			detailItemHeight: 76,
		});
	});
});

suite('AgentHostChatInputPicker - resolveConfigChipValue', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('running (titled) session', () => {

		test('server value wins over a stale overlay (server-driven mode change is reflected)', () => {
			// Server flips Plan → Autopilot (e.g. user approved a plan); the
			// overlay still holds the old manually-picked value.
			assert.strictEqual(resolveConfigChipValue(false, 'autopilot', 'plan', 'interactive'), 'autopilot');
		});

		suite('AgentHostChatInputPicker - approval controls', () => {

			test('shows Approve When Safe only when the experimental setting is enabled', () => {
				assert.deepStrictEqual({
					enabled: isAutoApproveValueVisible(ChatPermissionLevel.Assisted, true),
					disabled: isAutoApproveValueVisible(ChatPermissionLevel.Assisted, false),
					bypass: isAutoApproveValueVisible(ChatPermissionLevel.AutoApprove, false),
				}, {
					enabled: true,
					disabled: false,
					bypass: true,
				});
			});

			test('enterprise policy restricts and normalizes Approve When Safe and Allow All equally', () => {
				assert.deepStrictEqual({
					autoRestricted: isAutoApproveValuePolicyRestricted(ChatPermissionLevel.Assisted, true),
					bypassRestricted: isAutoApproveValuePolicyRestricted(ChatPermissionLevel.AutoApprove, true),
					defaultRestricted: isAutoApproveValuePolicyRestricted(ChatPermissionLevel.Default, true),
					autoNormalized: normalizeSessionConfigValue(SessionConfigKey.AutoApprove, ChatPermissionLevel.Assisted, true),
					bypassNormalized: normalizeSessionConfigValue(SessionConfigKey.AutoApprove, ChatPermissionLevel.AutoApprove, true),
				}, {
					autoRestricted: true,
					bypassRestricted: true,
					defaultRestricted: false,
					autoNormalized: ChatPermissionLevel.Default,
					bypassNormalized: ChatPermissionLevel.Default,
				});
			});
		});

		test('falls back to overlay when the server has no value', () => {
			assert.strictEqual(resolveConfigChipValue(false, undefined, 'plan', 'interactive'), 'plan');
		});

		test('falls back to schema default when neither has a value', () => {
			assert.strictEqual(resolveConfigChipValue(false, undefined, undefined, 'interactive'), 'interactive');
		});
	});

	suite('AgentHostChatInputPicker - hovers', () => {
		const approvalsSchema = {
			type: 'string',
			title: 'Approvals',
			description: 'Tool approval behavior for this session',
			enum: ['default', 'autoApprove'],
			enumLabels: ['Default approvals', 'Allow all'],
			enumDescriptions: ['Asks when approval settings don\'t apply', 'Runs tool calls without asking'],
		} as SessionConfigPropertySchema;

		test('explains the selected approval level on the trigger hover', () => {
			assert.strictEqual(
				getConfigPickerTriggerHover(SessionConfigKey.AutoApprove, approvalsSchema, 'autoApprove', false),
				'Copilot runs all tools without asking for approval.'
			);
		});

		test('explains approval choices on item hover', () => {
			assert.deepStrictEqual({
				auto: getConfigPickerItemHover(SessionConfigKey.AutoApprove, { value: 'assisted', label: 'Assisted permissions', description: 'Evaluates risk before running tools' }, false),
				bypass: getConfigPickerItemHover(SessionConfigKey.AutoApprove, { value: 'autoApprove', label: 'Allow all', description: 'Runs tool calls without asking' }, false),
			}, {
				auto: 'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.',
				bypass: 'Copilot runs all tools without asking for approval.',
			});
		});

		test('directs users to their administrator when approvals are disabled by policy', () => {
			assert.strictEqual(
				getConfigPickerItemHover(SessionConfigKey.AutoApprove, { value: 'assisted', label: 'Assisted permissions' }, true),
				'Disabled by your organization. Contact your administrator.'
			);
		});

		test('explains the selected Codex permissions preset on the trigger hover', () => {
			const codexApprovalsSchema = {
				type: 'string',
				title: 'Approvals',
				description: 'How much Codex can do on its own before asking for approval.',
				enum: ['default', 'auto-review', 'full-access'],
				enumLabels: ['Default Permissions', 'Auto-Review', 'Full Access'],
				enumDescriptions: ['Default access', 'Auto-review access', 'Full machine access'],
			} as SessionConfigPropertySchema;

			assert.strictEqual(
				getConfigPickerTriggerHover(CodexSessionConfigKey.PermissionsPreset, codexApprovalsSchema, 'full-access', false),
				'Full machine access'
			);
		});
	});

	suite('untitled (pre-send) session', () => {

		test('overlay wins so a synchronous chip edit is reflected before the backend echoes', () => {
			assert.strictEqual(resolveConfigChipValue(true, 'interactive', 'plan', 'interactive'), 'plan');
		});

		test('falls back to server value when the overlay has none', () => {
			assert.strictEqual(resolveConfigChipValue(true, 'autopilot', undefined, 'interactive'), 'autopilot');
		});

		test('falls back to schema default when neither has a value', () => {
			assert.strictEqual(resolveConfigChipValue(true, undefined, undefined, 'interactive'), 'interactive');
		});
	});
});
