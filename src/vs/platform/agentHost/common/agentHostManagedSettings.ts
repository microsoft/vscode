/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IConfigurationService } from '../../configuration/common/configuration.js';
import { getGlobalConfigurationValue, inspectValue } from './agentHostConfigurationSync.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from './agentHostSchema.js';

export interface IAgentHostManagedSettingsPermissions {
	disableBypassPermissionsMode?: 'disable';
	deny?: string[];
	ask?: string[];
}

export const AgentHostMapLegacySettingsToManagedSettingsSettingId = 'chat.agentHost.copilot.mapLegacySettingsToManagedSettings';

interface IManagedPermissionsSettingMapping {
	readonly settingId: string;
	contribute(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions | undefined;
}

function managedPermissionsSetting<T>(settingId: string, transform: (value: T, source: 'policyValue' | 'userValue' | 'applicationValue') => IAgentHostManagedSettingsPermissions | undefined): IManagedPermissionsSettingMapping {
	return {
		settingId,
		contribute: configurationService => {
			const configuration = inspectValue<T>(configurationService, settingId);
			return configuration === undefined ? undefined : transform(...configuration);
		},
	};
}

/** Compatibility mappings for legacy settings only; new controls belong directly in the SDK. */
const managedPermissionsSettings: readonly IManagedPermissionsSettingMapping[] = [
	managedPermissionsSetting<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID, (value, source) => source === 'policyValue' && value === false ? { disableBypassPermissionsMode: 'disable' } : undefined),
	managedPermissionsSetting<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, value => value === false ? { ask: ['Shell'] } : undefined),
];

export const managedPermissionsConfigurationIds = [
	AgentHostMapLegacySettingsToManagedSettingsSettingId,
	...managedPermissionsSettings.map(mapping => mapping.settingId),
];

export function isManagedSettingsPermissions(value: unknown): value is IAgentHostManagedSettingsPermissions {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const permissions = value as Record<string, unknown>;
	if (Object.keys(permissions).some(key => key !== 'disableBypassPermissionsMode' && key !== 'deny' && key !== 'ask')) {
		return false;
	}
	return (permissions.disableBypassPermissionsMode === undefined || permissions.disableBypassPermissionsMode === 'disable')
		&& isStringArrayOrUndefined(permissions.deny)
		&& isStringArrayOrUndefined(permissions.ask);
}

function isStringArrayOrUndefined(value: unknown): boolean {
	return value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

export function resolveManagedSettingsPermissions(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions {
	if (getGlobalConfigurationValue<boolean>(configurationService, AgentHostMapLegacySettingsToManagedSettingsSettingId) !== true) {
		return {};
	}

	const permissions: IAgentHostManagedSettingsPermissions = {};
	for (const mapping of managedPermissionsSettings) {
		const contribution = mapping.contribute(configurationService);
		if (contribution?.disableBypassPermissionsMode) {
			permissions.disableBypassPermissionsMode = contribution.disableBypassPermissionsMode;
		}
		if (contribution?.deny) {
			permissions.deny = [...permissions.deny ?? [], ...contribution.deny];
		}
		if (contribution?.ask) {
			permissions.ask = [...permissions.ask ?? [], ...contribution.ask];
		}
	}
	return permissions;
}
