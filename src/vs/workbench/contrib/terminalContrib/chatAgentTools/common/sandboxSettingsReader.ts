/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { sandboxSettingIdToAgentHostKey } from '../../../../../platform/agentHost/common/sandboxConfigSchema.js';

/** Setting IDs that affect the engine's sandbox configuration. */
export const SANDBOX_SETTING_KEYS: readonly string[] = [
	AgentSandboxSettingId.AgentSandboxEnabled,
	AgentSandboxSettingId.AgentSandboxWindowsEnabled,
	AgentSandboxSettingId.AgentSandboxAllowNetwork,
	AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
	AgentSandboxSettingId.AgentSandboxLinuxFileSystem,
	AgentSandboxSettingId.AgentSandboxMacFileSystem,
	AgentSandboxSettingId.AgentSandboxWindowsFileSystem,
	AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion,
	AgentSandboxSettingId.AgentSandboxAdvancedRuntime,
	AgentNetworkDomainSettingId.AllowedNetworkDomains,
	AgentNetworkDomainSettingId.DeniedNetworkDomains,
];

/**
 * Reads a single sandbox-related setting from `IConfigurationService`.
 * Legacy boolean sandbox enabled values are normalized to the agent-host
 * `'on' | 'off'` enum.
 */
export function readSandboxSetting<T>(configurationService: IConfigurationService, _logService: ILogService, settingId: string): T | undefined {
	return normalizeSandboxSettingValue<T>(settingId, configurationService.inspect<T>(settingId).value);
}

/**
 * Reads the currently-configured sandbox values for forwarding to an agent
 * host. The returned record is keyed by the prefix-free agent-host sandbox
 * sub-keys ({@link AgentHostSandboxKey}); keys without a user value are
 * omitted entirely. Callers should nest this under the agent host's
 * top-level `sandbox` config key when dispatching a `RootConfigChanged`.
 */
export function readAgentHostSandboxValues(configurationService: IConfigurationService, logService: ILogService): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const [settingId, sandboxKey] of Object.entries(sandboxSettingIdToAgentHostKey)) {
		const value = readSandboxSetting<unknown>(configurationService, logService, settingId);
		if (value !== undefined) {
			values[sandboxKey] = value;
		}
	}
	return values;
}

/**
 * Coerce values into the canonical shape the agent-host schema expects.
 * Today the non-trivial cases are the boolean sandbox enabled settings,
 * which are forwarded as the `'on' | 'off' | 'allowNetwork'` enum for
 * agent-host compatibility.
 */
function normalizeSandboxSettingValue<T>(settingId: string, value: T | undefined): T | undefined {
	if (settingId === AgentSandboxSettingId.AgentSandboxEnabled || settingId === AgentSandboxSettingId.AgentSandboxWindowsEnabled) {
		if (value === true) {
			return 'on' as unknown as T;
		}
		if (value === false) {
			return 'off' as unknown as T;
		}
	}
	return value;
}
