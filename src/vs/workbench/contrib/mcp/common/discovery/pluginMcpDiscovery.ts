/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../../base/common/hash.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import {
	IAgentPlugin,
	IAgentPluginMcpServerDefinition,
	IAgentPluginService
} from '../../../chat/common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../../chat/common/enablement.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX, McpCollectionProvenance, McpCollectionSortOrder, McpDiscoveryFormat, McpDiscoveryScope, McpDiscoverySource, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust } from '../mcpTypes.js';
import { IMcpConfigurationTelemetrySnapshot, IMcpDiscovery, IMcpDiscoveryTelemetryCandidate, IMcpDiscoveryTelemetrySnapshot } from './mcpDiscovery.js';
import { mcpCandidate, mcpHost } from './mcpDiscoveryTelemetry.js';

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
	private readonly _telemetrySnapshot = observableValue<IMcpDiscoveryTelemetrySnapshot | undefined>(this, undefined);
	readonly telemetrySnapshot = this._telemetrySnapshot;

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
			const candidates: IMcpDiscoveryTelemetryCandidate[] = [];
			const configurations: IMcpConfigurationTelemetrySnapshot[] = [];
			let telemetryReady = true;
			for (const plugin of plugins) {
				const discoveryResult = plugin.mcpDiscoveryResult?.read(reader);
				const servers = discoveryResult?.serverDefinitions ?? plugin.mcpServerDefinitions.read(reader);
				const state = discoveryResult ?? plugin.mcpConfigurationState?.read(reader) ?? {
					configurationPresent: servers.length > 0 ? 1 : 0,
					parseErrorCount: 0,
					unreadableCount: 0,
				};
				const pluginTelemetryReady = plugin.mcpDiscoveryReady?.read(reader) ?? true;
				telemetryReady &&= pluginTelemetryReady;
				if (!pluginTelemetryReady) {
					if (this._collections.has(plugin.uri)) {
						seen.add(plugin.uri);
					}
					continue;
				}
				if (servers.length === 0 && state.configurationPresent === 0 && state.parseErrorCount === 0 && state.unreadableCount === 0) {
					continue;
				}
				const host = mcpHost(plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null);
				const blocked = plugin.policyBlocked?.read(reader) === true;
				const enabled = enabledPlugins.has(plugin) && isContributionEnabled(plugin.enablement.read(reader));
				if (pluginTelemetryReady) {
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
					configurations.push({
						source: McpDiscoverySource.Plugin,
						format: McpDiscoveryFormat.PluginMap,
						scope: McpDiscoveryScope.Plugin,
						host,
						configurationPresent: state.configurationPresent,
						configuredEntryCount: servers.length,
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
			if (telemetryReady) {
				this._telemetrySnapshot.set({ candidates, configurations }, undefined);
			}
		}));
	}

	private createCollectionState(plugin: IAgentPlugin, manifestURI: URI) {
		const collectionId = `${MCP_PLUGIN_COLLECTION_ID_PREFIX}${plugin.uri}`;
		return this._mcpRegistry.registerCollection({
			id: collectionId,
			provenance: McpCollectionProvenance.Plugin,
			label: `${plugin.label} (Agent Plugin)`,
			remoteAuthority: plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null,
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
				host: mcpHost(plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null),
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
