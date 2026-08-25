/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { ExtraKnownMarketplacesConfigDict, IExtraKnownMarketplaceEntry, extraKnownMarketplacesToConfigDict } from '../../../base/common/managedSettings.js';
import { IManagedSettingPolicyDefinition, IManagedSettingsPolicyDefinitions, ManagedSettingValue, ManagedSettingsData } from '../../../base/common/policy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { isEmptyObject, isObject, isString } from '../../../base/common/types.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { PolicyDefinition } from './policy.js';

export type { ManagedSettingsData } from '../../../base/common/policy.js';

export type RawManagedSettingsData = Readonly<Record<string, unknown>>;

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

/** Managed-settings key for the per-server MCP allowlist (carried as a JSON-encoded array of matcher entries; absent = no allow restriction, `[]` = only servers matching an entry, i.e. block all). */
export const COPILOT_ALLOWED_MCP_SERVERS_KEY = 'allowedMcpServers';

/** Managed-settings key for the per-server MCP denylist (carried as a JSON-encoded array of matcher entries; deny always takes precedence over allow). */
export const COPILOT_DENIED_MCP_SERVERS_KEY = 'deniedMcpServers';

/** Managed-settings key that blocks standalone user/workspace customizations. */
export const COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY = 'strictPluginOnlyCustomization';

/** Managed-settings key that makes the enterprise MCP allowlist authoritative. */
export const COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY = 'allowManagedMcpServersOnly';

/** Managed-settings key that allows hooks only from managed sources. */
export const COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY = 'allowManagedHooksOnly';

/** Managed-settings transport control that requires a fresh server fetch on startup. */
export const COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY = 'forceRemoteSettingsRefresh';

/**
 * Enterprise-mandated sandbox floor (`sandbox.enabled` in the runtime's managed-settings schema).
 * The runtime owns composing and enforcing this floor — it is `force-on-wins`, so a managed `true`
 * cannot be loosened by the user. VS Code only *reads* it to decide which chat harness to offer,
 * and deliberately declares no configuration policy for it: the control is runtime-owned, and
 * mirroring it as a VS Code policy would invert ownership.
 */
export const COPILOT_SANDBOX_ENABLED_KEY = 'sandbox.enabled';

/**
 * Managed-settings controls consumed by the delivery pipeline itself rather than by a
 * configuration policy. Native MDM must watch these even though no setting declares them.
 */
