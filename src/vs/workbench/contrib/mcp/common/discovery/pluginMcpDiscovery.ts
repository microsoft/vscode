/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../../base/common/hash.js';
import { Disposable, DisposableResourceMap, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import { isAbsolute, join, normalize, relative, sep } from '../../../../../base/common/path.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { McpServerType, type IMcpServerConfiguration, type IMcpStdioServerConfiguration } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import {
	IAgentPlugin,
	IAgentPluginMcpServerDefinition,
	IAgentPluginService
} from '../../../chat/common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../../chat/common/enablement.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX, McpCollectionProvenance, McpCollectionSortOrder, McpServerDefinition, McpServerLaunch, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

/**
 * Prefix used for the {@link McpCollectionDefinition.id | collection id} of
 * MCP collections contributed by agent plugins. The remainder of the id is
 * the plugin's URI. Consumers can use this to tell plugin-sourced MCP servers
 * apart from servers configured directly in VS Code.
 */
export { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../mcpTypes.js';

export async function toPluginMcpServerDefinition(
	collectionId: string,
	plugin: Pick<IAgentPlugin, 'dataDir' | 'format' | 'uri'>,
	definition: IAgentPluginMcpServerDefinition,
	fileService?: IFileService,
): Promise<McpServerDefinition | undefined> {
	const { name, defaultCwd } = definition;
	let configuration = definition.configuration;
	if (plugin.format === PluginFormat.AgentPlugin) {
		const dataDir = plugin.dataDir?.get();
		if (configuration.type === McpServerType.LOCAL && fileService && dataDir) {
			await fileService.createFolder(dataDir);
		}

		const resolvedConfiguration = resolveAgentPluginMcpConfiguration(configuration, plugin.uri.fsPath, dataDir?.fsPath);
		if (!resolvedConfiguration) {
			return undefined;
		}
		configuration = resolvedConfiguration;
	}
	const launch = McpServerLaunch.fromServerConfiguration(configuration);
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

function resolveAgentPluginMcpConfiguration(
	configuration: IMcpServerConfiguration,
	pluginRoot: string,
	pluginData: string | undefined,
): IMcpServerConfiguration | undefined {
	if (configuration.type !== McpServerType.LOCAL) {
		return configuration;
	}

	const replace = (value: string): string | undefined => {
		if (value.includes('${PLUGIN_DATA}') && !pluginData) {
			return undefined;
		}
		return value
			.replaceAll('${PLUGIN_ROOT}', pluginRoot)
			.replaceAll('${PLUGIN_DATA}', pluginData ?? '');
	};
	const args = configuration.args?.map(replace);
	if (args?.some(arg => arg === undefined)) {
		return undefined;
	}
	const env = { ...(configuration.env ?? {}) };
	const cwd = resolveAgentPluginCwd(configuration.cwd, pluginRoot, pluginData);
	if (cwd === undefined) {
		return undefined;
	}
	const local: IMcpStdioServerConfiguration = {
		...configuration,
		cwd,
		args: args as string[] | undefined,
		env,
	};
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === 'string') {
			const replaced = replace(value);
			if (replaced === undefined) {
				return undefined;
			}
			env[key] = replaced;
		}
	}
	if (pluginData) {
		env.PLUGIN_DATA = pluginData;
	}
	env.PLUGIN_ROOT = pluginRoot;
	return local;
}

function resolveAgentPluginCwd(cwd: string | undefined, pluginRoot: string, pluginData: string | undefined): string | undefined {
	if (cwd === undefined) {
		return pluginRoot;
	}

	let root: string;
	let relativePath: string;
	if (cwd.startsWith('./')) {
		root = pluginRoot;
		relativePath = cwd.slice(2);
	} else if (cwd === '${PLUGIN_ROOT}' || cwd.startsWith('${PLUGIN_ROOT}/')) {
		root = pluginRoot;
		relativePath = cwd.slice('${PLUGIN_ROOT}'.length).replace(/^\//, '');
	} else if (pluginData && (cwd === '${PLUGIN_DATA}' || cwd.startsWith('${PLUGIN_DATA}/'))) {
		root = pluginData;
		relativePath = cwd.slice('${PLUGIN_DATA}'.length).replace(/^\//, '');
	} else {
		return undefined;
	}

	if (relativePath.includes('\\')) {
		return undefined;
	}
	const resolved = normalize(join(root, relativePath));
	const relativeToRoot = relative(normalize(root), resolved);
	if (isAbsolute(relativeToRoot) || relativeToRoot === '..' || relativeToRoot.startsWith(`..${sep}`)) {
		return undefined;
	}
	return resolved;
}

class CollectionEntry extends MutableDisposable<IDisposable> {
	constructor(public readonly dataDirKey: string | undefined) {
		super();
	}
}

export class PluginMcpDiscovery extends Disposable implements IMcpDiscovery {
	readonly fromGallery = false;

	private readonly _collections = this._register(new DisposableResourceMap<CollectionEntry>());

	constructor(
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
	}

	public start(): void {
		this._register(autorun(reader => {
			const plugins = this._agentPluginService.plugins.read(reader);
			const seen = new ResourceSet();
			for (const plugin of plugins) {
				if (!isContributionEnabled(plugin.enablement.read(reader))) {
					continue;
				}
				const servers = plugin.mcpServerDefinitions.read(reader);
				if (servers.length === 0) {
					continue;
				}

				seen.add(plugin.uri);

				const dataDirKey = plugin.dataDir?.read(reader)?.toString();
				const existing = this._collections.get(plugin.uri);
				if (existing && existing.dataDirKey !== dataDirKey) {
					this._collections.deleteAndDispose(plugin.uri);
				}

				if (!this._collections.has(plugin.uri)) {
					const collectionDisposable = new CollectionEntry(dataDirKey);
					this._collections.set(plugin.uri, collectionDisposable);

					this.createCollectionState(plugin, servers[0].uri).then(disposable => {
						if (this._collections.get(plugin.uri) === collectionDisposable) {
							collectionDisposable.value = disposable;
						} else {
							disposable.dispose();
						}
					});
				}
			}

			for (const [pluginUri] of this._collections) {
				if (!seen.has(pluginUri)) {
					this._collections.deleteAndDispose(pluginUri);
				}
			}
		}));
	}

	private async createCollectionState(plugin: IAgentPlugin, manifestURI: URI) {
		const collectionId = `${MCP_PLUGIN_COLLECTION_ID_PREFIX}${plugin.uri}`;
		const defsObservableValue = plugin.mcpServerDefinitions.get();
		const serverDefinitions = await Promise.all(
			defsObservableValue.map(async d => toPluginMcpServerDefinition(collectionId, plugin, d, this._fileService))
		);

		const validDefinitions = serverDefinitions.filter(isDefined);

		return this._mcpRegistry.registerCollection({
			id: collectionId,
			provenance: McpCollectionProvenance.Plugin,
			label: `${plugin.label} (Agent Plugin)`,
			remoteAuthority: plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null,
			configTarget: ConfigurationTarget.USER,
			scope: StorageScope.PROFILE,
			trustBehavior: McpServerTrust.Kind.Trusted,
			serverDefinitions: constObservable(validDefinitions),
			order: McpCollectionSortOrder.Plugin,
			presentation: {
				origin: manifestURI,
			},
		});
	}

}
