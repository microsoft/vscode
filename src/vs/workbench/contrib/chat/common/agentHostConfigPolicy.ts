/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { ChatConfiguration, ChatPermissionLevel } from './constants.js';

export function autoApprovePolicyValue(policyData: IPolicyData): false | undefined {
	return policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable' ? false : undefined;
}

export function isAutoApprovePolicyRestricted(configurationService: IConfigurationService): boolean {
	return configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
}

export function isAssistedPermissionsEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(ChatConfiguration.AssistedPermissionsEnabled) === true;
}

export function isPermissionLevelVisible(value: unknown, assistedPermissionsEnabled: boolean): boolean {
	return value !== ChatPermissionLevel.Assisted || assistedPermissionsEnabled;
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