export const MANAGED_SETTINGS_CONTROL_DEFINITIONS: IManagedSettingsPolicyDefinitions = {
	[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: { type: 'boolean' },
	[COPILOT_SANDBOX_ENABLED_KEY]: { type: 'boolean' },
};

/** Policy-only configuration delivery slot for {@link COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY}. */
export const COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG = 'chat.customizations.strictPluginOnlyCustomization';

/** Policy-only configuration delivery slot for {@link COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY}. */
export const COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG = 'chat.mcp.allowManagedServersOnly';

/** Policy-only configuration delivery slot for {@link COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY}. */
export const COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG = 'chat.hooks.allowManagedOnly';

/**
 * Legacy managed-settings key for the default chat model, nested under `permissions` so it flattens
 * to `permissions.model`. Retained for original-schema deployments; superseded by the top-level
 * {@link COPILOT_TOP_LEVEL_MODEL_KEY}, which wins when both are present (see {@link managedModelValue}).
 */
export const COPILOT_MODEL_KEY = 'permissions.model';

/**
 * Canonical top-level managed-settings key for the default chat model (flattens to the bag key
 * `model`). Supersedes the legacy nested {@link COPILOT_MODEL_KEY} when both are present.
 */
export const COPILOT_TOP_LEVEL_MODEL_KEY = 'model';

/**
 * Enterprise OTel managed-settings keys. These are the scalar leaves of the canonical
 * `telemetry` block from the cross-client managed-settings schema (see the CLI
 * `ManagedTelemetrySettings`); they flatten to dot-path bag keys via
 * {@link normalizeManagedSettings}, so no {@link STRUCTURED_MANAGED_SETTINGS} entry is needed.
 * The `telemetry.resourceAttributes` and `telemetry.headers` map fields are structured
 * ({@link STRUCTURED_MANAGED_SETTINGS} rows carry them as JSON-encoded objects under their nested
 * keys); `telemetry.serviceName` is a scalar.
 */

/** Managed-settings key for enterprise OTel enablement. */
export const COPILOT_OTEL_ENABLED_KEY = 'telemetry.enabled';

/** Managed-settings key for the enterprise OTLP collector endpoint. */
export const COPILOT_OTEL_ENDPOINT_KEY = 'telemetry.endpoint';

/** Managed-settings key for the enterprise OTLP protocol (`http/json`, `http/protobuf`, or `grpc`). */
export const COPILOT_OTEL_PROTOCOL_KEY = 'telemetry.protocol';

/** Managed-settings key for enterprise OTel content capture. */
export const COPILOT_OTEL_CAPTURE_CONTENT_KEY = 'telemetry.captureContent';

/** Managed-settings key that prevents users from enabling OTel content capture themselves. */
export const COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY = 'telemetry.lockCaptureContent';

/** Managed-settings key for the OTel `service.name` resource attribute. */
export const COPILOT_OTEL_SERVICE_NAME_KEY = 'telemetry.serviceName';

/** Managed-settings key for additional OTel resource attributes (a `{ [k]: string }` map). */
export const COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY = 'telemetry.resourceAttributes';

/** Managed-settings key for extra OTLP exporter headers (a `{ [k]: string }` map). */
export const COPILOT_OTEL_HEADERS_KEY = 'telemetry.headers';

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

export type IForceRemoteSettingsRefreshResolution =
	| { readonly effective: true; readonly source: ManagedSettingsChannel }
	| { readonly effective: false };

/**
 * Resolve the fail-closed startup refresh control across every delivery channel, reusing
 * {@link pickManagedSettings} precedence rather than re-implementing it. A non-boolean value is
 * treated as absent, so a malformed high-precedence value cannot mask a well-formed lower one.
 */
export function resolveForceRemoteSettingsRefresh(nativeMdm: ManagedSettingsData | undefined, server: ManagedSettingsData | undefined, file: ManagedSettingsData | undefined): IForceRemoteSettingsRefreshResolution {
	const resolution = pickManagedSettings(nativeMdm, server, file).resolutions.get(COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY);
	const contribution = resolution?.contributions.find(candidate => typeof candidate.value === 'boolean');
	if (!contribution) {
		return { effective: false };
	}
	return contribution.value === true
		? { effective: true, source: contribution.channel }
		: { effective: false };
}

export const IManagedSettingsService = createDecorator<IManagedSettingsService>('managedSettingsService');

/** Read-only access to effective managed settings after channel resolution. */
export interface IManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeManagedSettings: Event<void>;
	getManagedSettingValue(key: string): ManagedSettingValue | undefined;
}

export class NullManagedSettingsService implements IManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeManagedSettings = Event.None;

	getManagedSettingValue(): ManagedSettingValue | undefined {
		return undefined;
	}
}

let managedModelValueCallback: ((policyData: IPolicyData) => ManagedSettingValue | undefined) | undefined;

/** Trim a managed-settings model value, treating a blank/whitespace-only string as unset. */
function normalizeModelValue(value: ManagedSettingValue | undefined): string | undefined {
	const trimmed = typeof value === 'string' ? value.trim() : undefined;
	return trimmed ? trimmed : undefined;
}

/**
 * `value` callback for the default-chat-model managed setting: resolves the top-level
 * {@link COPILOT_TOP_LEVEL_MODEL_KEY} first, falling back to the legacy nested {@link COPILOT_MODEL_KEY}
 * (each trimmed, blank treated as unset), so the top-level value wins when both are present. Memoized
 * so repeated calls return the same reference, matching the identity contract {@link managedSettingValue}
 * relies on for `isSamePolicyDefinition`.
 */
export function managedModelValue(): (policyData: IPolicyData) => ManagedSettingValue | undefined {
	if (!managedModelValueCallback) {
		managedModelValueCallback = policyData => {
			const topLevel = normalizeModelValue(policyData.managedSettings?.[COPILOT_TOP_LEVEL_MODEL_KEY]);
			return topLevel ?? normalizeModelValue(policyData.managedSettings?.[COPILOT_MODEL_KEY]);
		};
	}
	return managedModelValueCallback;
}

/**
 * `value` callback shared by the third-party agent harness policies (`Claude3PIntegration`,
 * `Codex3PIntegration`): forces the harness off when the account disables chat preview features,
 * or when the user is governed by managed settings at all.
 *
 * Managed settings are composed and enforced by the Copilot runtime and never reach the Claude or
 * Codex harnesses, so leaving them available would hand a governed user an ungoverned path around
 * every managed control the enterprise set.
 */
export function thirdPartyAgentEnabledValue(policyData: IPolicyData): boolean | undefined {
	return policyData.chat_preview_features_enabled === false || policyData.managedSettingsActive === true
		? false
		: undefined;
}

