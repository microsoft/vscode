/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, ManagedSettingsPermissions, PermissionMode, SessionEventPayload } from '@github/copilot-sdk';
import { raceTimeout } from '../../../../base/common/async.js';
import { AutoApproveLevel, platformSessionSchema } from '../../common/agentHostSchema.js';
import { ResolveSessionConfigResult } from '../../common/state/protocol/commands.js';
import { localize } from '../../../../nls.js';

export const AGENT_HOST_COPILOT_CLIENT_NAME = 'vscode-agent-host';

export async function resolveCopilotManagedSettings(
	managedSettings: Pick<CopilotClient['rpc']['managedSettings'], 'resolve'>,
	token: string | undefined,
	timeoutMs: number,
	workingDirectory?: string,
): Promise<Awaited<ReturnType<CopilotClient['rpc']['managedSettings']['resolve']>>> {
	const result = await raceTimeout(managedSettings.resolve({
		clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
		...(token ? { gitHubToken: token } : {}),
		...(workingDirectory ? { workingDirectory } : {}),
	}), timeoutMs);
	if (!result) {
		throw new Error(`Copilot runtime managed-settings query exceeded ${timeoutMs / 1000} seconds while waiting for native MDM or GitHub policy resolution.`);
	}
	return result;
}

export function fromCopilotPermissionMode(mode: PermissionMode): AutoApproveLevel {
	return mode === 'manual' ? 'default' : mode === 'allow-all' ? 'autoApprove' : 'assisted';
}

/** Explicit new mode restrictions replace the legacy blanket policy, but not other tool restrictions. */
export function getCopilotApprovalPolicy(
	resolved: SessionEventPayload<'session.managed_settings_resolved'>['data'],
	legacyRestricted: boolean,
	bridged: ManagedSettingsPermissions = {},
): { available: AutoApproveLevel[]; defaultMode: AutoApproveLevel; permissions: ManagedSettingsPermissions } {
	const settings = resolved.settings;
	const value = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.permissions : undefined;
	const modes = value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
	const explicit = typeof modes?.disableAssistedPermissionsMode === 'boolean'
		|| modes?.disableBypassPermissionsMode === 'disable' || modes?.disableBypassPermissionsMode === 'enable';
	const permissions: ManagedSettingsPermissions = legacyRestricted && !explicit
		? { ...bridged, disableAssistedPermissionsMode: true, disableBypassPermissionsMode: 'disable' }
		: bridged;
	const available: AutoApproveLevel[] = [
		'default',
		...(!resolved.failClosed && modes?.disableAssistedPermissionsMode !== true && permissions.disableAssistedPermissionsMode !== true ? ['assisted' as const] : []),
		...(!resolved.failClosed && !resolved.bypassPermissionsDisabled && permissions.disableBypassPermissionsMode !== 'disable' ? ['autoApprove' as const] : []),
	];
	const requestedDefault = modes?.defaultMode === 'assisted' ? 'assisted' : modes?.defaultMode === 'allow-all' ? 'autoApprove' : 'default';
	return { available, defaultMode: available.includes(requestedDefault) ? requestedDefault : 'default', permissions };
}

export function getCopilotApprovalConfig(
	values: Record<string, unknown>,
	policy: ReturnType<typeof getCopilotApprovalPolicy>,
	globalAutoApprove: boolean,
): ResolveSessionConfigResult {
	const schema = platformSessionSchema.toProtocol();
	const approval = schema.properties.autoApprove;
	schema.properties.autoApprove = {
		...approval,
		default: policy.defaultMode,
	};
	schema.properties.availableApprovalModes = {
		type: 'array', title: localize('copilot.availableApprovals', "Available Permissions"), readOnly: true,
		items: { type: 'string', title: localize('copilot.approvalMode', "Permission Mode") },
	};
	schema.properties.effectiveApprovalMode = { type: 'string', title: localize('copilot.effectiveApprovals', "Effective Permissions"), readOnly: true };
	const selected = values.autoApprove ?? policy.defaultMode;
	const configured = policy.available.some(value => value === selected) ? selected : 'default';
	const effective = globalAutoApprove ? policy.available.includes('autoApprove') ? 'autoApprove' : 'default' : configured;
	return {
		schema,
		values: { ...values, availableApprovalModes: policy.available, autoApprove: configured, effectiveApprovalMode: effective },
	};
}
