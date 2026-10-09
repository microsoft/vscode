/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { getAvailableSessionApprovalValues, getSessionApprovalProperty, writeSessionApprovalLevel } from '../../../../platform/agentHost/common/sessionConfigProperties.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult, SessionConfigSchema } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, IChatDefaultConfiguration } from './constants.js';

export function usesHostApprovalPolicy(schema: SessionConfigSchema | undefined): boolean {
	return !!getSessionApprovalProperty(schema)
		&& schema?.properties.availableApprovalModes?.type === 'array'
		&& schema.properties.availableApprovalModes.readOnly === true;
}

/** A schema default is not an explicit preference that overrides the host's managed default. */
export function getAgentHostApprovalDefault(configurationService: IConfigurationService): ChatPermissionLevel | undefined {
	const inspected = configurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
	const configured = [inspected.policyValue, inspected.memoryValue, inspected.workspaceFolderValue, inspected.workspaceValue, inspected.userRemoteValue,
	inspected.userLocalValue, inspected.userValue, inspected.applicationValue].find(value => value?.approvals !== undefined);
	return getChatPermissionLevelFromDefaultConfiguration(configured?.approvals);
}

export function autoApprovePolicyValue(policyData: IPolicyData): false | undefined {
	return policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable' ? false : undefined;
}

export function isAutoApprovePolicyRestricted(configurationService: IConfigurationService, schema?: SessionConfigSchema): boolean {
	return !usesHostApprovalPolicy(schema) && configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
}

export function isAutoApproveValuePolicyRestricted(value: unknown, policyRestricted: boolean): boolean {
	return policyRestricted && value !== ChatPermissionLevel.Default;
}

export function normalizeSessionConfigValue(property: string, value: string, policyRestricted: boolean): string;
export function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown;
export function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown {
	if (property === 'approvalMode' && policyRestricted && value !== 'manual') {
		return 'manual';
	}
	if (property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(value, policyRestricted)) {
		return ChatPermissionLevel.Default;
	}
	return value;
}

/** Applies the legacy fallback only after discovering the host's approval contract. */
export function normalizeAgentHostApprovalConfig(configurationService: IConfigurationService, resolved: ResolveSessionConfigResult, values: Readonly<Record<string, unknown>>): Record<string, unknown> {
	const result = { ...values };
	const { schema } = resolved;
	const approval = getSessionApprovalProperty(schema);
	if (approval?.key === 'approvalMode' && typeof result[SessionConfigKey.AutoApprove] === 'string') {
		result.approvalMode ??= writeSessionApprovalLevel(approval, result[SessionConfigKey.AutoApprove]);
		delete result[SessionConfigKey.AutoApprove];
	}
	const restricted = isAutoApprovePolicyRestricted(configurationService, schema);
	if (restricted && approval && !approval.schema.readOnly) {
		result[approval.key] = writeSessionApprovalLevel(approval, ChatPermissionLevel.Default);
	}
	for (const key of [SessionConfigKey.AutoApprove, 'approvalMode']) {
		if (Object.hasOwn(result, key)) {
			result[key] = normalizeSessionConfigValue(key, result[key], restricted);
		}
	}
	const approvalValue = approval && result[approval.key];
	if (approval && typeof approvalValue === 'string' && !getAvailableSessionApprovalValues(approval, schema, resolved.values).includes(approvalValue)) {
		delete result[approval.key];
	}
	return result;
}

/** Discover the approval binding before applying a legacy Manual fallback, even without a preference. */
export async function resolveInitialAgentHostApprovalConfig(
	configurationService: IConfigurationService,
	connection: Pick<IAgentConnection, 'resolveSessionConfig'>,
	provider: string,
	workingDirectory: URI | undefined,
	config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	if (!isAutoApprovePolicyRestricted(configurationService)) {
		return config;
	}
	const resolved = await connection.resolveSessionConfig({ provider, workingDirectory });
	return normalizeAgentHostApprovalConfig(configurationService, resolved, config);
}