export const INativeManagedSettingsService = createDecorator<INativeManagedSettingsService>('nativeManagedSettingsService');

export interface INativeManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData;
	readonly onDidChangeManagedSettings: Event<ManagedSettingsData>;
	initialize(): Promise<ManagedSettingsData>;
	updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<ManagedSettingsData>;
}

export class NullNativeManagedSettingsService implements INativeManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly managedSettings: ManagedSettingsData = {};
	readonly onDidChangeManagedSettings = Event.None;

	async initialize(): Promise<ManagedSettingsData> { return this.managedSettings; }
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
 * key -> definition map. This is the single source of truth for policy-backed Copilot
 * managed-settings keys and drives both server projection and the declaration-driven portion of
 * the native MDM watcher. Transport controls are declared separately.
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
 * existence check (short-circuits) used to decide whether the declaration-driven portion of the
 * native MDM watcher needs updating, without aggregating the full
 * {@link collectManagedSettingsDefinitions} map.
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
 * A delivery channel that can provide managed settings. Managed settings can be delivered by more
 * than one channel, so this names the known sources to give policy evaluation and the Policy
 * Diagnostics report one shared vocabulary. Extend this union (and {@link MANAGED_SETTINGS_CHANNELS}
 * / {@link pickManagedSettings}) when adding a new channel.
 */
export type ManagedSettingsChannel =
	/** GitHub `/copilot_internal/managed_settings` endpoint (server-delivered). */
	| 'server'
	/** Native MDM: OS registry (Windows) / managed preferences (macOS) via `@vscode/policy-watcher`. */
	| 'nativeMdm'
	/** File on a well-known disk path (`managed-settings.json`). */
	| 'file';

/**
 * The source attributed to an effective managed setting (or to the overall report). A
 * {@link ManagedSettingsChannel} once a channel has won, or `'none'` when no channel contributes.
 */
export type ManagedSettingsSource = ManagedSettingsChannel | 'none';

/**
 * The delivery channels in fixed precedence order (highest first): native MDM → server-delivered →
 * file on disk. This single ordered list drives the per-key resolution in {@link pickManagedSettings}
 * and is the one place to extend when a new channel is introduced. Rationale for the order: the
 * server is harder to bypass than local MDM, and a local file is the most easily tampered with.
 */
export const MANAGED_SETTINGS_CHANNELS: readonly ManagedSettingsChannel[] = ['nativeMdm', 'server', 'file'];

/** A single channel's contribution to a managed-settings key, for provenance in the resolution. */
export interface IManagedSettingsContribution {
	/** The channel that supplied this value. */
	readonly channel: ManagedSettingsChannel;
	/** The value the channel supplied for the key. */
	readonly value: ManagedSettingValue;
}

/** How a single managed-settings key was resolved across the delivery channels. */
export interface IManagedSettingResolution {
	/** The effective (winning) value applied for the key. */
	readonly value: ManagedSettingValue;
	/** The channel whose value won (always the first {@link contributions} entry's channel). */
	readonly source: ManagedSettingsChannel;
	/** Every channel that supplied this key, in precedence order (winner first, overridden after). */
	readonly contributions: readonly IManagedSettingsContribution[];
}

/** The result of merging managed settings from every delivery channel on a per-key basis. */
export interface IManagedSettingsPick {
	/** The effective merged bag: the winning value for each key contributed by any channel. */
	readonly values: ManagedSettingsData;
	/** Per-key provenance: how each key resolved and which channels were overridden. */
	readonly resolutions: ReadonlyMap<string, IManagedSettingResolution>;
	/** The channels that supplied at least one *winning* key, in precedence order. */
	readonly activeSources: readonly ManagedSettingsChannel[];
}

/**
 * Merge the managed-settings bags from every delivery channel on a **per-key** basis.
 *
 * Precedence (highest first): native MDM → server-delivered → file on disk. Unlike a single
 * authoritative source, the channels *are* merged key-by-key: for each key the highest-precedence
 * channel that supplies it wins, but a key that the higher channels never set is still filled in by
 * a lower channel. A value an admin locks via native MDM therefore cannot be overwritten by the
 * server or a file, while keys those higher channels leave unset remain available to lower ones.
 *
 * The parameter order matches the precedence so call sites read top-to-bottom. Centralizing the
 * resolution here (rather than inlining it at each call site) keeps policy evaluation
 * ({@link AccountPolicyService.getPolicyData}) and the Policy Diagnostics report from drifting apart,
 * and gives one obvious place to extend when a new channel is introduced. Empty or absent channels
 * contribute nothing.
 */
