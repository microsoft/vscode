/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { AgentNetworkDomainSettingId } from '../../networkFilter/common/settings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId, type IAgentSandboxMaskedCredentials, type IAgentSandboxFileSystemSetting, type IAgentSandboxUserConfiguredPaths } from '../../sandbox/common/settings.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import type { SessionConfigPropertySchema } from './state/protocol/commands.js';

/**
 * Top-level keys the agent host's root config bag exposes for sandboxing.
 * All sandbox-related values live nested under {@link AgentHostSandboxConfigKey.Sandbox}
 * — the persisted JSON has a single `"sandbox": { ... }` object rather than a
 * dozen flat keys. The profile assigned to the host is a separate key.
 */
export const enum AgentHostSandboxConfigKey {
	Sandbox = 'sandbox',
	SandboxProfile = 'sandboxProfile',
}

/**
 * Well-known sub-keys inside the agent host's `sandbox` object. These are
 * intentionally a flat, prefix-free namespace owned by the agent host —
 * distinct from the workbench's `chat.agent.sandbox.*` setting IDs. Hosts
 * (today: the workbench client) translate from their setting IDs to these
 * keys when forwarding values via a `RootConfigChanged` action.
 */
export const enum AgentHostSandboxKey {
	Enabled = 'enabled',
	AllowNetwork = 'allowNetwork',
	AllowLocalNetwork = 'allowLocalNetwork',
	AllowUnsandboxedCommands = 'allowUnsandboxedCommands',
	SandboxMcpServers = 'sandboxMcpServers',
	SandboxLspServers = 'sandboxLspServers',
	AuthenticateGit = 'authenticateGit',
	AuthenticateGh = 'authenticateGh',
	MaskedCredentials = 'credentials',
	AllowDevToolAccess = 'allowDevToolAccess',
	AddCurrentWorkingDirectory = 'addCurrentWorkingDirectory',
	UserConfiguredPaths = 'fileSystem.userConfiguredPaths',
	LinuxFileSystem = 'fileSystem.linux',
	MacFileSystem = 'fileSystem.mac',
	WindowsFileSystem = 'fileSystem.windows',
	AdvancedRuntime = 'advanced.runtime',
	AllowedNetworkDomains = 'allowedNetworkDomains',
	DeniedNetworkDomains = 'deniedNetworkDomains',
}

