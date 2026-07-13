/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration, ChatPermissionLevel } from './constants.js';

export function isAutoApprovePolicyRestricted(configurationService: IConfigurationService): boolean {
	return configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
}

export function normalizeSessionConfigValue(property: string, value: string, policyRestricted: boolean): string;
export function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown;
export function normalizeSessionConfigValue(property: string, value: unknown, policyRestricted: boolean): unknown {
	if (property === SessionConfigKey.AutoApprove && policyRestricted && value !== ChatPermissionLevel.Default) {
		return ChatPermissionLevel.Default;
	}
	return value;
}