export function pickManagedSettings(nativeMdm: ManagedSettingsData | undefined, server: ManagedSettingsData | undefined, file: ManagedSettingsData | undefined): IManagedSettingsPick {
	const bags: Record<ManagedSettingsChannel, ManagedSettingsData | undefined> = { nativeMdm, server, file };

	// Walk channels highest-precedence first: the first channel to supply a key wins, and later
	// channels are appended as overridden contributions for provenance.
	const resolutions = new Map<string, { value: ManagedSettingValue; source: ManagedSettingsChannel; contributions: IManagedSettingsContribution[] }>();
	for (const channel of MANAGED_SETTINGS_CHANNELS) {
		const bag = bags[channel];
		if (!bag) {
			continue;
		}
		// Iterate own keys only (managed-settings bags are untrusted input): avoids enumerating
		// inherited enumerable properties the way `for...in` would.
		for (const key of Object.keys(bag)) {
			const value = bag[key];
			if (value === undefined) {
				continue;
			}
			const existing = resolutions.get(key);
			if (existing) {
				existing.contributions.push({ channel, value });
			} else {
				resolutions.set(key, { value, source: channel, contributions: [{ channel, value }] });
			}
		}
	}

	const activeSources = new Set<ManagedSettingsChannel>();
	const entries: [string, ManagedSettingValue][] = [];
	for (const [key, resolution] of resolutions) {
		entries.push([key, resolution.value]);
		activeSources.add(resolution.source);
	}

	return {
		// Build via Object.fromEntries (define-property semantics) rather than bracket assignment so
		// an untrusted `__proto__` key can't corrupt the merged bag's prototype chain.
		values: Object.fromEntries(entries),
		resolutions,
		// Preserve precedence order for a stable, readable report.
		activeSources: MANAGED_SETTINGS_CHANNELS.filter(channel => activeSources.has(channel)),
	};
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

/**
 * Encode a managed-settings value into a canonical `{ [k]: string }` map: keeps string values
 * as-is and coerces number/boolean values to strings; drops keys with non-primitive values.
 * Returns `undefined` for a non-object input so the structured key is omitted.
 */
function encodeStringMap(value: unknown): Record<string, string> | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value)) {
		if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
			continue; // defend the shared normalizer against prototype pollution
		}
		if (isString(v)) {
			out[k] = v;
		} else if (typeof v === 'number' || typeof v === 'boolean') {
			out[k] = String(v);
		}
	}
	return out;
}

/** Pass an object value through unchanged; omit the key for any non-object value. */
function encodeObject(value: unknown): object | undefined {
	return isObject(value) ? value : undefined;
}

/** Pass an array value through unchanged (including an empty array); omit the key otherwise. */
function encodeArray(value: unknown): unknown[] | undefined {
	return Array.isArray(value) ? value : undefined;
}

/**
 * Encode the schema's `{ [id]: { source, autoUpdate? } }` marketplace map into the canonical
 * policy dict; drops malformed entries (with an optional warning) and omits
 * the key when there are none.
 */
function encodeExtraMarketplaces(value: unknown, onWarn?: (msg: string) => void): ExtraKnownMarketplacesConfigDict | undefined {
	return extraKnownMarketplacesToConfigDict(normalizeExtraKnownMarketplaces(value, onWarn));
}

const STRUCTURED_MANAGED_SETTINGS: readonly IStructuredManagedSetting[] = [
	{
		key: COPILOT_ENABLED_PLUGINS_KEY,
		encode: encodeObject,
	},
	{
		key: COPILOT_STRICT_MARKETPLACES_KEY,
		encode: encodeArray,
	},
	{
		key: COPILOT_ALLOWED_MCP_SERVERS_KEY,
		encode: encodeArray,
	},
	{
		key: COPILOT_DENIED_MCP_SERVERS_KEY,
		encode: encodeArray,
	},
	{
		key: COPILOT_EXTRA_MARKETPLACES_KEY,
		encode: encodeExtraMarketplaces,
	},
	{
		// Nested under `telemetry`; carried as a JSON-encoded `{ [k]: string }` map. Non-string
		// primitive values are coerced to strings; non-primitive values are dropped.
		key: COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY,
		encode: encodeStringMap,
	},
	{
		// Nested under `telemetry`; carried as a JSON-encoded `{ [k]: string }` map of OTLP headers.
		key: COPILOT_OTEL_HEADERS_KEY,
		encode: encodeStringMap,
	},
];

/**
 * Read a (possibly nested) dot-separated key from a parsed managed-settings object, e.g.
 * `telemetry.resourceAttributes`. Returns `undefined` if any path segment is missing or not an
 * object. Single-segment keys behave like a plain property read.
 */
