/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { SessionConfigSchema } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, IChatDefaultConfiguration } from './constants.js';

export function usesHostApprovalPolicy(schema: SessionConfigSchema | undefined): boolean {
	return !!schema?.properties[SessionConfigKey.AutoApprove]
		&& schema.properties.availableApprovalModes?.type === 'array'
		&& schema.properties.availableApprovalModes.readOnly === true;
}

/** A schema default is not an explicit preference that overrides the host's managed default. */
export function getAgentHostApprovalDefault(configurationService: IConfigurationService, hostPolicy: boolean): ChatPermissionLevel | undefined {
	const inspected = configurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
	const configured = hostPolicy ? [inspected.policyValue, inspected.workspaceFolderValue, inspected.workspaceValue, inspected.userRemoteValue,
		inspected.userLocalValue, inspected.userValue, inspected.applicationValue].find(value => value?.approvals !== undefined) : inspected.value;
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
	if (property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(value, policyRestricted)) {
		return ChatPermissionLevel.Default;
	}
	return value;
}
