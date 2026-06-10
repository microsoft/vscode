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
 * Flat policy key used in the `IPolicyService` key-value store.
 * This is the same key as the existing `ChatToolsAutoApprove` policy
 * on `chat.tools.global.autoApprove`. The managed-settings schema
 * `permissions.disableBypassPermissionsMode: "disable"` maps to
 * `ChatToolsAutoApprove: false`.
 */
export const COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY = 'ChatToolsAutoApprove';
