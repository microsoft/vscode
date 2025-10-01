/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Location } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchLocalMcpServer } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { getMcpServerMapping } from '../mcpConfigFileUtils.js';
import { mcpConfigurationSection } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { IMcpConfigPath, IMcpWorkbenchService, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';

export class InstalledMcpServersDiscovery extends Disposable implements IMcpDiscovery {

	readonly fromGallery = true;
	private readonly collectionDisposables = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();
	}

	public start(): void {
		const throttler = this._register(new Throttler());
		this._register(this.mcpWorkbenchService.onChange(() => throttler.queue(() => this.sync())));
		this.sync();
	}

	private async getServerIdMapping(resource: URI, pathToServers: string[]): Promise<Map<string, Location>> {
		const store = new DisposableStore();
		try {
			const ref = await this.textModelService.createModelReference(resource);
			store.add(ref);
			const serverIdMapping = getMcpServerMapping({ model: ref.object.textEditorModel, pathToServers });
			return serverIdMapping;
		} catch {
			return new Map();
		} finally {
			store.dispose();
		}
	}

	private async sync(): Promise<void> {
		try {
			const collections = new Map<string, [IMcpConfigPath | undefined, McpServerDefinition[]]>();
			const mcpConfigPathInfos = new ResourceMap<Promise<IMcpConfigPath & { locations: Map<string, Location> } | undefined>>();
			for (const server of this.mcpWorkbenchService.getEnabledLocalMcpServers()) {
				let mcpConfigPathPromise = mcpConfigPathInfos.get(server.mcpResource);
				if (!mcpConfigPathPromise) {
					mcpConfigPathPromise = (async (local: IWorkbenchLocalMcpServer) => {
						const mcpConfigPath = this.mcpWorkbenchService.getMcpConfigPath(local);
						const locations = mcpConfigPath?.uri ? await this.getServerIdMapping(mcpConfigPath?.uri, mcpConfigPath.section ? [...mcpConfigPath.section, 'servers'] : ['servers']) : new Map();
						return mcpConfigPath ? { ...mcpConfigPath, locations } : undefined;
					})(server);
					mcpConfigPathInfos.set(server.mcpResource, mcpConfigPathPromise);
				}

				const config = server.config;
				const mcpConfigPath = await mcpConfigPathPromise;
				const collectionId = `mcp.config.${mcpConfigPath ? mcpConfigPath.id : 'unknown'}`;

				let definitions = collections.get(collectionId);
				if (!definitions) {
					definitions = [mcpConfigPath, []];
					collections.set(collectionId, definitions);
				}

				const launch: McpServerLaunch = config.type === 'http' ? {
					type: McpServerTransportType.HTTP,
					uri: URI.parse(config.url),
					headers: Object.entries(config.headers || {}),
				} : {
					type: McpServerTransportType.Stdio,
					command: config.command,
					args: config.args || [],
					env: config.env || {},
					envFile: config.envFile,
					cwd: config.cwd,
				};

				definitions[1].push({
					id: `${collectionId}.${server.name}`,
					label: server.name,
					launch,
					cacheNonce: await McpServerLaunch.hash(launch),
					roots: mcpConfigPath?.workspaceFolder ? [mcpConfigPath.workspaceFolder.uri] : undefined,
					variableReplacement: {
						folder: mcpConfigPath?.workspaceFolder,
						section: mcpConfigurationSection,
						target: mcpConfigPath?.target ?? ConfigurationTarget.USER,
					},
					devMode: config.dev,
					presentation: {
						order: mcpConfigPath?.order,
						origin: mcpConfigPath?.locations.get(server.name)
					}
				});
			}

			for (const [id, [mcpConfigPath, serverDefinitions]] of collections) {
				this.collectionDisposables.deleteAndDispose(id);
				this.collectionDisposables.set(id, this.mcpRegistry.registerCollection({
					id,
					label: mcpConfigPath?.label ?? '',
					presentation: {
						order: serverDefinitions[0]?.presentation?.order,
						origin: mcpConfigPath?.uri,
					},
					remoteAuthority: mcpConfigPath?.remoteAuthority ?? null,
					serverDefinitions: observableValue(this, serverDefinitions),
					trustBehavior: McpServerTrust.Kind.Trusted,
					configTarget: mcpConfigPath?.target ?? ConfigurationTarget.USER,
					scope: mcpConfigPath?.scope ?? StorageScope.PROFILE,
				}));
			}
			for (const [id] of this.collectionDisposables) {
				if (!collections.has(id)) {
					this.collectionDisposables.deleteAndDispose(id);
				}
			}

		} catch (error) {
			this.collectionDisposables.clearAndDisposeAll();
		}
	}
}
