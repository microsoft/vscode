/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { sandboxSettingIdToAgentHostKey } from '../../../../../platform/agentHost/common/sandboxConfigSchema.js';

/** Setting IDs that affect the engine's sandbox configuration (modern + deprecated). */
export const SANDBOX_SETTING_KEYS: readonly string[] = [
	AgentSandboxSettingId.AgentSandboxEnabled,
	AgentSandboxSettingId.AgentSandboxWindowsEnabled,
	AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
	AgentSandboxSettingId.AgentSandboxAutoApproveUnsandboxedCommands,
	AgentSandboxSettingId.AgentSandboxLinuxFileSystem,
	AgentSandboxSettingId.AgentSandboxMacFileSystem,
	AgentSandboxSettingId.AgentSandboxWindowsFileSystem,
	AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion,
	AgentSandboxSettingId.AgentSandboxAdvancedRuntime,
	AgentSandboxSettingId.DeprecatedAgentSandboxEnabled,
	AgentSandboxSettingId.DeprecatedAgentSandboxLinuxFileSystem,
	AgentSandboxSettingId.DeprecatedAgentSandboxMacFileSystem,
	AgentNetworkDomainSettingId.AllowedNetworkDomains,
	AgentNetworkDomainSettingId.DeniedNetworkDomains,
	AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains,
	AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains,
	AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains,
	AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains,
];

/**
 * Maps each modern sandbox setting ID to the ordered list of deprecated
 * setting IDs the workbench should fall back to when the modern key has not
 * been configured by the user. Consumers (engine adapter, agent-host
 * forwarder) only ever resolve values by modern key.
 */
const DEPRECATED_SANDBOX_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
	[AgentSandboxSettingId.AgentSandboxEnabled]: [AgentSandboxSettingId.DeprecatedAgentSandboxEnabled],
	[AgentSandboxSettingId.AgentSandboxLinuxFileSystem]: [AgentSandboxSettingId.DeprecatedAgentSandboxLinuxFileSystem],
	[AgentSandboxSettingId.AgentSandboxMacFileSystem]: [AgentSandboxSettingId.DeprecatedAgentSandboxMacFileSystem],
	[AgentNetworkDomainSettingId.AllowedNetworkDomains]: [AgentNetworkDomainSettingId.DeprecatedSandboxAllowedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldAllowedNetworkDomains],
	[AgentNetworkDomainSettingId.DeniedNetworkDomains]: [AgentNetworkDomainSettingId.DeprecatedSandboxDeniedNetworkDomains, AgentNetworkDomainSettingId.DeprecatedOldDeniedNetworkDomains],
};

/**
 * Reads a single sandbox-related setting from `IConfigurationService`,
 * preferring the modern key and falling back to its deprecated peers in
 * order. Boolean values for `chat.agent.sandbox.enabled` (legacy) are
 * normalized to the modern `'on' | 'off'` enum. Returns `undefined` when
 * no user value is configured.
 */
export function readSandboxSetting<T>(configurationService: IConfigurationService, logService: ILogService, settingId: string): T | undefined {
	const modern = configurationService.inspect<T>(settingId);
	if (modern.userValue !== undefined) {
		return normalizeSandboxSettingValue<T>(settingId, modern.value);
	}
	const deprecatedFallbacks = DEPRECATED_SANDBOX_FALLBACKS[settingId];
	if (deprecatedFallbacks?.length) {
		// Some deprecated keys are namespace parents of newer settings (e.g.
		// `chat.agent.sandbox` vs `chat.agent.sandbox.fileSystem.linux`).
		// `inspect()` may surface a populated namespace object even when the
		// exact deprecated key was not explicitly configured by the user, so
		// cross-check against the user-configured key list before honouring
		// a deprecated value.
		const userConfiguredKeys = configurationService.keys().user;
		for (const deprecatedId of deprecatedFallbacks) {
			const deprecated = configurationService.inspect<T>(deprecatedId);
			if (deprecated.userValue !== undefined && userConfiguredKeys.includes(deprecatedId)) {
				logService.warn(`SandboxSettingsReader: Using deprecated setting ${deprecatedId} because ${settingId} is not set. Please update your settings to use ${settingId} instead.`);
				return normalizeSandboxSettingValue<T>(settingId, deprecated.value);
			}
		}
	}
	return normalizeSandboxSettingValue<T>(settingId, modern.value);
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
 * Today the only non-trivial case is `chat.agent.sandbox.enabled`, which
 * historically accepted a boolean and now uses the `'on' | 'off' | 'allowNetwork'`
 * enum.
 */
function normalizeSandboxSettingValue<T>(settingId: string, value: T | undefined): T | undefined {
	if (settingId === AgentSandboxSettingId.AgentSandboxEnabled || settingId === AgentSandboxSettingId.DeprecatedAgentSandboxEnabled) {
		if (value === true) {
			return AgentSandboxEnabledValue.On as unknown as T;
		}
		if (value === false) {
			return AgentSandboxEnabledValue.Off as unknown as T;
		}
	}
	return value;
}
