/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ManagedSettingsData, PolicyValue } from '../../../base/common/policy.js';

/** Windows registry root for GitHub Copilot policies. */
export const GITHUB_COPILOT_WIN32_REGISTRY_PATH = 'SOFTWARE\\Policies\\GitHubCopilot';

/** Windows product name passed to the native policy watcher. */
export const GITHUB_COPILOT_WIN32_POLICY_NAME = 'GitHubCopilot';

/** macOS CFPreferences application ID for GitHub Copilot managed preferences. */
export const GITHUB_COPILOT_MACOS_BUNDLE_ID = 'com.github.copilot';

/** MDM key for the V0 managed setting. */
export const COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY = 'permissions.disableBypassPermissionsMode';

/** Internal policy payload carrying raw Copilot managed-settings data from main to workbench. */
export const COPILOT_MANAGED_SETTINGS_POLICY_NAME = 'CopilotRawManagedSettings';

export function serializeManagedSettings(managedSettings: ManagedSettingsData): string {
	return JSON.stringify(managedSettings);
}

export function parseManagedSettingsPolicyValue(value: PolicyValue | undefined): ManagedSettingsData | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	try {
		const parsed = JSON.parse(value);
		return flattenManagedSettings(parsed);
	} catch {
		return undefined;
	}
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
