/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { IManagedSettingPolicyDefinition, IManagedSettingsPolicyDefinitions, ManagedSettingValue, ManagedSettingsData } from '../../../base/common/policy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { isEmptyObject } from '../../../base/common/types.js';
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

/** Managed-settings key for the strict-marketplace allowlist (carried as a JSON-encoded array of source entries; absent = no restrictions, `[]` = lockdown). */
export const COPILOT_STRICT_MARKETPLACES_KEY = 'strictKnownMarketplaces';

const managedSettingValueCallbacks = new Map<string, (policyData: IPolicyData) => ManagedSettingValue | undefined>();

/**
 * Standard pass-through `value` callback for a managed-settings-driven policy: locks the setting
 * to the managed value when the enterprise has set it, and returns `undefined` otherwise so the
 * user's own setting falls through. Use for the common case; policies that combine the managed
 * value with other conditions (e.g. `chat_preview_features_enabled`) keep a custom callback.
 *
 * The callback is memoized per key, so repeated calls for the same key return the SAME function
 * reference. That reference identity is what lets `isSamePolicyDefinition` skip needless
 * re-registration, and memoizing makes the guarantee hold regardless of where the helper is called.
 */
export function managedSettingValue(key: string): (policyData: IPolicyData) => ManagedSettingValue | undefined {
	let callback = managedSettingValueCallbacks.get(key);
	if (!callback) {
		callback = policyData => policyData.managedSettings?.[key];
		managedSettingValueCallbacks.set(key, callback);
	}
	return callback;
}

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
 * Whether any policy in `policyDefinitions` declares at least one managed-settings key. Cheap
 * existence check (short-circuits) used to decide whether the native MDM watcher is needed at all,
 * without aggregating the full {@link collectManagedSettingsDefinitions} map.
 */
export function hasManagedSettingsDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): boolean {
	for (const policyName in policyDefinitions) {
		const policyManagedSettings = policyDefinitions[policyName].managedSettings;
		if (policyManagedSettings && !isEmptyObject(policyManagedSettings)) {
			return true;
		}
	}
	return false;
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

/**
 * The delivery channel that provided the active managed-settings bag. Managed settings can be
 * delivered by more than one channel, so this names the known sources to give policy evaluation
 * and the Policy Diagnostics report one shared vocabulary. Extend this union (and
 * {@link selectManagedSettings}) when adding a new channel.
 */
export type ManagedSettingsSource =
	/** No channel currently provides managed settings. */
	| 'none'
	/** GitHub `/copilot_internal/managed_settings` endpoint (server-delivered). */
	| 'server'
	/** Native MDM: OS registry (Windows) / managed preferences (macOS) via `@vscode/policy-watcher`. */
	| 'nativeMdm';

export interface IManagedSettingsSelection {
	/** Which channel won. */
	readonly source: ManagedSettingsSource;
	/** The winning bag, or `undefined` when {@link source} is `'none'`. */
	readonly values: ManagedSettingsData | undefined;
}

/**
 * Select the authoritative managed-settings bag from the available delivery channels.
 *
 * Server-delivered settings win over native MDM and the two are never merged — managed settings
 * have a single authoritative source. Centralizing the precedence here (rather than inlining it at
 * each call site) keeps policy evaluation ({@link AccountPolicyService.getPolicyData}) and the
 * Policy Diagnostics report from drifting apart, and gives one obvious place to extend when a new
 * channel is introduced.
 */
export function selectManagedSettings(server: ManagedSettingsData | undefined, nativeMdm: ManagedSettingsData | undefined): IManagedSettingsSelection {
	if (server && !isEmptyObject(server)) {
		return { source: 'server', values: server };
	}
	if (nativeMdm && !isEmptyObject(nativeMdm)) {
		return { source: 'nativeMdm', values: nativeMdm };
	}
	return { source: 'none', values: undefined };
}
