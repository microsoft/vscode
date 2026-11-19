/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { getAvailableSessionApprovalValues, getSessionApprovalProperty, writeSessionApprovalLevel } from '../../../../platform/agentHost/common/sessionConfigProperties.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult, SessionConfigSchema } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COPILOT_DISABLE_ASSISTED_PERMISSIONS_MODE_KEY, COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, IManagedSettingsService } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { ChatConfiguration, ChatDefaultPermissionLevel, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, IChatDefaultConfiguration } from './constants.js';

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

/**
 * The effective `chat.defaultConfiguration`. Organization policy replaces the whole object but may
 * manage only some of its properties, so each unmanaged property keeps the value merged from the
 * configured scopes, as it would without policy.
 */
export function getChatDefaultConfiguration(configurationService: IConfigurationService): IChatDefaultConfiguration | undefined {
	const inspected = configurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
	const policy = inspected.policyValue;
	if (!policy) {
		return inspected.value;
	}
	const layers = [inspected.defaultValue, inspected.applicationValue, inspected.userLocalValue, inspected.userRemoteValue, inspected.userValue,
	inspected.workspaceValue, inspected.workspaceFolderValue, inspected.memoryValue, policy];
	return Object.assign({}, ...layers.filter(isObject));
}

/**
 * The approval level an organization policy sets as the default for new agent sessions, for
 * pickers to label. The policy may also restrict levels; that remains the host's decision.
 */
export function getOrganizationDefaultApprovalLevel(configurationService: IConfigurationService): ChatPermissionLevel | undefined {
	return getChatPermissionLevelFromDefaultConfiguration(configurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration).policyValue?.approvals);
}

function getDefaultApprovalsLabel(value: unknown): string | undefined {
	switch (value) {
		case ChatDefaultPermissionLevel.Manual: return localize('chat.defaultConfiguration.policy.manual', "Manual permissions");
		case ChatDefaultPermissionLevel.Assisted: return localize('chat.defaultConfiguration.policy.assisted', "Assisted permissions");
		case ChatDefaultPermissionLevel.AllowAll: return localize('chat.defaultConfiguration.policy.allowAll', "Allow All");
		default: return undefined;
	}
}

/** Explains an organization-managed `chat.defaultConfiguration`, including a saved preference it supersedes. */
export function getDefaultConfigurationPolicyDescription(policyValue: unknown, configuredValue: unknown): string {
	const policy = isObject(policyValue) ? policyValue as IChatDefaultConfiguration : undefined;
	const configured = isObject(configuredValue) ? configuredValue as IChatDefaultConfiguration : undefined;
	const managed = getDefaultApprovalsLabel(policy?.approvals);
	if (!managed) {
		return localize('chat.defaultConfiguration.policy.generic', "Your organization sets the default configuration for new agent sessions. You can change it for each session.");
	}
	const saved = configured?.approvals !== policy?.approvals ? getDefaultApprovalsLabel(configured?.approvals) : undefined;
	return saved
		? localize('chat.defaultConfiguration.policy.overrideDescription', "Your organization sets {0} as the default for new agent sessions. Your saved preference {1} is preserved but does not apply while this policy is in effect. You can choose other permissions for each session.", managed, saved)
		: localize('chat.defaultConfiguration.policy.description', "Your organization sets {0} as the default for new agent sessions. You can choose other permissions for each session.", managed);
}

export function autoApprovePolicyValue(policyData: IPolicyData): false | undefined {
	return policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable' ? false : undefined;
}

export function isAutoApprovePolicyRestricted(configurationService: IConfigurationService, schema?: SessionConfigSchema): boolean {
	return !usesHostApprovalPolicy(schema) && configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
}

/**
 * Whether enterprise policy known to this client disables an approval level. Hosts report withheld levels without a
 * reason, so only levels proven here are attributed to policy. An explicit mode restriction replaces the legacy
 * global auto-approval policy, matching the managed-settings precedence the Copilot host applies.
 */
export function isApprovalLevelDisabledByKnownPolicy(level: string, configurationService: IConfigurationService, managedSettingsService: IManagedSettingsService): boolean {
	const assisted = managedSettingsService.getManagedSettingValue(COPILOT_DISABLE_ASSISTED_PERMISSIONS_MODE_KEY);
	const bypass = managedSettingsService.getManagedSettingValue(COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY);
	const legacy = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false
		&& typeof assisted !== 'boolean' && bypass !== 'disable' && bypass !== 'enable';
	switch (level) {
		case ChatPermissionLevel.Assisted:
			return assisted === true || legacy;
		case ChatPermissionLevel.AutoApprove:
			return bypass === 'disable' || legacy;
		default:
			return false;
	}
}

export function isAutoApproveValuePolicyRestricted(value: unknown, policyRestricted: boolean): boolean {
	return policyRestricted && value !== ChatPermissionLevel.Default;
}

/** Disables the global override when the user explicitly selects a lower session permission. */
export async function disableGlobalAutoApproveForPermissionSelection(configurationService: IConfigurationService, level: ChatPermissionLevel): Promise<void> {
	if (level !== ChatPermissionLevel.AutoApprove && configurationService.getValue<boolean>(ChatConfiguration.GlobalAutoApprove) === true) {
		await configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, false);
	}
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
