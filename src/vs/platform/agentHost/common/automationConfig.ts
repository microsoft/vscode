/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, migrateLegacyAutopilotConfig, schemaProperty } from './agentHostSchema.js';
import { KNOWN_MODE_VALUES, SessionConfigKey } from './sessionConfigKeys.js';

export const AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY = 'automationsEnabled';
export const AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY = 'automationRunTimeoutMinutes';
export const DEFAULT_AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES = 30;

export const automationRootConfigSchema = createSchema({
	[AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.automationsEnabled', "Automations"),
		description: localize('agentHost.automationsEnabled.description', "Whether this Agent Host may run automations."),
		default: false,
	}),
	[AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY]: schemaProperty<number>({
		type: 'number',
		title: localize('agentHost.automationRunTimeout', "Automation Run Timeout"),
		description: localize('agentHost.automationRunTimeout.description', "Maximum duration of an automation run, in minutes."),
		default: DEFAULT_AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES,
	}),
});

const LEGACY_AUTOPILOT_PROVIDER = 'copilotcli';

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
	return migrateCombinedAutopilotConfig(config);
}

function migrateCombinedAutopilotConfig(config: Record<string, unknown>): Record<string, unknown> {
	if (config[SessionConfigKey.AutoApprove] !== 'autopilot') {
		return config;
	}
	const migrated = migrateLegacyAutopilotConfig(config);
	migrated[SessionConfigKey.AutoApprove] = 'assisted';
	return migrated;
}

/** Applies the legacy flattened Automation values to provider configuration. */
export function applyLegacyAutomationSessionConfig(provider: string | undefined, config: Readonly<Record<string, unknown>> | undefined, mode: string | undefined, permissionLevel: string | undefined): Record<string, unknown> {
	const result = { ...config };
	if (!supportsLegacyAutomationSessionConfig(provider)) {
		if (permissionLevel === undefined || permissionLevel === 'default') {
			delete result[SessionConfigKey.AutoApprove];
		}
		return result;
	}
	if (mode === undefined) {
		delete result[SessionConfigKey.Mode];
	} else if (KNOWN_MODE_VALUES.has(mode)) {
		result[SessionConfigKey.Mode] = mode;
	}
	if (permissionLevel === undefined) {
		delete result[SessionConfigKey.AutoApprove];
	} else {
		result[SessionConfigKey.AutoApprove] = permissionLevel;
	}
	return migrateCombinedAutopilotConfig(result);
}
