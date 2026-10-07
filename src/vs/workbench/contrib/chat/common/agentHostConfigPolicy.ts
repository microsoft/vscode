/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { isManagedAutoApprovePolicy } from '../../../../platform/agentHost/common/agentHostManagedSettings.js';
import { IPolicyService } from '../../../../platform/policy/common/policy.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, IChatDefaultConfiguration } from './constants.js';

/** Schema defaults describe the picker, not an explicit host startup choice. */
export function getExplicitAgentHostPermissionDefault(configurationService: IConfigurationService): ChatPermissionLevel | undefined {
	const inspected = configurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
	const configured = [
		inspected.policyValue, inspected.workspaceFolderValue, inspected.workspaceValue,
		inspected.userRemoteValue, inspected.userLocalValue, inspected.userValue, inspected.applicationValue,
	].find(value => value?.approvals !== undefined);
	return getChatPermissionLevelFromDefaultConfiguration(configured?.approvals);
}

export function autoApprovePolicyValue(policyData: IPolicyData): false | undefined {
	return policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable' ? false : undefined;
}

export function isAutoApprovePolicyRestricted(configurationService: IConfigurationService, policyService?: IPolicyService, forwardsClientManagedSettings = false): boolean {
	return configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false
		&& (!forwardsClientManagedSettings || !isManagedAutoApprovePolicy(policyService));
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