function readNestedManagedKey(obj: Record<string, unknown>, dottedKey: string): unknown {
	let current: unknown = obj;
	for (const segment of dottedKey.split('.')) {
		if (!isObject(current)) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Return a copy of `obj` with the (possibly nested) dot-separated key removed, cloning only the
 * objects along the touched path so the original (and any shared sub-objects) stay untouched. The
 * spread-then-`delete` shape matches a destructuring rest: it copies own enumerable keys (including
 * an own `__proto__`) without triggering the inherited `__proto__` setter.
 */
function withNestedManagedKeyDeleted(obj: Record<string, unknown>, dottedKey: string): Record<string, unknown> {
	const dot = dottedKey.indexOf('.');
	if (dot === -1) {
		const clone = { ...obj };
		delete clone[dottedKey];
		return clone;
	}
	const head = dottedKey.slice(0, dot);
	const child = obj[head];
	if (!isObject(child)) {
		return obj;
	}
	return { ...obj, [head]: withNestedManagedKeyDeleted(child as Record<string, unknown>, dottedKey.slice(dot + 1)) };
}

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
 *   `extraKnownMarketplaces` is normalized from the schema's `{ [id]: { source, autoUpdate? } }`
 *   map to the policy-backed marketplace dict.
 *
 * Malformed marketplace entries are dropped (with an optional warning via {@link onWarn}) rather
 * than throwing, so a bad enterprise settings file degrades gracefully instead of blocking startup.
 */
export function normalizeManagedSettings(parsed: Record<string, unknown>, onWarn?: (msg: string) => void): ManagedSettingsData {
	// Spread + delete (not for..in + assignment) so the scalar remainder keeps exact `{ ...rest }`
	// semantics: it never triggers the inherited `__proto__` setter for a source-sent own
	// `__proto__` key, matching a destructuring rest. Structured keys may be nested (e.g.
	// `telemetry.resourceAttributes`), so removal clones only the touched path.
	let scalarRest: Record<string, unknown> = { ...parsed };
	for (const setting of STRUCTURED_MANAGED_SETTINGS) {
		scalarRest = withNestedManagedKeyDeleted(scalarRest, setting.key);
	}

	const result: Record<string, ManagedSettingValue> = { ...flattenManagedSettings(scalarRest) };

	for (const setting of STRUCTURED_MANAGED_SETTINGS) {
		const encoded = setting.encode(readNestedManagedKey(parsed, setting.key), onWarn);
		if (encoded !== undefined) {
			result[setting.key] = JSON.stringify(encoded);
		}
	}

	return result;
}

/**
 * Normalize the schema's `{ [id]: { source, autoUpdate? } }` marketplace map into an
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
		const rawEntry = entry as Record<string, unknown>;
		const src = rawEntry.source as { source?: string; repo?: string; url?: string; ref?: string };
		const autoUpdate = typeof rawEntry.autoUpdate === 'boolean' ? rawEntry.autoUpdate : undefined;
		if (rawEntry.autoUpdate !== undefined && autoUpdate === undefined) {
			onWarn?.(`Ignoring invalid autoUpdate for extraKnownMarketplaces entry "${name}": expected boolean`);
		}
		let normalized: IExtraKnownMarketplaceEntry | undefined;
		if (src.source === 'github' && isString(src.repo)) {
			normalized = { name, ...(autoUpdate === undefined ? {} : { autoUpdate }), source: { source: 'github', repo: src.repo, ...(src.ref ? { ref: src.ref } : {}) } };
		} else if (src.source === 'git' && isString(src.url)) {
			normalized = { name, ...(autoUpdate === undefined ? {} : { autoUpdate }), source: { source: 'git', url: src.url, ...(src.ref ? { ref: src.ref } : {}) } };
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
	readonly rawManagedSettings: RawManagedSettingsData;
	readonly managedSettings: ManagedSettingsData;
	readonly onDidChangeRawManagedSettings: Event<RawManagedSettingsData>;
	readonly onDidChangeManagedSettings: Event<ManagedSettingsData>;
	initialize(): Promise<ManagedSettingsData>;
}

export class NullFileManagedSettingsService implements IFileManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly rawManagedSettings: RawManagedSettingsData = {};
	readonly managedSettings: ManagedSettingsData = {};
	readonly onDidChangeRawManagedSettings = Event.None;
	readonly onDidChangeManagedSettings = Event.None;

	async initialize(): Promise<ManagedSettingsData> { return this.managedSettings; }
}
