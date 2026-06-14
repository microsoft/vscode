/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IManagedSettingPolicyDefinition, IManagedSettingsPolicyDefinitions, ManagedSettingValue, ManagedSettingsData } from '../../../base/common/policy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { PolicyDefinition } from './policy.js';

export type { ManagedSettingsData } from '../../../base/common/policy.js';

/** Windows registry root for GitHub Copilot policies. */
export const GITHUB_COPILOT_WIN32_REGISTRY_PATH = 'SOFTWARE\\Policies\\GitHubCopilot';

/** Windows product name passed to the native policy watcher. */
export const GITHUB_COPILOT_WIN32_POLICY_NAME = 'GitHubCopilot';

/** macOS CFPreferences application ID for GitHub Copilot managed preferences. */
export const GITHUB_COPILOT_MACOS_BUNDLE_ID = 'com.github.copilot';

/** MDM key for the V0 managed setting. */
export const COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY = 'permissions.disableBypassPermissionsMode';

/** Managed-settings key for enterprise plugin enablement (carried as a JSON-encoded `{ [pluginId]: boolean }`). */
export const COPILOT_ENABLED_PLUGINS_KEY = 'enabledPlugins';

/** Managed-settings key for enterprise marketplaces (carried as a JSON-encoded `{ [name]: url-or-shorthand }`). */
export const COPILOT_EXTRA_MARKETPLACES_KEY = 'extraKnownMarketplaces';

/** Managed-settings key for the strict-marketplace flag (boolean). */
export const COPILOT_STRICT_MARKETPLACES_KEY = 'strictKnownMarketplaces';

export const ICopilotManagedSettingsService = createDecorator<ICopilotManagedSettingsService>('copilotManagedSettingsService');

export interface ICopilotManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData;
	readonly onDidChangeManagedSettings: Event<ManagedSettingsData>;
	updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<ManagedSettingsData>;
}

export class NullCopilotManagedSettingsService implements ICopilotManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData = {};
	readonly onDidChangeManagedSettings = Event.None;

	async updatePolicyDefinitions(): Promise<ManagedSettingsData> { return this.managedSettings; }
}

export function flattenManagedSettings(object: unknown): Record<string, string | number | boolean> {
	const result: Record<string, string | number | boolean> = {};
	flattenManagedSettingsValue(object, undefined, result);
	return result;
}

function flattenManagedSettingsValue(value: unknown, prefix: string | undefined, result: Record<string, string | number | boolean>): void {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		if (prefix !== undefined) {
			result[prefix] = value;
		}
		return;
	}

	if (!isManagedSettingsObject(value)) {
		return;
	}

	for (const key in value) {
		flattenManagedSettingsValue(value[key], prefix ? `${prefix}.${key}` : key, result);
	}
}

function isManagedSettingsObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Aggregate the `managedSettings` declarations of every policy definition into a single
 * key -> definition map. This is the single source of truth for which Copilot managed-settings
 * keys (and their value types) are honored, and it drives both delivery channels: the native
 * MDM watcher and the server `managed_settings` endpoint projection.
 */
export function collectManagedSettingsDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): IManagedSettingsPolicyDefinitions {
	const definitions: Record<string, IManagedSettingPolicyDefinition> = {};
	for (const policyName in policyDefinitions) {
		const policyManagedSettings = policyDefinitions[policyName].managedSettings;
		if (policyManagedSettings) {
			for (const key in policyManagedSettings) {
				definitions[key] = policyManagedSettings[key];
			}
		}
	}
	return definitions;
}

/**
 * Project a raw managed-settings bag onto the declared schema: keep only keys declared by a
 * policy definition whose runtime value matches the declared type. Undeclared keys and
 * type-mismatched values are dropped (with an optional warning). Values are validated, never
 * coerced, so a key declared as `string` keeps its string value untouched.
 *
 * This keeps the server endpoint and native MDM delivery aligned on the same
 * declaration-driven key set and value types.
 */
export function projectManagedSettings(values: ManagedSettingsData, definitions: IManagedSettingsPolicyDefinitions, onWarn?: (msg: string) => void): ManagedSettingsData {
	const projected: Record<string, ManagedSettingValue> = {};
	for (const key in definitions) {
		const value = values[key];
		if (value === undefined) {
			continue;
		}
		if (typeof value === definitions[key].type) {
			projected[key] = value;
		} else {
			onWarn?.(`Ignoring managed setting "${key}": expected ${definitions[key].type}, got ${typeof value}`);
		}
	}
	return projected;
}
