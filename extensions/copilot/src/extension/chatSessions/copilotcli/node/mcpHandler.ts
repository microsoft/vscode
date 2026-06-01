/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session, SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import type { CancellationToken } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IMcpService } from '../../../../platform/mcp/common/mcpService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Disposable, DisposableStore, IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { hasKey } from '../../../../util/vs/base/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import type { LanguageModelToolInformation } from '../../../../vscodeTypes';
import { GitHubMcpDefinitionProvider } from '../../../githubMcp/common/githubMcpDefinitionProvider';

const toolInvalidCharRe = /[^a-z0-9_-]/gi;

/** The user-facing display label of an MCP server (from VS Code settings). */
export type MCPDisplayName = string;
/** The short server name as used in agent definition files (the prefix of `fullReferenceName`). */
export type MCPServerName = string;

/**
 * A mapping from friendly MCP server names (as defined in custom agent files)
 * to VS Code MCP server display labels.
 */
export type McpServerMappings = Map<MCPServerName, MCPDisplayName>;

export type MCPServerConfig = NonNullable<Session['mcpServers']>[string];

export interface ICopilotCLIMCPHandler {
	readonly _serviceBrand: undefined;
	loadMcpConfig(sessionUri: URI): Promise<{ mcpConfig: Record<string, MCPServerConfig> | undefined; disposable: IDisposable }>;
}

export const ICopilotCLIMCPHandler = createServiceIdentifier<ICopilotCLIMCPHandler>('ICopilotCLIMCPHandler');

export class CopilotCLIMCPHandler implements ICopilotCLIMCPHandler {
	declare _serviceBrand: undefined;
	constructor(
		@ILogService private readonly logService: ILogService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMcpService private readonly mcpService: IMcpService,
	) { }

	public async loadMcpConfig(sessionUri: URI): Promise<{ mcpConfig: Record<string, MCPServerConfig> | undefined; disposable: IDisposable }> {

		// TODO: Sessions window settings override is not honored with extension
		//       configuration API, so this needs to be a core setting
		const isSessionsWindow = this.configurationService.getNonExtensionConfig<boolean>('chat.experimentalSessionsWindowOverride') ?? false;

		// Sessions window: use the gateway approach which proxies all MCP servers from core
		if (isSessionsWindow) {
			return this.loadMcpConfigWithGateway(sessionUri);
		}

		// Standard path: use the CLIMCPServerEnabled setting
		const enabled = this.configurationService.getConfig(ConfigKey.Advanced.CLIMCPServerEnabled);

		if (enabled) {
			return this.loadMcpConfigWithGateway(sessionUri);
		}

		const processedConfig: Record<string, MCPServerConfig> = {};
		await this.addBuiltInGitHubServer(processedConfig);
		return {
			mcpConfig: Object.keys(processedConfig).length > 0 ? processedConfig : undefined,
			disposable: Disposable.None
		};
	}

	/**
	 * Use the Gateway to handle all connections
	 */
	private async loadMcpConfigWithGateway(sessionUri: URI): Promise<{ mcpConfig: Record<string, MCPServerConfig> | undefined; disposable: IDisposable }> {
		const mcpConfig: Record<string, MCPServerConfig> = {};
		const disposable = new DisposableStore();
		try {
			const gateway = await this.mcpService.startMcpGateway(sessionUri);
			if (gateway) {
				disposable.add(gateway);
				for (const server of gateway.servers) {
					const serverId = this.normalizeServerName(server.label) ?? `vscode-mcp-server-${Object.keys(mcpConfig).length}`;
					mcpConfig[serverId] = {
						type: 'http',
						url: server.address.toString(),
						tools: ['*'],
						displayName: server.label,
					};
				}
			} else {
				this.logService.warn('[CopilotCLIMCPHandler]   gateway failed to start');
				disposable.dispose();
			}
		} catch (error) {
			this.logService.warn(`[CopilotCLIMCPHandler]   gateway error: ${error}`);
		}

		if (Object.keys(mcpConfig).length === 0) {
			disposable.dispose();
			return {
				mcpConfig: undefined,
				disposable: Disposable.None
			};
		} else {
			return {
				mcpConfig,
				disposable
			};
		}
	}

	private normalizeServerName(originalName: string): string | undefined {
		// Convert to lowercase and replace invalid characters with underscore
		let normalized = originalName.toLowerCase().replace(toolInvalidCharRe, '_');

		// Trim leading and trailing underscores
		normalized = normalized.replace(/^_+|_+$/g, '');

		// Return undefined if normalization results in empty string
		if (!normalized) {
			this.logService.error(`[CopilotCLIMCPHandler] Failed to normalize server name '${originalName}' - result is empty`);
			return undefined;
		}

		if (normalized !== originalName) {
			this.logService.trace(`[CopilotCLIMCPHandler] Normalized server '${originalName}' to '${normalized}'`);
		}

		return normalized;
	}

