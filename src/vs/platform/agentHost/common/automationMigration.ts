/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY = 'vscode.automationMigration';
export const AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY = 'automationsEnabled';
export const AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY = 'automationRunTimeoutMinutes';
export const AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY = 'vscode.legacyAutomationImport';
export const AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY = 'vscode.legacyAutomationImportPending';
export const AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY = 'vscode.migrationCompleted';

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
