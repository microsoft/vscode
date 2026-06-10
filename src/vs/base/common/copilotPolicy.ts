/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Platform-specific identifiers and paths for the shared GitHubCopilot
 * managed-settings policy namespace.  These are committed once and must
 * never change — migrating keys silently drops policy enforcement
 * (see ADR: MDM and File-Based Delivery for Managed Settings).
 */

// --- MDM identifiers -----------------------------------------------------------

/** Windows: registry root for GitHubCopilot policies (no `Microsoft\` prefix). */
export const GITHUB_COPILOT_WIN32_REGISTRY_PATH = 'SOFTWARE\\Policies\\GitHubCopilot';

/** Windows: product name passed to `@vscode/policy-watcher`. */
export const GITHUB_COPILOT_WIN32_POLICY_NAME = 'GitHubCopilot';

/** macOS: CFPreferences application ID for managed preferences. */
export const GITHUB_COPILOT_MACOS_BUNDLE_ID = 'com.github.copilot';

// --- File-based paths -----------------------------------------------------------

/** Linux: system-wide managed-settings JSON file. */
export const GITHUB_COPILOT_LINUX_POLICY_FILE = '/etc/github-copilot/managed-settings.json';

/** macOS: file-based managed-settings (for orgs without Jamf/Intune). */
export const GITHUB_COPILOT_MACOS_POLICY_FILE = '/Library/Application Support/GitHubCopilot/managed-settings.json';

// --- Managed-settings schema ---------------------------------------------------

/**
 * The managed-settings JSON schema for V0.
 * All keys are optional — an empty document or subset is valid.
 * This interface is extended as new managed setting keys are added.
 *
 * The same shape is used for file-based delivery (`managed-settings.json`)
 * and serves as the contract for the `value` callback on
 * policy definitions.
 */
export interface IManagedSettingsData {
	readonly permissions?: {
		readonly disableBypassPermissionsMode?: string;
	};
	readonly enabledPlugins?: Readonly<Record<string, boolean>>;
	readonly extraKnownMarketplaces?: Readonly<Record<string, { source: string; repo: string }>>;
}

/**
 * Flat dot-separated key names for the managed-settings schema, used to
 * register with the MDM native policy watcher (plist / registry).
 *
 * Each key maps to a leaf property in {@link IManagedSettingsData}.
 * **Keep in sync** — when adding a leaf property to `IManagedSettingsData`,
 * add the corresponding flat key here.
 *
 * Complex object leaves (like `enabledPlugins`) are registered as `string`
 * and expected to be JSON-encoded in the plist/registry value.
 */
export const MANAGED_SETTINGS_SCHEMA_KEYS: Record<string, { type: 'string' | 'number' | 'boolean' }> = {
	'permissions.disableBypassPermissionsMode': { type: 'string' },
};

/**
 * Internal policy name used by the managed-settings services (MDM and file-based)
 * to carry the raw {@link IManagedSettingsData} as a JSON-encoded string through
 * the existing policy IPC channel to the renderer process.
 *
 * `AccountPolicyService` reads this value, parses it, and passes the resulting
 * `IManagedSettingsData` to each policy definition's `value({ managedSettings })`
 * callback.  This avoids the need for a separate IPC channel while keeping the
 * managed-settings evaluation co-located with other policy callbacks in workbench
 * contributions.
 */
export const MANAGED_SETTINGS_RAW_POLICY_NAME = '__managedSettingsRawData';

/**
 * Converts flat dot-separated key-value pairs (from the MDM native watcher)
 * back into the nested {@link IManagedSettingsData} structure.
 */
export function unflattenManagedSettings(flat: ReadonlyMap<string, string | number | boolean>): IManagedSettingsData {
	const result: Record<string, unknown> = {};
	for (const [path, value] of flat) {
		const parts = path.split('.');
		let current: Record<string, unknown> = result;
		for (let i = 0; i < parts.length - 1; i++) {
			current[parts[i]] ??= {};
			current = current[parts[i]] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
	}
	return result as IManagedSettingsData;
}
