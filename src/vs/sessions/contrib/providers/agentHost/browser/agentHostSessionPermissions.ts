/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID } from '../../../../../platform/agentHost/common/agent.js';
import { ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { CodexSessionConfigKey, narrowCodexPermissionsPreset } from '../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { getAvailableSessionApprovalValues, getEffectiveSessionApprovalValue, getSessionApprovalProperty, isSessionConfigWritable, readSessionApprovalLevel, writeSessionApprovalLevel } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { type ISessionPermissionOption } from '../../../../services/sessions/common/sessionsProvider.js';

const COPILOT_CLI_AGENT_PROVIDER_ID = 'copilotcli';
const policyLockedReason = () => localize('sessionComparison.permissions.policyLocked', "Disabled by your organization");

/** Reads the selected native permission without substituting a different permission choice. */
export function getAgentHostSessionPermissionId(agentProvider: string, config: ResolveSessionConfigResult): string | undefined {
	const key = agentProvider === CLAUDE_AGENT_PROVIDER_ID ? ClaudeSessionConfigKey.PermissionMode
		: agentProvider === CODEX_AGENT_PROVIDER_ID ? CodexSessionConfigKey.PermissionsPreset : undefined;
	if (key) {
		const value = config.values[key] ?? config.schema.properties[key]?.default;
		return typeof value === 'string' ? value : undefined;
	}
	const approval = getSessionApprovalProperty(config.schema);
	return approval ? readSessionApprovalLevel(approval, getEffectiveSessionApprovalValue(approval, config.schema, config.values)) : undefined;
}

/** Returns the exact permission choices owned by an Agent Host backend. */
export function getAgentHostSessionPermissionOptions(agentProvider: string, policyRestricted: boolean, assistedPermissionsEnabled: boolean, config?: ResolveSessionConfigResult): readonly ISessionPermissionOption[] {
	const approval = agentProvider !== CLAUDE_AGENT_PROVIDER_ID && agentProvider !== CODEX_AGENT_PROVIDER_ID ? getSessionApprovalProperty(config?.schema) : undefined;
	if (config && approval) {
		if (!isSessionConfigWritable(approval.schema, true)) {
			return [];
		}
		const available = getAvailableSessionApprovalValues(approval, config.schema, config.values);
		return getAgentHostSessionPermissionOptions(COPILOT_CLI_AGENT_PROVIDER_ID, policyRestricted, assistedPermissionsEnabled)
			.filter(option => {
				const value = writeSessionApprovalLevel(approval, option.id);
				return value !== undefined && available.includes(value);
			});
	}
	switch (agentProvider) {
		case COPILOT_CLI_AGENT_PROVIDER_ID:
			return [{
				id: 'default',
				label: localize('sessionComparison.permissions.copilot.default', "Manual permissions"),
				description: localize('sessionComparison.permissions.copilot.defaultDescription', "Asks before running tools unless your configured approval settings allow them."),
				isDefault: true,
			}, ...(assistedPermissionsEnabled ? [{
				id: 'assisted',
				label: localize('sessionComparison.permissions.copilot.assisted', "Assisted permissions"),
				description: localize('sessionComparison.permissions.copilot.assistedDescription', "An LLM judge evaluates tool calls and asks when it does not approve them."),
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}] : []), {
				id: 'autoApprove',
				label: localize('sessionComparison.permissions.copilot.allowAll', "Allow all"),
				description: localize('sessionComparison.permissions.copilot.allowAllDescription', "Runs all tool calls without asking for approval."),
				isAllowAll: true,
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}];
		case CLAUDE_AGENT_PROVIDER_ID:
			return [{
				id: 'default',
				label: localize('sessionComparison.permissions.claude.default', "Ask Before Edits"),
				description: localize('sessionComparison.permissions.claude.defaultDescription', "Claude asks before editing files."),
				isDefault: true,
			}, {
				id: 'acceptEdits',
				label: localize('sessionComparison.permissions.claude.acceptEdits', "Edit Automatically"),
				description: localize('sessionComparison.permissions.claude.acceptEditsDescription', "Claude edits files without asking and asks before using other tools."),
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}, {
				id: 'plan',
				label: localize('sessionComparison.permissions.claude.plan', "Plan Mode"),
				description: localize('sessionComparison.permissions.claude.planDescription', "Claude creates a plan before making changes."),
			}, {
				id: 'auto',
				label: localize('sessionComparison.permissions.claude.auto', "Auto Mode"),
				description: localize('sessionComparison.permissions.claude.autoDescription', "Claude decides whether to ask for each tool operation."),
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}, {
				id: 'bypassPermissions',
				label: localize('sessionComparison.permissions.claude.bypass', "Bypass Permissions"),
				description: localize('sessionComparison.permissions.claude.bypassDescription', "Claude runs all tools without asking."),
				isAllowAll: true,
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}];
		case CODEX_AGENT_PROVIDER_ID:
			return [{
				id: 'default',
				label: localize('sessionComparison.permissions.codex.default', "Default Permissions"),
				description: localize('sessionComparison.permissions.codex.defaultDescription', "Codex works inside the workspace sandbox and asks before broader access."),
				isDefault: true,
			}, {
				id: 'auto-review',
				label: localize('sessionComparison.permissions.codex.autoReview', "Auto-Review"),
				description: localize('sessionComparison.permissions.codex.autoReviewDescription', "Approval requests are routed through the auto-reviewer instead of prompting you."),
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}, {
				id: 'full-access',
				label: localize('sessionComparison.permissions.codex.fullAccess', "Full Access"),
				description: localize('sessionComparison.permissions.codex.fullAccessDescription', "Codex can use the internet and edit files outside the workspace without asking."),
				isAllowAll: true,
				locked: policyRestricted,
				lockedReason: policyRestricted ? policyLockedReason() : undefined,
			}];
		default:
			return [];
	}
}

/** Maps one advertised permission choice to the backend's native session configuration. */
export function getAgentHostSessionPermissionConfig(agentProvider: string, permissionId: string, policyRestricted: boolean, assistedPermissionsEnabled: boolean, config?: ResolveSessionConfigResult): Record<string, unknown> | undefined {
	const option = getAgentHostSessionPermissionOptions(agentProvider, policyRestricted, assistedPermissionsEnabled, config)
		.find(candidate => candidate.id === permissionId && !candidate.locked);
	if (!option) {
		return undefined;
	}

	if (config) {
		const key = agentProvider === CLAUDE_AGENT_PROVIDER_ID ? ClaudeSessionConfigKey.PermissionMode
			: agentProvider === CODEX_AGENT_PROVIDER_ID ? CodexSessionConfigKey.PermissionsPreset : undefined;
		if (key) {
			return isSessionConfigWritable(config.schema.properties[key], true) && config.schema.properties[key].enum?.includes(permissionId)
				? { [key]: permissionId } : undefined;
		}
		const approval = getSessionApprovalProperty(config.schema);
		if (approval) {
			const value = writeSessionApprovalLevel(approval, permissionId);
			return value === undefined ? undefined : { [approval.key]: value };
		}
		return undefined;
	}

	switch (agentProvider) {
		case COPILOT_CLI_AGENT_PROVIDER_ID:
			return {
				[SessionConfigKey.Mode]: 'interactive',
				[SessionConfigKey.AutoApprove]: permissionId,
			};
		case CLAUDE_AGENT_PROVIDER_ID: {
			const permissionMode = narrowClaudePermissionMode(permissionId);
			return permissionMode ? { [ClaudeSessionConfigKey.PermissionMode]: permissionMode } : undefined;
		}
		case CODEX_AGENT_PROVIDER_ID: {
			const permissionsPreset = narrowCodexPermissionsPreset(permissionId);
			return permissionsPreset ? {
				[SessionConfigKey.Mode]: 'interactive',
				[CodexSessionConfigKey.PermissionsPreset]: permissionsPreset,
			} : undefined;
		}
		default:
			return undefined;
	}
}
