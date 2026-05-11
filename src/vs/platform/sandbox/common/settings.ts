/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setting IDs for agent sandboxing.
 */
export const enum AgentSandboxSettingId {
	AgentSandboxEnabled = 'chat.agent.sandbox.enabled',
	AgentSandboxAllowUnsandboxedCommands = 'chat.agent.sandbox.allowUnsandboxedCommands',
	AgentSandboxAutoApproveUnsandboxedCommands = 'chat.agent.sandbox.autoApproveUnsandboxedCommands',
	AgentSandboxAllowAutoApprove = 'chat.agent.sandbox.allowAutoApprove',
	DeprecatedAgentSandboxEnabled = 'chat.agent.sandbox',
}

export const enum AgentSandboxEnabledValue {
	Off = 'off',
	On = 'on',
	AllowNetwork = 'allowNetwork',
}
