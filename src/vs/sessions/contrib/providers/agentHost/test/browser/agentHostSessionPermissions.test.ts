/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getAgentHostSessionPermissionConfig, getAgentHostSessionPermissionOptions } from '../../browser/agentHostSessionPermissions.js';

suite('AgentHostSessionPermissions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exposes exact provider choices and maps allow-all permissions without bypassing policy', () => {
		assert.deepStrictEqual({
			copilotOptions: getAgentHostSessionPermissionOptions('copilotcli', false, true).map(option => ({ id: option.id, label: option.label, default: option.isDefault, allowAll: option.isAllowAll, comparisonModeId: option.comparisonModeId })),
			claudeOptions: getAgentHostSessionPermissionOptions('claude', false, true).map(option => ({ id: option.id, label: option.label, default: option.isDefault, allowAll: option.isAllowAll, comparisonModeId: option.comparisonModeId })),
			codexOptions: getAgentHostSessionPermissionOptions('codex', false, true).map(option => ({ id: option.id, label: option.label, default: option.isDefault, allowAll: option.isAllowAll, comparisonModeId: option.comparisonModeId })),
			copilotDefault: getAgentHostSessionPermissionConfig('copilotcli', 'default', false, true),
			copilotAllowAll: getAgentHostSessionPermissionConfig('copilotcli', 'autoApprove', false, true),
			copilotAssisted: getAgentHostSessionPermissionConfig('copilotcli', 'assisted', false, true),
			claudeAllowAll: getAgentHostSessionPermissionConfig('claude', 'bypassPermissions', false, true),
			codexAllowAll: getAgentHostSessionPermissionConfig('codex', 'full-access', false, true),
			policyRestricted: getAgentHostSessionPermissionConfig('copilotcli', 'autoApprove', true, true),
			unknownPermission: getAgentHostSessionPermissionConfig('codex', 'future', false, true),
		}, {
			copilotOptions: [
				{ id: 'default', label: 'Manual permissions', default: true, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'assisted', label: 'Assisted permissions', default: undefined, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'autoApprove', label: 'Allow all', default: undefined, allowAll: true, comparisonModeId: 'autopilot' },
			],
			claudeOptions: [
				{ id: 'default', label: 'Ask Before Edits', default: true, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'acceptEdits', label: 'Edit Automatically', default: undefined, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'plan', label: 'Plan Mode', default: undefined, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'auto', label: 'Auto Mode', default: undefined, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'bypassPermissions', label: 'Bypass Permissions', default: undefined, allowAll: true, comparisonModeId: undefined },
			],
			codexOptions: [
				{ id: 'default', label: 'Default Permissions', default: true, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'auto-review', label: 'Auto-Review', default: undefined, allowAll: undefined, comparisonModeId: undefined },
				{ id: 'full-access', label: 'Full Access', default: undefined, allowAll: true, comparisonModeId: undefined },
			],
			copilotDefault: { mode: 'interactive', autoApprove: 'default' },
			copilotAllowAll: { mode: 'interactive', autoApprove: 'autoApprove' },
			copilotAssisted: { mode: 'interactive', autoApprove: 'assisted' },
			claudeAllowAll: { permissionMode: 'bypassPermissions' },
			codexAllowAll: { mode: 'interactive', 'codex.permissionsPreset': 'full-access' },
			policyRestricted: undefined,
			unknownPermission: undefined,
		});
	});
});
