/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setting IDs for agent sandboxing.
 */
export const enum AgentSandboxSettingId {
	AgentSandboxEnabled = 'chat.agent.sandbox.enabled',
	AgentSandboxWindowsEnabled = 'chat.agent.sandbox.enabledWindows',
	AgentSandboxAllowNetwork = 'chat.agent.sandbox.allowNetwork',
	AgentSandboxAllowUnsandboxedCommands = 'chat.agent.sandbox.allowUnsandboxedCommands',
	AgentSandboxRetryWithAllowNetworkRequests = 'chat.agent.sandbox.retryWithAllowNetworkRequests',
	AgentSandboxAllowAutoApprove = 'chat.agent.sandbox.allowAutoApprove',
	AgentSandboxLinuxFileSystem = 'chat.agent.sandbox.fileSystem.linux',
	AgentSandboxMacFileSystem = 'chat.agent.sandbox.fileSystem.mac',
	AgentSandboxWindowsFileSystem = 'chat.agent.sandbox.fileSystem.windows',
	AgentSandboxWindowsSchemaVersion = 'chat.agent.sandbox.advanced.windows.schemaVersion',
	AgentSandboxAdvancedRuntime = 'chat.agent.sandbox.advanced.runtime',
	DeprecatedAgentSandboxEnabled = 'chat.agent.sandbox',
	DeprecatedAgentSandboxLinuxFileSystem = 'chat.agent.sandboxFileSystem.linux',
	DeprecatedAgentSandboxMacFileSystem = 'chat.agent.sandboxFileSystem.mac',
}

export const enum AgentSandboxEnabledValue {
	Off = 'off',
	On = 'on',
	AllowNetwork = 'allowNetwork',
}

export type AgentSandboxEnabledSettingValue = AgentSandboxEnabledValue | boolean;

export function normalizeAgentSandboxEnabledValue(value: AgentSandboxEnabledSettingValue): AgentSandboxEnabledValue {
	if (value === true) {
		return AgentSandboxEnabledValue.On;
	}
	if (value === false) {
		return AgentSandboxEnabledValue.Off;
	}
	return value;
}

export function isAgentSandboxEnabledValue(value: AgentSandboxEnabledSettingValue | undefined): boolean {
	return value !== undefined && normalizeAgentSandboxEnabledValue(value) !== AgentSandboxEnabledValue.Off;
}
