/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { CustomizationType, type Customization, type PluginCustomization } from './state/protocol/state.js';
import { customizationId } from './state/sessionState.js';

/**
 * Well-known root-config keys used by the platform to configure agent-host
 * customizations.
 */
export const enum AgentHostConfigKey {
	/** Host-owned Open Plugins available to remote sessions. */
	Customizations = 'customizations',
	/**
	 * Absolute path to the shell executable for host-managed terminals.
	 * TODO: revisit magic key in config; refine into a dedicated typed channel. https://github.com/microsoft/vscode/issues/313812
	 */
	DefaultShell = 'defaultShell',
	/**
	 * When true (the default), the Claude provider routes all Anthropic
	 * `messages` traffic through the local Copilot-CAPI proxy (Copilot-routed
	 * Claude). When false, the Claude Agent SDK talks to Anthropic directly on
	 * the user's own credentials (BYO Anthropic — Phase 19).
	 */
	ClaudeUseCopilotProxy = 'claudeUseCopilotProxy',
	/** Controls whether session-scoped file customizations come from local scan or SDK discovery. */
	SessionCustomizationDiscoveryMode = 'sessionCustomizationDiscoveryMode',
	/**
	 * Optional GitHub Enterprise base URI (e.g. `https://ghe.example.com` for a
	 * GitHub Enterprise Server, or `https://tenant.ghe.com` for GitHub Enterprise
	 * Cloud). When set, the agent host computes its GitHub protected resources and
	 * REST/GraphQL endpoints from this base instead of github.com. Normally pushed
	 * by the local VS Code client from the workbench `github-enterprise.uri`
	 * setting; remote operators set it directly in the remote
	 * `agent-host-config.json`.
	 */
	GithubEnterpriseUri = 'githubEnterpriseUri',
}

export const SESSION_CUSTOMIZATION_DISCOVERY_MODES = ['scan', 'discover'] as const;
export type SessionCustomizationDiscoveryMode = typeof SESSION_CUSTOMIZATION_DISCOVERY_MODES[number];
export const DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE: SessionCustomizationDiscoveryMode = 'scan';

/**
 * Persisted on-disk shape for a host-configured plugin. Kept stable across
 * the customization protocol refactor so existing `agent-host-config.json`
 * files keep working; entries are mapped to the new
 * {@link Customization} shape at read time by
 * {@link getAgentHostConfiguredCustomizations}.
 */
interface IPersistedCustomizationConfigEntry {
	uri: string;
	displayName: string;
	description?: string;
}

export const agentHostCustomizationConfigSchema = createSchema({
	[AgentHostConfigKey.Customizations]: schemaProperty<IPersistedCustomizationConfigEntry[]>({
		type: 'array',
		title: localize('agentHost.config.customizations.title', "Plugins"),
		description: localize('agentHost.config.customizations.description', "Plugins configured on this agent host and available to remote sessions."),
		default: [],
		items: {
			type: 'object',
			title: localize('agentHost.config.customizations.itemTitle', "Plugin"),
			properties: {
				uri: {
					type: 'string',
					title: localize('agentHost.config.customizations.uri', "Plugin URI"),
				},
				displayName: {
					type: 'string',
					title: localize('agentHost.config.customizations.displayName', "Name"),
				},
				description: {
					type: 'string',
					title: localize('agentHost.config.customizations.descriptionField', "Description"),
				},
			},
			required: ['uri', 'displayName'],
		},
	}),
	[AgentHostConfigKey.DefaultShell]: schemaProperty<string>({
		type: 'string',
		title: localize('agentHost.config.defaultShell.title', "Default Shell"),
		description: localize('agentHost.config.defaultShell.description', "Absolute path to the shell executable used by host-managed terminals. Normally pushed by the connected VS Code client from `terminal.integrated.agentHostProfile.<os>` (falling back to `terminal.integrated.defaultProfile.<os>`); when unset, the agent host falls back to the system shell. Only the path is supported; `args` and `env` from the workbench profile are not piped through yet. The workbench only pushes this for the local agent host — remote agent host operators should set this directly in the remote machine's `agent-host-config.json`."),
	}),
	[AgentHostConfigKey.ClaudeUseCopilotProxy]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.claudeUseCopilotProxy.title', "Route Claude Through Copilot"),
		description: localize('agentHost.config.claudeUseCopilotProxy.description', "When enabled (the default), the Claude agent routes all requests through GitHub Copilot. When disabled, Claude talks to Anthropic directly using your own credentials (API key or Claude subscription)."),
		default: true,
	}),
	[AgentHostConfigKey.SessionCustomizationDiscoveryMode]: schemaProperty<SessionCustomizationDiscoveryMode>({
		type: 'string',
		enum: [...SESSION_CUSTOMIZATION_DISCOVERY_MODES],
		title: localize('agentHost.config.sessionCustomizationDiscoveryMode.title', "Session Customization Discovery Mode"),
		description: localize('agentHost.config.sessionCustomizationDiscoveryMode.description', "Controls whether session-scoped customizations are populated from local file scanning or from Copilot SDK discovery."),
		default: DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE,
	}),
	[AgentHostConfigKey.GithubEnterpriseUri]: schemaProperty<string>({
		type: 'string',
		title: localize('agentHost.config.githubEnterpriseUri.title', "GitHub Enterprise URI"),
		description: localize('agentHost.config.githubEnterpriseUri.description', "Optional base URI of a GitHub Enterprise instance (for example \"https://ghe.example.com\" for GitHub Enterprise Server, or \"https://tenant.ghe.com\" for GitHub Enterprise Cloud). When set, the agent host authenticates and makes GitHub API calls against this instance instead of github.com. Normally pushed by the connected VS Code client from the `github-enterprise.uri` setting; remote agent host operators can set it directly in the remote `agent-host-config.json`."),
	}),
});

export const defaultAgentHostCustomizationConfigValues = {
	[AgentHostConfigKey.Customizations]: [] as IPersistedCustomizationConfigEntry[],
};

/**
 * Reads the persisted (legacy-shaped) plugin entries from the agent-host
 * root config and lifts them into the new {@link Customization} container
 * shape used by the rest of the platform.
 */
export function getAgentHostConfiguredCustomizations(values: Record<string, unknown> | undefined): readonly Customization[] {
	const raw = values?.[AgentHostConfigKey.Customizations];
	const entries = agentHostCustomizationConfigSchema.validate(AgentHostConfigKey.Customizations, raw)
		? raw
		: defaultAgentHostCustomizationConfigValues[AgentHostConfigKey.Customizations];
	return entries.map(toContainerCustomization);
}

/**
 * Lifts a persisted plugin config entry into the new
 * {@link Customization} container shape.
 */
export function toContainerCustomization(entry: IPersistedCustomizationConfigEntry): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: customizationId(entry.uri),
		uri: entry.uri,
		name: entry.displayName,
		enabled: true,
	};
}
