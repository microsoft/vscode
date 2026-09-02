/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { migrateLegacyAutopilotConfig } from './agentHostSchema.js';
import { KNOWN_MODE_VALUES, SessionConfigKey } from './sessionConfigKeys.js';

export const AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY = 'vscode.automationMigration';
export const AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY = 'automationsEnabled';
export const AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY = 'automationRunTimeoutMinutes';
export const AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY = 'vscode.legacyAutomationImport';
export const AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY = 'vscode.legacyAutomationImportPending';
export const AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY = 'vscode.migrationCompleted';

const LEGACY_AUTOPILOT_PROVIDER = 'copilotcli';

export interface IAgentHostAutomationMigrationCompletion {
	readonly version: 1;
	readonly status: 'complete';
	readonly resources: readonly string[];
}

export function isAgentHostAutomationMigrationCompletion(value: unknown): value is IAgentHostAutomationMigrationCompletion {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (candidate['version'] !== 1 || candidate['status'] !== 'complete' || !Array.isArray(candidate['resources'])) {
		return false;
	}
	const resources = candidate['resources'];
	return resources.every(resource => typeof resource === 'string') && new Set(resources).size === resources.length;
}

/** Whether the provider used the legacy flattened Automation mode and permission fields. */
export function supportsLegacyAutomationSessionConfig(provider: string | undefined): boolean {
	return provider === undefined || provider === LEGACY_AUTOPILOT_PROVIDER;
}

/** Migrates the legacy combined Autopilot value into the Copilot Automation's current two-axis configuration. */
export function migrateLegacyAutomationSessionConfig(provider: string | undefined, config: undefined): undefined;
export function migrateLegacyAutomationSessionConfig(provider: string | undefined, config: Record<string, unknown>): Record<string, unknown>;
export function migrateLegacyAutomationSessionConfig(provider: string | undefined, config: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
export function migrateLegacyAutomationSessionConfig(provider: string | undefined, config: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!supportsLegacyAutomationSessionConfig(provider) || !config) {
		return config;
	}
	if (config[SessionConfigKey.AutoApprove] === 'assisted'
		&& typeof config[SessionConfigKey.Mode] === 'string'
		&& !KNOWN_MODE_VALUES.has(config[SessionConfigKey.Mode])) {
		return { ...config, [SessionConfigKey.Mode]: 'autopilot' };
	}
	if (config[SessionConfigKey.AutoApprove] !== 'autopilot') {
		return config;
	}
	const migrated = migrateLegacyAutopilotConfig(config);
	migrated[SessionConfigKey.AutoApprove] = 'assisted';
	return migrated;
}
