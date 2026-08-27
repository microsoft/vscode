/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../../base/common/hash.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpDiscoveryFormat, McpDiscoveryScope, McpDiscoverySource } from '../../../../../platform/mcp/common/mcpDiscoveryMetadata.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import {
	IAgentPlugin,
	IAgentPluginMcpServerDefinition,
	IAgentPluginService
} from '../../../chat/common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../../chat/common/enablement.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX, McpCollectionProvenance, McpCollectionSortOrder, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust } from '../mcpTypes.js';
import { IMcpConfigurationOutcome, IMcpDiscovery, IMcpDiscoveryCandidate, IMcpDiscoverySnapshot, mcpCandidate, mcpHost } from './mcpDiscovery.js';

/**
 * Prefix used for the {@link McpCollectionDefinition.id | collection id} of
 * MCP collections contributed by agent plugins. The remainder of the id is
 * the plugin's URI. Consumers can use this to tell plugin-sourced MCP servers
 * apart from servers configured directly in VS Code.
 */
export { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../mcpTypes.js';

export class PluginMcpDiscovery extends Disposable implements IMcpDiscovery {
	readonly fromGallery = false;

	private readonly _collections = this._register(new DisposableResourceMap());
	private readonly _discoverySnapshot = observableValue<IMcpDiscoverySnapshot | undefined>(this, undefined);
	readonly discoverySnapshot = this._discoverySnapshot;

	constructor(
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();
	}

	public start(): void {
		this._register(autorun(reader => {
			if (!this._agentPluginService.discoveryComplete.read(reader)) {
				return;
			}
			const enabledPlugins = new Set(this._agentPluginService.plugins.read(reader));
			const plugins = this._agentPluginService.discoveredPlugins.read(reader);
			const seen = new ResourceSet();
			const candidates: IMcpDiscoveryCandidate[] = [];
			const configurationOutcomes: IMcpConfigurationOutcome[] = [];
			let snapshotComplete = true;
			for (const plugin of plugins) {
				const servers = plugin.mcpServerDefinitions.read(reader);
				const configurationOutcome = plugin.mcpConfigurationOutcome?.read(reader);
				const state = configurationOutcome ?? {
					configurationPresent: servers.length > 0 ? 1 : 0,
					configuredEntryCount: servers.length,
					parseErrorCount: 0,
					unreadableCount: 0,
				};
				snapshotComplete &&= plugin.mcpConfigurationOutcome === undefined || configurationOutcome !== undefined;
				if (servers.length === 0 && state.configurationPresent === 0 && state.parseErrorCount === 0 && state.unreadableCount === 0) {
					continue;
				}
				const host = mcpHost(plugin.remoteAuthority);
				const blocked = plugin.policyBlocked?.read(reader) === true;
				const enabled = enabledPlugins.has(plugin) && isContributionEnabled(plugin.enablement.read(reader));
				if (configurationOutcome !== undefined || plugin.mcpConfigurationOutcome === undefined) {
					for (const server of servers) {
						const valid = this._toServerDefinition('telemetry', server) !== undefined;
						candidates.push(mcpCandidate(
							McpDiscoverySource.Plugin,
							McpDiscoveryFormat.PluginMap,
							McpDiscoveryScope.Plugin,
							host,
							blocked ? 'blocked' : !enabled ? 'disabled' : valid ? 'loaded' : 'parseError',
						));
					}
					for (let i = 0; i < state.parseErrorCount; i++) {
						candidates.push(mcpCandidate(McpDiscoverySource.Plugin, McpDiscoveryFormat.PluginMap, McpDiscoveryScope.Plugin, host, 'parseError'));
					}
					for (let i = 0; i < state.unreadableCount; i++) {
						candidates.push(mcpCandidate(McpDiscoverySource.Plugin, McpDiscoveryFormat.PluginMap, McpDiscoveryScope.Plugin, host, 'unreadable'));
					}
					configurationOutcomes.push({
						source: McpDiscoverySource.Plugin,
						format: McpDiscoveryFormat.PluginMap,
						scope: McpDiscoveryScope.Plugin,
						host,
						configurationPresent: state.configurationPresent,
						configuredEntryCount: state.configuredEntryCount,
						parseErrorCount: state.parseErrorCount,
						unreadableCount: state.unreadableCount,
					});
				}
				if (!enabled || blocked || servers.length === 0) {
					continue;
				}

				seen.add(plugin.uri);

				let collectionState = this._collections.get(plugin.uri);
				if (!collectionState) {
					// note: all plugin servers are currently defined in the same file
					collectionState = this.createCollectionState(plugin, servers[0].uri);
					this._collections.set(plugin.uri, collectionState);
				}
			}

			for (const [pluginUri] of this._collections) {
				if (!seen.has(pluginUri)) {
					this._collections.deleteAndDispose(pluginUri);
				}
			}
			if (snapshotComplete) {
				this._discoverySnapshot.set({ candidates, configurationOutcomes }, undefined);
			}
		}));
	}

	private createCollectionState(plugin: IAgentPlugin, manifestURI: URI) {
		const collectionId = `${MCP_PLUGIN_COLLECTION_ID_PREFIX}${plugin.uri}`;
		return this._mcpRegistry.registerCollection({
			id: collectionId,
			provenance: McpCollectionProvenance.Plugin,
			label: `${plugin.label} (Agent Plugin)`,
			remoteAuthority: plugin.remoteAuthority ?? null,
			configTarget: ConfigurationTarget.USER,
			scope: StorageScope.PROFILE,
			trustBehavior: McpServerTrust.Kind.Trusted,
			serverDefinitions: plugin.mcpServerDefinitions.map(defs =>
				defs.map(d => this._toServerDefinition(collectionId, d)).filter(isDefined)),
			order: McpCollectionSortOrder.Plugin,
			discovery: {
				source: McpDiscoverySource.Plugin,
				format: McpDiscoveryFormat.PluginMap,
				scope: McpDiscoveryScope.Plugin,
				host: mcpHost(plugin.remoteAuthority),
			},
			presentation: {
				origin: manifestURI,
			},
		});
	}

	private _toServerDefinition(
		collectionId: string,
		{ name, configuration, defaultCwd }: IAgentPluginMcpServerDefinition,
	): McpServerDefinition | undefined {
		const launch = this._toLaunch(configuration);
		if (!launch) {
			return undefined;
		}

		return {
			id: `${collectionId}.${name}`,
			label: name,
			launch,
			defaultCwd,
			variableReplacement: { target: ConfigurationTarget.USER },
			cacheNonce: String(hash(launch)),
		};
	}

	private _toLaunch(config: IMcpServerConfiguration): McpServerLaunch | undefined {
		if (config.type === McpServerType.LOCAL) {
			return {
				type: McpServerTransportType.Stdio,
				command: config.command,
				args: config.args ? [...config.args] : [],
				env: config.env ? { ...config.env } : {},
				envFile: config.envFile,
				cwd: config.cwd,
				sandbox: undefined,
			};
		}

		try {
			return {
				type: McpServerTransportType.HTTP,
				uri: URI.parse(config.url),
				headers: Object.entries(config.headers ?? {}),
				oauth: config.oauth,
			};
		} catch {
			return undefined;
		}
	}
}
