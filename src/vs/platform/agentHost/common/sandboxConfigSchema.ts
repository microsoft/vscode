/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { AgentNetworkDomainSettingId } from '../../networkFilter/common/settings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../sandbox/common/settings.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';

/**
 * Well-known keys for sandbox settings stored on the agent host's root config
 * bag. These are intentionally a flat, prefix-free namespace owned by the
 * agent host — distinct from the workbench's `chat.agent.sandbox.*` setting
 * IDs. Hosts (today: the workbench client) translate from their setting IDs
 * to these keys when forwarding values via a `RootConfigChanged` action.
 */
export const enum AgentHostSandboxConfigKey {
	Enabled = 'enabled',
	AllowUnsandboxedCommands = 'allowUnsandboxedCommands',
	LinuxFileSystem = 'fileSystem.linux',
	MacFileSystem = 'fileSystem.mac',
	AdvancedRuntime = 'advanced.runtime',
	AllowedNetworkDomains = 'allowedNetworkDomains',
	DeniedNetworkDomains = 'deniedNetworkDomains',
}

/**
 * Schema for the subset of workbench sandbox settings that hosts (today: the
 * workbench client) may forward into the agent host's root config bag.
 *
 * The agent host's terminal sandbox engine reads these values through
 * {@link IAgentConfigurationService.getRootValue}. Only the modern,
 * normalized form of each setting is declared here — the workbench is
 * expected to:
 *
 *  - map the legacy boolean form of `chat.agent.sandbox.enabled` to the
 *    `'on' | 'off' | 'allowNetwork'` enum, and
 *  - migrate values from any deprecated setting IDs to their modern key
 *
 * before pushing a `RootConfigChanged` action. That keeps the agent-host
 * schema (and validation) free of backward-compat baggage.
 */
export const sandboxConfigSchema = createSchema({
	[AgentHostSandboxConfigKey.Enabled]: schemaProperty<AgentSandboxEnabledValue>({
		type: 'string',
		title: localize('agentHost.config.sandbox.enabled.title', "Agent Sandbox"),
		enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On, AgentSandboxEnabledValue.AllowNetwork],
	}),
	[AgentHostSandboxConfigKey.AllowUnsandboxedCommands]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.sandbox.allowUnsandboxedCommands.title', "Allow Unsandboxed Commands"),
	}),
	[AgentHostSandboxConfigKey.LinuxFileSystem]: schemaProperty<Record<string, unknown>>({
		type: 'object',
		title: localize('agentHost.config.sandbox.linuxFileSystem.title', "Linux Sandbox Filesystem"),
	}),
	[AgentHostSandboxConfigKey.MacFileSystem]: schemaProperty<Record<string, unknown>>({
		type: 'object',
		title: localize('agentHost.config.sandbox.macFileSystem.title', "macOS Sandbox Filesystem"),
	}),
	[AgentHostSandboxConfigKey.AdvancedRuntime]: schemaProperty<Record<string, unknown>>({
		type: 'object',
		title: localize('agentHost.config.sandbox.advancedRuntime.title', "Advanced Sandbox Runtime"),
	}),
	[AgentHostSandboxConfigKey.AllowedNetworkDomains]: schemaProperty<string[]>({
		type: 'array',
		title: localize('agentHost.config.network.allowedDomains.title', "Allowed Network Domains"),
		items: { type: 'string', title: localize('agentHost.config.network.allowedDomains.item.title', "Domain") },
	}),
	[AgentHostSandboxConfigKey.DeniedNetworkDomains]: schemaProperty<string[]>({
		type: 'array',
		title: localize('agentHost.config.network.deniedDomains.title', "Denied Network Domains"),
		items: { type: 'string', title: localize('agentHost.config.network.deniedDomains.item.title', "Domain") },
	}),
});

/**
 * Maps modern workbench sandbox setting IDs (the ones the engine asks about)
 * to the prefix-free keys stored on the agent host's root config bag.
 *
 * Deprecated setting IDs are intentionally absent: hosts forwarding values
 * into the agent host are expected to migrate deprecated → modern IDs
 * before dispatching `RootConfigChanged`.
 */
export const sandboxSettingIdToAgentHostKey: Readonly<Record<string, AgentHostSandboxConfigKey>> = {
	[AgentSandboxSettingId.AgentSandboxEnabled]: AgentHostSandboxConfigKey.Enabled,
	[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: AgentHostSandboxConfigKey.AllowUnsandboxedCommands,
	[AgentSandboxSettingId.AgentSandboxLinuxFileSystem]: AgentHostSandboxConfigKey.LinuxFileSystem,
	[AgentSandboxSettingId.AgentSandboxMacFileSystem]: AgentHostSandboxConfigKey.MacFileSystem,
	[AgentSandboxSettingId.AgentSandboxAdvancedRuntime]: AgentHostSandboxConfigKey.AdvancedRuntime,
	[AgentNetworkDomainSettingId.AllowedNetworkDomains]: AgentHostSandboxConfigKey.AllowedNetworkDomains,
	[AgentNetworkDomainSettingId.DeniedNetworkDomains]: AgentHostSandboxConfigKey.DeniedNetworkDomains,
};