	private async addBuiltInGitHubServer(config: Record<string, MCPServerConfig>): Promise<void> {
		try {
			const githubId = this.normalizeServerName('gitHub');
			if (!githubId) {
				return;
			}

			// Override only if no GitHub MCP server is already configured
			if (config[githubId] && config[githubId].type === 'http') {
				// We have headers, do not override
				if (Object.keys(config[githubId].headers || {}).length > 0) {
					return;
				}
			}

			const definitionProvider = new GitHubMcpDefinitionProvider(
				this.configurationService,
				this.authenticationService,
				this.logService
			);

			const definitions = definitionProvider.provideMcpServerDefinitions();
			if (!definitions || definitions.length === 0) {
				this.logService.trace('[CopilotCLIMCPHandler] No GitHub MCP server definitions available.');
				return;
			}

			// Use the first definition
			const definition = definitions[0];

			// Resolve the definition to get the access token
			const resolvedDefinition = await definitionProvider.resolveMcpServerDefinition(definition, {} as CancellationToken);

			config[githubId] = {
				type: 'http',
				url: resolvedDefinition.uri.toString(),
				isDefaultServer: true,
				headers: resolvedDefinition.headers,
				tools: ['*'],
				displayName: 'GitHub',
			};
			this.logService.trace('[CopilotCLIMCPHandler] Added built-in GitHub MCP server.');
		} catch (error) {
			this.logService.warn(`[CopilotCLIMCPHandler] Failed to add built-in GitHub MCP server: ${error}`);
		}
	}
}

/**
 * Builds a mapping from friendly MCP server names (as defined in custom agent files)
 * to VS Code MCP server labels.
 *
 * Iterates through tools that have an MCP source (detected via structural typing using
 * {@link hasKey}) and a `fullReferenceName` in the format `<server name>/<tool name>`,
 * extracting the server name portion as the key and the source's `label` as the value.
 */
export function buildMcpServerMappings(tools: ReadonlyMap<LanguageModelToolInformation, boolean>): McpServerMappings {
	const mappings = new Map<string, string>();
	for (const [tool] of tools) {
		if (!tool.source || !hasKey(tool.source, { name: true }) || !tool.fullReferenceName) {
			continue;
		}
		const slashIndex = tool.fullReferenceName.lastIndexOf('/');
		if (slashIndex > 0) {
			const serverName = tool.fullReferenceName.substring(0, slashIndex);
			if (serverName && !mappings.has(serverName) && tool.source.label) {
				mappings.set(serverName, tool.source.label);
			}
		}
	}
	return mappings;
}

/**
 * Remaps tool references in custom agents from friendly MCP server names to gateway names.
 *
 * Agent definition files reference tools as `<friendly server name>/<tool name>`, but the SDK
 * expects `<gateway name>/<tool name>` where gateway names are the Record keys in the MCP
 * server config.
 *
 * @param customAgents The list of custom agents whose tools will be remapped in place.
 * @param mcpServerMappings Maps friendly server names (from agent files) → VS Code MCP display labels.
 * @param mcpServers The MCP server config, keyed by gateway name.
 * @param selectedAgent Optional selected agent to also remap.
 */
export function remapCustomAgentTools(
	customAgents: SweCustomAgent[],
	mcpServerMappings: McpServerMappings,
	mcpServers: SessionOptions['mcpServers'],
	selectedAgent: SweCustomAgent | undefined,
): void {
	if (!mcpServerMappings.size || !mcpServers) {
		return;
	}
	// Build a map from display name → gateway name (the Record key in mcpServers).
	const displayNameToGatewayName = new Map<string, string>();
	for (const [gatewayName, config] of Object.entries(mcpServers)) {
		if (config.displayName) {
			displayNameToGatewayName.set(config.displayName, gatewayName);
		}
	}

	const agentsToRemap = selectedAgent ? [...customAgents, selectedAgent] : customAgents;
	for (const agent of agentsToRemap) {
		if (!agent.tools?.length) {
			continue;
		}
		for (let i = 0; i < agent.tools.length; i++) {
			const tool = agent.tools[i];
			const slashIndex = tool.lastIndexOf('/'); // Tool names cannot contain '/', so the last slash separates server from tool
			if (slashIndex < 1) {
				continue;
			}
			const serverName = tool.substring(0, slashIndex);
			const toolName = tool.substring(slashIndex + 1);
			if (!serverName || !toolName) {
				continue;
			}
			// First try: map through mcpServerMappings (friendly name → display name) then to gateway name.
			const displayName = mcpServerMappings.get(serverName);
			// Also try to look up the server name directly as a display name in the gateway map.
			const gatewayName = displayName ? displayNameToGatewayName.get(displayName) : displayNameToGatewayName.get(serverName);

			if (gatewayName) {
				agent.tools[i] = `${gatewayName}/${toolName}`;
			}
		}
	}
}
