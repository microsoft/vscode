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
	AgentSandboxAllowUnsandboxedCommands = 'chat.agent.sandbox.allowUnsandboxedCommands',
	AgentSandboxRetryWithAllowNetworkRequests = 'chat.agent.sandbox.retryWithAllowNetworkRequests',
	AgentSandboxAutoApproveUnsandboxedCommands = 'chat.agent.sandbox.autoApproveUnsandboxedCommands',
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
