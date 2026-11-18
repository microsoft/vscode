/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepClone, equals } from '../../../../base/common/objects.js';
import { IWorkbenchLocalMcpServer } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IWorkbenchMcpServer, McpServerInstallState } from '../../mcp/common/mcpTypes.js';
import { IAgentPlugin } from './plugins/agentPluginService.js';

export type ConnectorUpgradeSource = {
	readonly kind: 'mcpServer';
	readonly server: IWorkbenchMcpServer;
	readonly local: IWorkbenchLocalMcpServer;
};

export interface IConnectorUpgradeResult {
	readonly removalErrors: readonly { readonly source: ConnectorUpgradeSource; readonly error: unknown }[];
	readonly preservedSources: readonly ConnectorUpgradeSource[];
}

export function getConnectorMcpServerNames(
	connectorName: string,
	connectorDisplayName: string,
	configuredNames: readonly string[] = [],
): readonly string[] {
	const names = new Map<string, string>();
	for (const name of [...configuredNames, connectorName, connectorDisplayName]) {
		const normalizedName = name.toLowerCase();
		if (!names.has(normalizedName)) {
			names.set(normalizedName, name);
		}
	}
	return [...names.values()];
}

export function findConnectorUpgradeTarget<T extends { readonly name: string; readonly displayName: string }>(
	connectors: readonly T[],
	connectorName: string,
	connectorDisplayName: string,
): T | undefined {
	return connectors.find(connector => connector.name === connectorName)
		?? connectors.find(connector => connector.displayName === connectorDisplayName);
}

export function getMatchingInstalledMcpServers(
	servers: readonly IWorkbenchMcpServer[],
	mcpServerNames: readonly string[],
): readonly IWorkbenchMcpServer[] {
	const normalizedNames = new Set(mcpServerNames.map(name => name.toLowerCase()));
	return servers.filter(server => server.local && server.installState === McpServerInstallState.Installed && normalizedNames.has(server.name.toLowerCase()));
}

export function getMatchingInstalledMcpPlugins(
	plugins: readonly IAgentPlugin[],
	mcpServerNames: readonly string[],
): readonly IAgentPlugin[] {
	const normalizedNames = new Set(mcpServerNames.map(name => name.toLowerCase()));
	return plugins.filter(plugin =>
		plugin.mcpServerDefinitions.get().some(definition => normalizedNames.has(definition.name.toLowerCase()))
	);
}

export function createConnectorUpgradeSource(server: IWorkbenchMcpServer): ConnectorUpgradeSource {
	if (!server.local) {
		throw new Error(`Expected MCP server '${server.name}' to have a local installation`);
	}
	return {
		kind: 'mcpServer',
		server,
		local: {
			...server.local,
			config: deepClone(server.local.config),
		},
	};
}

export function getCurrentConnectorUpgradeServer(
	source: ConnectorUpgradeSource,
	servers: readonly IWorkbenchMcpServer[],
): IWorkbenchMcpServer | undefined {
	const current = servers.find(server =>
		server.local?.id === source.local.id
		&& server.local.scope === source.local.scope
		&& server.local.mcpResource.toString() === source.local.mcpResource.toString()
	);
	return current?.local
		&& current.name === source.server.name
		&& current.local.name === source.local.name
		&& current.local.format === source.local.format
		&& equals(current.local.config, source.local.config)
		? current
		: undefined;
}

export async function upgradeMcpSourcesToConnector(
	installConnector: () => Promise<void>,
	sources: readonly ConnectorUpgradeSource[],
	removeSource: (source: ConnectorUpgradeSource) => Promise<boolean>,
): Promise<IConnectorUpgradeResult> {
	await installConnector();

	const removalErrors: { source: ConnectorUpgradeSource; error: unknown }[] = [];
	const preservedSources: ConnectorUpgradeSource[] = [];
	for (const source of sources) {
		try {
			if (!await removeSource(source)) {
				preservedSources.push(source);
			}
		} catch (error) {
			removalErrors.push({ source, error });
		}
	}

	return { removalErrors, preservedSources };
}
