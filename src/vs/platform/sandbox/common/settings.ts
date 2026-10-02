/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';

export interface IAgentSandboxFileSystemSetting {
	allowRead?: string[];
	allowWrite?: string[];
	denyRead?: string[];
	denyWrite?: string[];
}

/** User-configured path permissions for the Copilot Agent Host sandbox. */
export interface IAgentSandboxUserConfiguredPaths {
	readwritePaths?: string[];
	readonlyPaths?: string[];
	deniedPaths?: string[];
}

/** Converts path separators for the sandbox's execution OS without resolving paths or patterns. */
export function normalizeSandboxFileSystemPath(path: string, os: OperatingSystem): string {
	return os === OperatingSystem.Windows ? path.replace(/\//g, '\\') : path;
}

/**
 * Setting IDs for agent sandboxing.
 */
export const enum AgentSandboxSettingId {
	AgentSandboxEnabled = 'chat.agent.sandbox.enabled',
	AgentSandboxAllowNetwork = 'chat.agent.sandbox.network.allowNetwork',
	AgentSandboxAllowLocalNetwork = 'chat.agent.sandbox.network.allowLocalNetwork',
	AgentSandboxAllowUnsandboxedCommands = 'chat.agent.sandbox.allowUnsandboxedCommands',
	AgentSandboxMcpServers = 'chat.agent.sandbox.mcpServers',
	AgentSandboxLspServers = 'chat.agent.sandbox.lspServers',
	AgentSandboxAllowDevToolAccess = 'chat.agent.sandbox.fileSystem.allowDevToolAccess',
	AgentSandboxUserConfiguredPaths = 'chat.agent.sandbox.fileSystem.userConfiguredPaths',
	AgentSandboxRetryWithAllowNetworkRequests = 'chat.agent.sandbox.retryWithAllowNetworkRequests',
	AgentSandboxAllowAutoApprove = 'chat.agent.sandbox.allowAutoApprove',
	AgentSandboxLinuxFileSystem = 'chat.agent.sandbox.fileSystem.linux',
	AgentSandboxMacFileSystem = 'chat.agent.sandbox.fileSystem.mac',
	AgentSandboxWindowsFileSystem = 'chat.agent.sandbox.fileSystem.windows',
	AgentSandboxWindowsSchemaVersion = 'chat.agent.sandbox.advanced.windows.schemaVersion',
	AgentSandboxAdvancedRuntime = 'chat.agent.sandbox.advanced.runtime',
}

export const enum AgentSandboxEnabledValue {
	Off = 'off',
	On = 'on',
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
