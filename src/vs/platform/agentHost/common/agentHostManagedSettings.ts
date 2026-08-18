/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IConfigurationService } from '../../configuration/common/configuration.js';
import { buildManagedFamilyRule, ManagedRuleFamily } from './agentHostManagedRules.js';
import { getGlobalConfigurationValue, inspectValue } from './agentHostConfigurationSync.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID } from './agentHostSchema.js';

/**
 * The restrictions this bridge contributes to the Copilot SDK.
 *
 * Note the deliberate absence of an `allow` list. The SDK's managed `allow` is
 * not a scoping hint — a covered request resolves to `managed_allow`, which the
 * runtime treats as outright approval and returns without prompting. Worse, the
 * runtime only intersects allow lists when more than one managed source supplies
 * one, so a lone list from VS Code is never intersected and would grant blanket
 * auto-approval, potentially relaxing an MDM policy rather than reinforcing it.
 * This bridge therefore only ever contributes restrictions.
 */
export interface IAgentHostManagedSettingsPermissions {
	disableBypassPermissionsMode?: 'disable';
	deny?: string[];
	ask?: string[];
}

export const AgentHostMapLegacySettingsToManagedSettingsSettingId = 'chat.agentHost.copilot.mapLegacySettingsToManagedSettings';

/**
 * Which configuration layers may drive a mapping.
 *
 * `policyOnly` is the default for anything that removes a capability the user
 * would otherwise have, so a personal preference is never promoted into an
 * enterprise-grade restriction the user cannot lift. `anyGlobal` exists for
 * mappings whose VS Code behavior already honors user and application values,
 * where narrowing to policy would be a regression.
 */
type ManagedPermissionsSettingSources = 'policyOnly' | 'anyGlobal';

interface IManagedPermissionsSettingMapping {
	readonly settingId: string;
	contribute(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions | undefined;
}

function managedPermissionsSetting<T>(
	settingId: string,
	sources: ManagedPermissionsSettingSources,
	transform: (value: T) => IAgentHostManagedSettingsPermissions | undefined,
): IManagedPermissionsSettingMapping {
	return {
		settingId,
		contribute: configurationService => {
			const configuration = inspectValue<T>(configurationService, settingId);
			if (configuration === undefined) {
				return undefined;
			}
			const [value, source] = configuration;
			if (sources === 'policyOnly' && source !== 'policyValue') {
				return undefined;
			}
			return transform(value);
		},
	};
}

/** Compatibility mappings for legacy settings only; new controls belong directly in the SDK. */
const managedPermissionsSettings: readonly IManagedPermissionsSettingMapping[] = [
	// Disabling the SDK's bypass mode takes "Allow All" away from the user for
	// good, so only an administrator may drive it.
	managedPermissionsSetting<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID, 'policyOnly', value => value === false ? { disableBypassPermissionsMode: 'disable' } : undefined),
	// Matches VS Code, where a user or application value already suppresses
	// terminal auto-approval outright.
	managedPermissionsSetting<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, 'anyGlobal', value => value === false ? { ask: [buildManagedFamilyRule(ManagedRuleFamily.Shell)] } : undefined),
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

/**
 * Combines every mapping's contribution into the single document sent to the
 * host.
 *
 * Rules are deduplicated because two settings can legitimately restrict the same
 * operation — an admin who disables terminal auto-approval *and* denies a
 * command should not produce that command twice, since each duplicate is parsed
 * and evaluated separately by the runtime.
 *
 * Note that contributing any rule at all makes the runtime's managed policy
 * "active", which causes unmatched shell, read, write, URL and factory requests
 * to require approval rather than falling through to the normal auto-approval
 * paths. That is broader than any individual mapping intends, but it errs toward
 * prompting, so it is accepted deliberately: the alternative — contributing an
 * `allow` list to narrow the effect — resolves to auto-approval and would make
 * sessions *less* restricted. See {@link IAgentHostManagedSettingsPermissions}.
 */
export function resolveManagedSettingsPermissions(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions {
	if (getGlobalConfigurationValue<boolean>(configurationService, AgentHostMapLegacySettingsToManagedSettingsSettingId) !== true) {
		return {};
	}

	const deny = new Set<string>();
	const ask = new Set<string>();
	let disableBypassPermissionsMode: 'disable' | undefined;
	for (const mapping of managedPermissionsSettings) {
		const contribution = mapping.contribute(configurationService);
		if (!contribution) {
			continue;
		}
		if (contribution.disableBypassPermissionsMode) {
			disableBypassPermissionsMode = contribution.disableBypassPermissionsMode;
		}
		contribution.deny?.forEach(rule => deny.add(rule));
		contribution.ask?.forEach(rule => ask.add(rule));
	}

	const permissions: IAgentHostManagedSettingsPermissions = {};
	if (disableBypassPermissionsMode) {
		permissions.disableBypassPermissionsMode = disableBypassPermissionsMode;
	}
	if (deny.size > 0) {
		permissions.deny = [...deny];
	}
	if (ask.size > 0) {
		permissions.ask = [...ask];
	}
	return permissions;
}
