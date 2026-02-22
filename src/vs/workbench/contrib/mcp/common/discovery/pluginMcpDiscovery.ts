/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../../base/common/hash.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
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
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionSortOrder, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';

export class PluginMcpDiscovery extends Disposable implements IMcpDiscovery {
	readonly fromGallery = false;

	private readonly _collections = this._register(new DisposableResourceMap());

	constructor(
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();
	}

	public start(): void {
		this._register(autorun(reader => {
			const plugins = this._agentPluginService.plugins.read(reader);
			const seen = new ResourceSet();
			for (const plugin of plugins) {
				seen.add(plugin.uri);

				let collectionState = this._collections.get(plugin.uri);
				if (!collectionState) {
					collectionState = this.createCollectionState(plugin);
					this._collections.set(plugin.uri, collectionState);
				}
			}

			for (const [pluginUri] of this._collections) {
				if (!seen.has(pluginUri)) {
					this._collections.deleteAndDispose(pluginUri);
				}
			}
		}));
	}

	private createCollectionState(plugin: IAgentPlugin) {
		const collectionId = `plugin.${plugin.uri}`;
		return this._mcpRegistry.registerCollection({
			id: collectionId,
			label: `${basename(plugin.uri)}/.mcp.json`,
			remoteAuthority: plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null,
			configTarget: ConfigurationTarget.USER,
			scope: StorageScope.PROFILE,
			trustBehavior: McpServerTrust.Kind.TrustedOnNonce,
			serverDefinitions: plugin.mcpServerDefinitions.map(defs =>
				defs.map(d => this._toServerDefinition(collectionId, d)).filter(isDefined)),
			presentation: {
				origin: plugin.uri,
				order: McpCollectionSortOrder.Filesystem + 1,
			},
		});
	}

	private _toServerDefinition(
		collectionId: string,
		{ name, configuration }: IAgentPluginMcpServerDefinition,
	): McpServerDefinition | undefined {
		const launch = this._toLaunch(configuration);
		if (!launch) {
			return undefined;
		}

		return {
			id: `${collectionId}.${name}`,
			label: name,
			launch,
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
			};
		}

		try {
			return {
				type: McpServerTransportType.HTTP,
				uri: URI.parse(config.url),
				headers: Object.entries(config.headers ?? {}),
			};
		} catch {
			return undefined;
		}
	}
}