/** Shape of the persisted/forwarded `sandbox` object. */
export type ISandboxConfigValue = Partial<{
	[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue;
	[AgentHostSandboxKey.AllowNetwork]: boolean;
	[AgentHostSandboxKey.AllowLocalNetwork]: boolean;
	[AgentHostSandboxKey.AllowUnsandboxedCommands]: boolean;
	[AgentHostSandboxKey.SandboxMcpServers]: boolean;
	[AgentHostSandboxKey.SandboxLspServers]: boolean;
	[AgentHostSandboxKey.AuthenticateGit]: boolean;
	[AgentHostSandboxKey.AuthenticateGh]: boolean;
	[AgentHostSandboxKey.MaskedCredentials]: IAgentSandboxMaskedCredentials;
	[AgentHostSandboxKey.AllowDevToolAccess]: boolean;
	[AgentHostSandboxKey.AddCurrentWorkingDirectory]: boolean;
	[AgentHostSandboxKey.UserConfiguredPaths]: IAgentSandboxUserConfiguredPaths;
	[AgentHostSandboxKey.LinuxFileSystem]: IAgentSandboxFileSystemSetting;
	[AgentHostSandboxKey.MacFileSystem]: IAgentSandboxFileSystemSetting;
	[AgentHostSandboxKey.WindowsFileSystem]: IAgentSandboxFileSystemSetting;
	[AgentHostSandboxKey.AdvancedRuntime]: Record<string, unknown>;
	[AgentHostSandboxKey.AllowedNetworkDomains]: string[];
	[AgentHostSandboxKey.DeniedNetworkDomains]: string[];
}>;

/** A copy of a client's sandbox profile, assigned to an agent host. */
export interface ISandboxProfileAssignment {
	readonly id: string;
	readonly name: string;
	readonly sandbox: ISandboxConfigValue;
}

/** Protocol schema of one set of sandbox values, shared by the root values and each profile. */
const sandboxValueSchema: SessionConfigPropertySchema = {
	type: 'object',
	title: localize('agentHost.config.sandbox.title', "Agent Sandbox"),
	properties: {
		[AgentHostSandboxKey.Enabled]: {
			type: 'string',
			title: localize('agentHost.config.sandbox.enabled.title', "Sandbox Enabled"),
			enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
		},
		[AgentHostSandboxKey.AllowNetwork]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.allowNetwork.title', "Allow Network"),
		},
		[AgentHostSandboxKey.AllowLocalNetwork]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.allowLocalNetwork.title', "Allow Local Network"),
		},
		[AgentHostSandboxKey.AllowUnsandboxedCommands]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.allowUnsandboxedCommands.title', "Allow Unsandboxed Commands"),
		},
		[AgentHostSandboxKey.SandboxMcpServers]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.sandboxMcpServers.title', "Sandbox MCP Servers"),
		},
		[AgentHostSandboxKey.SandboxLspServers]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.sandboxLspServers.title', "Sandbox LSP Servers"),
		},
		[AgentHostSandboxKey.AuthenticateGit]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.authenticateGit.title', "Authenticate git"),
		},
		[AgentHostSandboxKey.AuthenticateGh]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.authenticateGh.title', "Authenticate gh"),
		},
		[AgentHostSandboxKey.MaskedCredentials]: {
			type: 'object',
			title: localize('agentHost.config.sandbox.maskedEnvironmentVariables.title', "Masked environment variables"),
			properties: {
				envVars: {
					type: 'object',
					title: localize('agentHost.config.sandbox.credentials.envVars.title', "Environment Variables"),
					description: localize('agentHost.config.sandbox.credentials.envVars.description', "Maps environment variable names to objects with an injectHosts array of HTTPS destinations. Destination patterns are validated by the runtime."),
					additionalProperties: {
						type: 'object',
						title: localize('agentHost.config.sandbox.credentials.envVars.entry.title', "Environment Variable"),
						properties: {
							injectHosts: {
								type: 'array',
								title: localize('agentHost.config.sandbox.credentials.injectHosts.title', "Injection Hosts"),
								items: { type: 'string', title: localize('agentHost.config.sandbox.credentials.injectHosts.item.title', "Host") },
							},
						},
						required: ['injectHosts'],
					},
				},
			},
		},
		[AgentHostSandboxKey.AllowDevToolAccess]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.allowDevToolAccess.title', "Allow Dev Tool Access"),
		},
		[AgentHostSandboxKey.AddCurrentWorkingDirectory]: {
			type: 'boolean',
			title: localize('agentHost.config.sandbox.addCurrentWorkingDirectory.title', "Add Current Working Directory"),
		},
		[AgentHostSandboxKey.LinuxFileSystem]: {
			type: 'object',
			title: localize('agentHost.config.sandbox.linuxFileSystem.title', "Linux Sandbox Filesystem"),
		},
		[AgentHostSandboxKey.UserConfiguredPaths]: {
			type: 'object',
			title: localize('agentHost.config.sandbox.userConfiguredPaths.title', "User-Configured Paths"),
			properties: {
				readwritePaths: {
					type: 'array',
					title: localize('agentHost.config.sandbox.readwritePaths.title', "Read/Write"),
					items: { type: 'string', title: localize('agentHost.config.sandbox.path.title', "Path") },
				},
				readonlyPaths: {
					type: 'array',
					title: localize('agentHost.config.sandbox.readonlyPaths.title', "Read-Only"),
					items: { type: 'string', title: localize('agentHost.config.sandbox.path.title', "Path") },
				},
				deniedPaths: {
					type: 'array',
					title: localize('agentHost.config.sandbox.deniedPaths.title', "Denied"),
					items: { type: 'string', title: localize('agentHost.config.sandbox.path.title', "Path") },
				},
			},
		},
		[AgentHostSandboxKey.MacFileSystem]: {
			type: 'object',
			title: localize('agentHost.config.sandbox.macFileSystem.title', "macOS Sandbox Filesystem"),
		},
		[AgentHostSandboxKey.WindowsFileSystem]: {
			type: 'object',
			title: localize('agentHost.config.sandbox.windowsFileSystem.title', "Windows Sandbox Filesystem"),
		},
		[AgentHostSandboxKey.AdvancedRuntime]: {
			type: 'object',
			title: localize('agentHost.config.sandbox.advancedRuntime.title', "Advanced Sandbox Runtime"),
		},
		[AgentHostSandboxKey.AllowedNetworkDomains]: {
			type: 'array',
			title: localize('agentHost.config.sandbox.allowedDomains.title', "Allowed Network Domains"),
			items: { type: 'string', title: localize('agentHost.config.sandbox.allowedDomains.item.title', "Domain") },
		},
		[AgentHostSandboxKey.DeniedNetworkDomains]: {
			type: 'array',
			title: localize('agentHost.config.sandbox.deniedDomains.title', "Denied Network Domains"),
			items: { type: 'string', title: localize('agentHost.config.sandbox.deniedDomains.item.title', "Domain") },
		},
	},
};

