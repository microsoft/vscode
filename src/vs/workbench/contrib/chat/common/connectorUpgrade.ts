/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchMcpServer, McpServerInstallState } from '../../mcp/common/mcpTypes.js';
import { IAgentPlugin } from './plugins/agentPluginService.js';

export type ConnectorUpgradeSource = { readonly kind: 'mcpServer'; readonly server: IWorkbenchMcpServer };

export interface IConnectorUpgradeResult {
	readonly removalErrors: readonly { readonly source: ConnectorUpgradeSource; readonly error: unknown }[];
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

export async function upgradeMcpSourcesToConnector(
	installConnector: () => Promise<void>,
	sources: readonly ConnectorUpgradeSource[],
	removeSource: (source: ConnectorUpgradeSource) => Promise<void>,
): Promise<IConnectorUpgradeResult> {
	await installConnector();

	const removalErrors: { source: ConnectorUpgradeSource; error: unknown }[] = [];
	for (const source of sources) {
		try {
			await removeSource(source);
		} catch (error) {
			removalErrors.push({ source, error });
		}
	}

	return { removalErrors };
}
