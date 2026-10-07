/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { localize } from '../../../../nls.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../platform/agentHost/common/agent.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, IChatDefaultConfiguration, isChatPermissionLevel } from './constants.js';

export function usesAgentHostPermissionState(isLocal: boolean | undefined, provider: string | undefined): boolean {
	return isLocal === true && provider === COPILOT_CLI_AGENT_PROVIDER_ID;
}

/** An incomplete report is unavailable, never an unrestricted set or an effective Manual selection. */
export function getAgentHostPermissionState(config: ResolveSessionConfigResult | undefined): { available: readonly ChatPermissionLevel[]; effective: ChatPermissionLevel } | undefined {
	const schema = config?.schema.properties;
	const available = config?.values.availableApprovalModes;
	const effective = config?.values.effectiveApprovalMode;
	if (schema?.availableApprovalModes?.type !== 'array' || schema.availableApprovalModes.readOnly !== true
		|| schema.effectiveApprovalMode?.type !== 'string' || schema.effectiveApprovalMode.readOnly !== true
		|| !Array.isArray(available) || available.length === 0 || new Set(available).size !== available.length
		|| !available.every(value => isChatPermissionLevel(value) && value !== ChatPermissionLevel.Autopilot && schema.autoApprove?.enum?.includes(value))
		|| !isChatPermissionLevel(effective) || !available.includes(effective)) {
		return undefined;
	}
	return { available, effective };
}

export function validateAgentHostPermissionState(config: ResolveSessionConfigResult | undefined, required: boolean): void {
	if (required && !getAgentHostPermissionState(config)) {
		throw new Error(localize('agentHost.permissionsUnavailable', "The agent host could not resolve session permissions. Try again when the agent host is available."));
	}
}

/** Only the scoped Copilot host defers an unconfigured approval default to runtime policy. */
export function getAgentHostPermissionDefault(configurationService: IConfigurationService, hostAuthoritative = false): ChatPermissionLevel | undefined {
	const inspected = configurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
	if (!hostAuthoritative) {
		return getChatPermissionLevelFromDefaultConfiguration(inspected.value?.approvals);
	}
	const configured = [
		inspected.policyValue, inspected.workspaceFolderValue, inspected.workspaceValue,
		inspected.userRemoteValue, inspected.userLocalValue, inspected.userValue, inspected.applicationValue,
	].find(value => value?.approvals !== undefined);
	return getChatPermissionLevelFromDefaultConfiguration(configured?.approvals);
}

export function autoApprovePolicyValue(policyData: IPolicyData): false | undefined {
	return policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable' ? false : undefined;
}

export function isAutoApprovePolicyRestricted(configurationService: IConfigurationService, isLocal = false, provider?: string): boolean {
	return !usesAgentHostPermissionState(isLocal, provider)
		&& configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
}

export function isAutoApproveValuePolicyRestricted(value: unknown, policyRestricted: boolean): boolean {
	return policyRestricted && value !== ChatPermissionLevel.Default;
}

export function normalizeSessionConfigValue(property: string, value: string, policyRestricted: boolean): string;
export function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown;
export function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown {
	if (property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(value, policyRestricted)) {
		return ChatPermissionLevel.Default;
	}
	return value;
}
