/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { getAgentHostSessionPermissionConfig, getAgentHostSessionPermissionId, getAgentHostSessionPermissionOptions } from '../../browser/agentHostSessionPermissions.js';

suite('AgentHostSessionPermissions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('captures exact native permissions without silently changing unknown values', () => {
		assert.deepStrictEqual({
			claude: getAgentHostSessionPermissionId('claude', { schema: { type: 'object', properties: {} }, values: { permissionMode: 'acceptEdits' } }),
			codex: getAgentHostSessionPermissionId('codex', { schema: { type: 'object', properties: {} }, values: { 'codex.permissionsPreset': 'auto-review' } }),
			unknown: getAgentHostSessionPermissionId('conforming-host', { schema: { type: 'object', properties: {} }, values: {} }),
			native: getAgentHostSessionPermissionId('conforming-host', {
				schema: { type: 'object', properties: { approvalMode: { type: 'string', title: 'Approval', enum: ['manual', 'allow-all'] } } },
				values: { approvalMode: 'allow-all' },
			}),
		}, { claude: 'acceptEdits', codex: 'auto-review', unknown: undefined, native: 'autoApprove' });
	});

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
				{ id: 'autoApprove', label: 'Allow all', default: undefined, allowAll: true, comparisonModeId: undefined },
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

	for (const agentProvider of ['copilotcli', 'conforming-host']) {
		test(`maps advertised approval aliases for ${agentProvider}`, () => {
			const config: ResolveSessionConfigResult = {
				schema: {
					type: 'object', properties: {
						approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'assisted', 'allow-all'] },
						effectiveApprovalMode: { type: 'string', title: 'Effective approvals', readOnly: true },
						availableApprovalModes: { type: 'array', title: 'Available approvals', readOnly: true },
					}
				},
				values: { approvalMode: 'allow-all', effectiveApprovalMode: 'assisted', availableApprovalModes: ['manual', 'assisted'] },
			};
			assert.deepStrictEqual({
				current: getAgentHostSessionPermissionId(agentProvider, config),
				choices: getAgentHostSessionPermissionOptions(agentProvider, false, true, config).map(option => option.id),
				manual: getAgentHostSessionPermissionConfig(agentProvider, 'default', false, true, config),
				assisted: getAgentHostSessionPermissionConfig(agentProvider, 'assisted', false, true, config),
				unavailable: getAgentHostSessionPermissionConfig(agentProvider, 'autoApprove', false, true, config),
				policyRestricted: getAgentHostSessionPermissionConfig(agentProvider, 'assisted', true, true, config),
			}, {
				current: 'assisted', choices: ['default', 'assisted'],
				manual: { approvalMode: 'manual' }, assisted: { approvalMode: 'assisted' },
				unavailable: undefined, policyRestricted: undefined,
			});
		});
	}

	test('does not write read-only approval settings or fall through a malformed canonical property', () => {
		const config: ResolveSessionConfigResult = {
			schema: {
				type: 'object', properties: {
					approvalMode: { type: 'string', title: 'Approvals', enum: ['manual', 'allow-all'], readOnly: true },
				}
			},
			values: { approvalMode: 'manual' },
		};
		const malformed: ResolveSessionConfigResult = {
			...config,
			schema: {
				type: 'object', properties: {
					autoApprove: { type: 'boolean', title: 'Approvals' },
					approvalMode: { ...config.schema.properties.approvalMode, readOnly: false },
				}
			},
		};
		assert.deepStrictEqual({
			readOnly: getAgentHostSessionPermissionConfig('conforming-host', 'default', false, true, config),
			malformed: getAgentHostSessionPermissionConfig('conforming-host', 'default', false, true, malformed),
		}, { readOnly: undefined, malformed: undefined });
	});

	for (const permission of [
		{ provider: 'claude', key: 'permissionMode', value: 'acceptEdits' },
		{ provider: 'codex', key: 'codex.permissionsPreset', value: 'auto-review' },
	]) {
		test(`preserves ${permission.provider} native permissions alongside generic approval settings`, () => {
			const config: ResolveSessionConfigResult = {
				schema: {
					type: 'object', properties: {
						[permission.key]: { type: 'string', title: 'Permissions', enum: ['default', permission.value] },
						autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'autoApprove'] },
					}
				},
				values: { [permission.key]: permission.value, autoApprove: 'autoApprove' },
			};
			assert.deepStrictEqual({
				current: getAgentHostSessionPermissionId(permission.provider, config),
				creation: getAgentHostSessionPermissionConfig(permission.provider, permission.value, false, true, config),
			}, { current: permission.value, creation: { [permission.key]: permission.value } });
		});
	}
});
