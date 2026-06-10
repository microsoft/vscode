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

// --- Policy key names -----------------------------------------------------------

/**
 * The managed-settings JSON schema for V0.
 * All keys are optional — an empty document or subset is valid.
 * This interface is extended as new managed setting keys are added.
 *
 * The same shape is used for file-based delivery (`managed-settings.json`)
 * and serves as the contract for the `managedSettingsValue` callback on
 * policy definitions.
 */
export interface IManagedSettingsData {
	readonly permissions?: {
		readonly disableBypassPermissionsMode?: string;
	};
	readonly enabledPlugins?: Readonly<Record<string, boolean>>;
	readonly extraKnownMarketplaces?: Readonly<Record<string, { source: string; repo: string }>>;
}
