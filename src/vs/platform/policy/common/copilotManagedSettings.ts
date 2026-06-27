/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { IExtraKnownMarketplaceEntry, extraKnownMarketplacesToConfigDict } from '../../../base/common/managedSettings.js';
import { IManagedSettingPolicyDefinition, IManagedSettingsPolicyDefinitions, ManagedSettingValue, ManagedSettingsData } from '../../../base/common/policy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { isEmptyObject, isObject, isString } from '../../../base/common/types.js';
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

/** Managed-settings key for the default chat model (carried as a plain string: `auto`, a model family name, or a full model id). */
export const COPILOT_MODEL_KEY = 'model';

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

export const INativeManagedSettingsService = createDecorator<INativeManagedSettingsService>('nativeManagedSettingsService');

export interface INativeManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData;
	readonly onDidChangeManagedSettings: Event<ManagedSettingsData>;
	updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<ManagedSettingsData>;
}

export class NullNativeManagedSettingsService implements INativeManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData = {};
	readonly onDidChangeManagedSettings = Event.None;

	async updatePolicyDefinitions(): Promise<ManagedSettingsData> { return this.managedSettings; }
}

function flattenManagedSettings(object: unknown): Record<string, string | number | boolean> {
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
	| 'nativeMdm'
	/** File on a well-known disk path (`managed-settings.json`). */
	| 'file';

export interface IManagedSettingsSelection {
	/** Which channel won. */
	readonly source: ManagedSettingsSource;
	/** The winning bag, or `undefined` when {@link source} is `'none'`. */
	readonly values: ManagedSettingsData | undefined;
}

/**
 * Select the authoritative managed-settings bag from the available delivery channels.
 *
 * Precedence (highest first): server-delivered → native MDM → file on disk. The channels are
 * never merged — managed settings have a single authoritative source, so the first non-empty bag
 * wins outright. Centralizing the precedence here (rather than inlining it at each call site)
 * keeps policy evaluation ({@link AccountPolicyService.getPolicyData}) and the Policy Diagnostics
 * report from drifting apart, and gives one obvious place to extend when a new channel is
 * introduced.
 */
export function selectManagedSettings(server: ManagedSettingsData | undefined, nativeMdm: ManagedSettingsData | undefined, file: ManagedSettingsData | undefined): IManagedSettingsSelection {
	if (server && !isEmptyObject(server)) {
		return { source: 'server', values: server };
	}
	if (nativeMdm && !isEmptyObject(nativeMdm)) {
		return { source: 'nativeMdm', values: nativeMdm };
	}
	if (file && !isEmptyObject(file)) {
		return { source: 'file', values: file };
	}
	return { source: 'none', values: undefined };
}

// --- File-based managed settings ---

/** macOS well-known path for file-based managed settings. */
export const MANAGED_SETTINGS_MACOS_FILE_PATH = '/Library/Application Support/GitHubCopilot/managed-settings.json';

/** Linux well-known path for file-based managed settings. */
export const MANAGED_SETTINGS_LINUX_FILE_PATH = '/etc/github-copilot/managed-settings.json';

/** Windows directory name under %ProgramFiles% for file-based managed settings. */
export const MANAGED_SETTINGS_WINDOWS_DIR = 'GitHubCopilot';

/** Managed settings file name. */
export const MANAGED_SETTINGS_FILE_NAME = 'managed-settings.json';

/**
 * Descriptor for a structured (object/array) managed setting: one carried across every delivery
 * channel as a canonical JSON string under a single key. This table is the single place that
 * knows how to turn a managed-settings schema field into that canonical value, so adding a
 * structured key is one row here (plus the policy declaration that reads the bag key).
 *
 * `key` is both the source field name read from the parsed input and the canonical bag key the
 * JSON string is stored under — for structured settings these are identical by contract (a
 * structured key's bag name matches the schema field exactly; only scalar settings flatten to a
 * differently-shaped dot-path, and those don't go through this table).
 */
interface IStructuredManagedSetting {
	/** Source field name read from the parsed input, and the canonical bag key the JSON string is stored under. */
	readonly key: string;
	/**
	 * Normalize the raw value into the canonical pre-stringify shape an admin authors via native
	 * MDM. Return `undefined` to omit the key (absent or malformed value). Note an empty array (the
	 * `strictKnownMarketplaces` lockdown case) is returned as-is, not omitted.
	 */
	readonly encode: (value: unknown, onWarn?: (msg: string) => void) => unknown;
}

const STRUCTURED_MANAGED_SETTINGS: readonly IStructuredManagedSetting[] = [
	{
		key: COPILOT_ENABLED_PLUGINS_KEY,
		encode: value => isObject(value) ? value : undefined,
	},
	{
		key: COPILOT_STRICT_MARKETPLACES_KEY,
		encode: value => Array.isArray(value) ? value : undefined,
	},
	{
		key: COPILOT_EXTRA_MARKETPLACES_KEY,
		encode: (value, onWarn) => extraKnownMarketplacesToConfigDict(normalizeExtraKnownMarketplaces(value, onWarn)),
	},
];

/**
 * Normalize a parsed managed-settings object (from the server `managed_settings` API, a file on
 * disk, or any other source using the managed-settings schema) into the canonical
 * `ManagedSettingsData` bag that the policy framework consumes. This is the **single**
 * normalization path for all delivery channels, so downstream projection and policy `value()`
 * callbacks behave identically regardless of source. It does not enforce the declared
 * `managedSettings` schema — dropping undeclared or type-mismatched keys happens later, at
 * {@link projectManagedSettings}.
 *
 * - Scalar leaves (`permissions.*` and any forward-compatible scalar keys) are flattened into
 *   dot-separated keys.
 * - Structured settings (declared in {@link STRUCTURED_MANAGED_SETTINGS}) are carried as canonical
 *   JSON strings under a single key each — the same shape an admin authors via native MDM.
 *   `PolicyConfiguration` parses the JSON back into the object-typed setting on read.
 *   `extraKnownMarketplaces` is normalized from the schema's `{ [id]: { source } }` map to the
 *   `{ [name]: url-or-shorthand }` dict.
 *
 * Malformed marketplace entries are dropped (with an optional warning via {@link onWarn}) rather
 * than throwing, so a bad enterprise settings file degrades gracefully instead of blocking startup.
 */
export function normalizeManagedSettings(parsed: Record<string, unknown>, onWarn?: (msg: string) => void): ManagedSettingsData {
	// Spread + delete (not for..in + assignment) so the scalar remainder keeps exact `{ ...rest }`
	// semantics: it never triggers the inherited `__proto__` setter for a source-sent own
	// `__proto__` key, matching a destructuring rest.
	const scalarRest: Record<string, unknown> = { ...parsed };
	for (const setting of STRUCTURED_MANAGED_SETTINGS) {
		delete scalarRest[setting.key];
	}

	const result: Record<string, ManagedSettingValue> = { ...flattenManagedSettings(scalarRest) };

	for (const setting of STRUCTURED_MANAGED_SETTINGS) {
		const encoded = setting.encode(parsed[setting.key], onWarn);
		if (encoded !== undefined) {
			result[setting.key] = JSON.stringify(encoded);
		}
	}

	return result;
}

/**
 * Normalize the schema's `{ [id]: { source } }` marketplace map into an
 * {@link IExtraKnownMarketplaceEntry} array, preserving the marketplace `name`,
 * source discriminator, and any `ref`. Malformed or off-spec entries are dropped
 * (with an optional warning via {@link onWarn}).
 */
function normalizeExtraKnownMarketplaces(value: unknown, onWarn?: (msg: string) => void): IExtraKnownMarketplaceEntry[] | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const seen = new Set<string>();
	const entries: IExtraKnownMarketplaceEntry[] = [];
	for (const [name, entry] of Object.entries(value)) {
		if (!isObject(entry) || !isObject((entry as Record<string, unknown>).source)) {
			onWarn?.(`Skipping malformed extraKnownMarketplaces entry "${name}": expected { source: { source, repo|url } }`);
			continue;
		}
		const src = (entry as Record<string, unknown>).source as { source?: string; repo?: string; url?: string; ref?: string };
		let normalized: IExtraKnownMarketplaceEntry | undefined;
		if (src.source === 'github' && isString(src.repo)) {
			normalized = { name, source: { source: 'github', repo: src.repo, ...(src.ref ? { ref: src.ref } : {}) } };
		} else if (src.source === 'git' && isString(src.url)) {
			normalized = { name, source: { source: 'git', url: src.url, ...(src.ref ? { ref: src.ref } : {}) } };
		} else if (src.source === 'github' || src.source === 'git') {
			onWarn?.(`Skipping extraKnownMarketplaces entry "${name}": source "${src.source}" requires ${src.source === 'github' ? '"repo"' : '"url"'}`);
		} else {
			onWarn?.(`Skipping extraKnownMarketplaces entry "${name}": unknown source type "${src.source}"`);
		}
		if (normalized && !seen.has(name)) {
			seen.add(name);
			entries.push(normalized);
		}
	}
	return entries;
}

export const IFileManagedSettingsService = createDecorator<IFileManagedSettingsService>('fileManagedSettingsService');

export interface IFileManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData;
	readonly onDidChangeManagedSettings: Event<ManagedSettingsData>;
}

export class NullFileManagedSettingsService implements IFileManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData = {};
	readonly onDidChangeManagedSettings = Event.None;
}
