/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, IManagedPermissions, MANAGED_PERMISSION_TERMINAL_ASK_RULE, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from './agentHostSchema.js';

export interface IManagedPermissionsSettingMapping {
	readonly settingId: string;
	readonly transform: (value: unknown) => IManagedPermissions | undefined;
}

export function createManagedPermissionsSettingMapping<T>(settingId: string, transform: (value: T | undefined) => IManagedPermissions | undefined): IManagedPermissionsSettingMapping {
	return { settingId, transform: value => transform(value as T | undefined) };
}

export const managedPermissionsSettingMappings: readonly IManagedPermissionsSettingMapping[] = [
	createManagedPermissionsSettingMapping<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID, value => value === false ? { disableBypassPermissionsMode: 'disable' } : undefined),
	createManagedPermissionsSettingMapping<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, value => value === false ? { ask: [MANAGED_PERMISSION_TERMINAL_ASK_RULE] } : undefined),
];

export function resolveManagedPermissions(configurationService: IConfigurationService): IManagedPermissions | undefined {
	const permissions: IManagedPermissions = {};
	for (const entry of managedPermissionsSettingMappings) {
		const contribution = entry.transform(configurationService.getValue(entry.settingId));
		if (contribution) {
			Object.assign(permissions, contribution);
		}
	}
	return Object.keys(permissions).length > 0 ? permissions : undefined;
}
