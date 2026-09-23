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
			copilotOptions: getAgentHostSessionPermissionOptions('copilotcli', false).map(option => ({ id: option.id, label: option.label, default: option.isDefault, allowAll: option.isAllowAll })),
			claudeOptions: getAgentHostSessionPermissionOptions('claude', false).map(option => ({ id: option.id, label: option.label, default: option.isDefault, allowAll: option.isAllowAll })),
			codexOptions: getAgentHostSessionPermissionOptions('codex', false).map(option => ({ id: option.id, label: option.label, default: option.isDefault, allowAll: option.isAllowAll })),
			copilotDefault: getAgentHostSessionPermissionConfig('copilotcli', 'default', false),
			copilotAllowAll: getAgentHostSessionPermissionConfig('copilotcli', 'autoApprove', false),
			copilotAssisted: getAgentHostSessionPermissionConfig('copilotcli', 'assisted', false),
			claudeAllowAll: getAgentHostSessionPermissionConfig('claude', 'bypassPermissions', false),
			codexAllowAll: getAgentHostSessionPermissionConfig('codex', 'full-access', false),
			policyRestricted: getAgentHostSessionPermissionConfig('copilotcli', 'autoApprove', true),
			unknownPermission: getAgentHostSessionPermissionConfig('codex', 'future', false),
		}, {
			copilotOptions: [
				{ id: 'default', label: 'Manual permissions', default: true, allowAll: undefined },
				{ id: 'autoApprove', label: 'Allow all', default: undefined, allowAll: true },
			],
			claudeOptions: [
				{ id: 'default', label: 'Ask Before Edits', default: true, allowAll: undefined },
				{ id: 'acceptEdits', label: 'Edit Automatically', default: undefined, allowAll: undefined },
				{ id: 'plan', label: 'Plan Mode', default: undefined, allowAll: undefined },
				{ id: 'auto', label: 'Auto Mode', default: undefined, allowAll: undefined },
				{ id: 'bypassPermissions', label: 'Bypass Permissions', default: undefined, allowAll: true },
			],
			codexOptions: [
				{ id: 'default', label: 'Default Permissions', default: true, allowAll: undefined },
				{ id: 'auto-review', label: 'Auto-Review', default: undefined, allowAll: undefined },
				{ id: 'full-access', label: 'Full Access', default: undefined, allowAll: true },
			],
			copilotDefault: { mode: 'interactive', autoApprove: 'default' },
			copilotAllowAll: { mode: 'autopilot', autoApprove: 'autoApprove' },
			copilotAssisted: undefined,
			claudeAllowAll: { permissionMode: 'bypassPermissions' },
			codexAllowAll: { mode: 'interactive', 'codex.permissionsPreset': 'full-access' },
			policyRestricted: undefined,
			unknownPermission: undefined,
		});
	});
});