/**
 * Schema for the sandbox values hosts (today: the workbench client) may store
 * in the agent host's root config bag, plus the sandbox profile assigned to the host.
 *
 * The workbench normalizes boolean enablement before forwarding. Legacy per-OS
 * filesystem keys serve the terminal engine; Copilot uses only UserConfiguredPaths.
 *
 * The assigned profile is a copy of a client's profile, so every client
 * connected to the host sees it and new sessions use it; the last write wins.
 * See {@link resolveRootSandboxConfig}.
 */
export const sandboxConfigSchema = createSchema({
	[AgentHostSandboxConfigKey.Sandbox]: schemaProperty<ISandboxConfigValue>(sandboxValueSchema),
	// No property is required: `{}` is how a client clears the assignment, because root config changes cannot remove keys.
	[AgentHostSandboxConfigKey.SandboxProfile]: schemaProperty<Partial<ISandboxProfileAssignment>>({
		type: 'object',
		title: localize('agentHost.config.sandboxProfile.title', "Sandbox Profile"),
		properties: {
			id: { type: 'string', title: localize('agentHost.config.sandboxProfile.id.title', "ID") },
			name: { type: 'string', title: localize('agentHost.config.sandboxProfile.name.title', "Name") },
			sandbox: sandboxValueSchema,
		},
	}),
});

/** Returns the assignment when it is complete; `{}` and partial values mean no profile. */
export function getSandboxProfileAssignment(value: Partial<ISandboxProfileAssignment> | undefined): ISandboxProfileAssignment | undefined {
	return value?.id && typeof value.name === 'string' && value.sandbox ? { id: value.id, name: value.name, sandbox: value.sandbox } : undefined;
}

/**
 * Returns the host's default sandbox values for new sessions: the
 * {@link AgentHostSandboxConfigKey.Sandbox} values with the assigned profile's
 * values on top. Keys the profile omits keep the sandbox values. Session
 * overrides and managed policy apply later.
 */
export function resolveRootSandboxConfig(sandbox: ISandboxConfigValue | undefined, assignment: Partial<ISandboxProfileAssignment> | undefined): ISandboxConfigValue | undefined {
	const profile = getSandboxProfileAssignment(assignment);
	return profile ? { ...sandbox, ...profile.sandbox } : sandbox;
}
/**
 * Maps modern workbench sandbox setting IDs (the ones the engine asks about)
 * to the sub-keys inside the agent host's `sandbox` config object.
 *
 * Legacy per-OS filesystem settings remain mapped for the terminal engine,
 * but are not a fallback for Copilot's user-configured paths.
 */
export const sandboxSettingIdToAgentHostKey: Readonly<Record<string, AgentHostSandboxKey>> = {
	[AgentSandboxSettingId.AgentSandboxEnabled]: AgentHostSandboxKey.Enabled,
	[AgentSandboxSettingId.AgentSandboxAllowNetwork]: AgentHostSandboxKey.AllowNetwork,
	[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork]: AgentHostSandboxKey.AllowLocalNetwork,
	[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: AgentHostSandboxKey.AllowUnsandboxedCommands,
	[AgentSandboxSettingId.AgentSandboxMcpServers]: AgentHostSandboxKey.SandboxMcpServers,
	[AgentSandboxSettingId.AgentSandboxLspServers]: AgentHostSandboxKey.SandboxLspServers,
	[AgentSandboxSettingId.AgentSandboxAuthenticateGit]: AgentHostSandboxKey.AuthenticateGit,
	[AgentSandboxSettingId.AgentSandboxAuthenticateGh]: AgentHostSandboxKey.AuthenticateGh,
	[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess]: AgentHostSandboxKey.AllowDevToolAccess,
	[AgentSandboxSettingId.AgentSandboxUserConfiguredPaths]: AgentHostSandboxKey.UserConfiguredPaths,
	[AgentSandboxSettingId.AgentSandboxLinuxFileSystem]: AgentHostSandboxKey.LinuxFileSystem,
	[AgentSandboxSettingId.AgentSandboxMacFileSystem]: AgentHostSandboxKey.MacFileSystem,
	[AgentSandboxSettingId.AgentSandboxAdvancedRuntime]: AgentHostSandboxKey.AdvancedRuntime,
	[AgentNetworkDomainSettingId.AllowedNetworkDomains]: AgentHostSandboxKey.AllowedNetworkDomains,
	[AgentNetworkDomainSettingId.DeniedNetworkDomains]: AgentHostSandboxKey.DeniedNetworkDomains,
};
