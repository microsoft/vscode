/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mcpAutoStartConfig, McpAutoStartValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { CollisionEnablementModel, EnablementModel, isContributionEnabled } from '../../chat/common/enablement.js';
import { McpCollisionBehavior, mcpServerCollisionBehaviorSection } from './mcpConfiguration.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpPrefixGenerator, McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IAutostartResult, IMcpServer, IMcpService, McpCollectionDefinition, McpConnectionState, McpDefinitionReference, McpServerCacheState, McpServerDefinition, McpStartServerInteraction, UserInteractionRequiredError } from './mcpTypes.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';

type IMcpServerRec = { object: IMcpServer };

export class McpService extends Disposable implements IMcpService {

	declare _serviceBrand: undefined;

	private readonly _currentAutoStarts = new Set<CancellationTokenSource>();
	private readonly _servers = observableValue<readonly IMcpServerRec[]>(this, []);
	public readonly servers: IObservable<readonly IMcpServer[]> = this._servers.map(servers => servers.map(s => s.object));

	private readonly _prefixGenerator = new McpPrefixGenerator();

	public get lazyCollectionState() { return this._mcpRegistry.lazyCollectionState; }

	public readonly enablementModel: McpCollisionEnablementModel;

	protected readonly userCache: McpServerMetadataCache;
	protected readonly workspaceCache: McpServerMetadataCache;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const baseEnablement = this._register(new EnablementModel('mcp.enablement', storageService));
		const collisionBehavior = observableConfigValue(mcpServerCollisionBehaviorSection, McpCollisionBehavior.Disable, configurationService);
		this.enablementModel = new McpCollisionEnablementModel(baseEnablement, this._mcpRegistry, collisionBehavior);

		this.userCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, StorageScope.PROFILE));
		this.workspaceCache = this._register(_instantiationService.createInstance(McpServerMetadataCache, StorageScope.WORKSPACE));

		const updateThrottle = this._store.add(new RunOnceScheduler(() => this.updateCollectedServers(), 500));

		// Throttle changes so that if a collection is changed, or a server is
		// unregistered/registered, we don't stop servers unnecessarily.
		this._register(autorun(reader => {
			for (const collection of this._mcpRegistry.collections.read(reader)) {
				collection.serverDefinitions.read(reader);
			}
			updateThrottle.schedule(500);
		}));
	}

	public cancelAutostart(): void {
		for (const cts of this._currentAutoStarts) {
			cts.cancel();
		}
	}

	public autostart(_token?: CancellationToken): IObservable<IAutostartResult> {
		const autoStartConfig = this.configurationService.getValue<McpAutoStartValue>(mcpAutoStartConfig);
		if (autoStartConfig === McpAutoStartValue.Never) {
			return observableValue<IAutostartResult>(this, IAutostartResult.Empty);
		}

		const state = observableValue<IAutostartResult>(this, { working: true, starting: [], serversRequiringInteraction: [] });
		const store = new DisposableStore();

		const cts = store.add(new CancellationTokenSource(_token));
		this._currentAutoStarts.add(cts);
		store.add(toDisposable(() => {
			this._currentAutoStarts.delete(cts);
		}));
		store.add(cts.token.onCancellationRequested(() => {
			state.set(IAutostartResult.Empty, undefined);
		}));

		this._autostart(autoStartConfig, state, cts.token)
			.catch(err => {
				this._logService.error('Error during MCP autostart:', err);
				state.set(IAutostartResult.Empty, undefined);
			})
			.finally(() => store.dispose());

		return state;
	}

	private async _autostart(autoStartConfig: McpAutoStartValue, state: ISettableObservable<IAutostartResult>, token: CancellationToken) {
		await this._activateCollections();

		if (token.isCancellationRequested) {
			return;
		}

		// don't try re-running errored servers or disabled servers
		const candidates = this.servers.get().filter(s =>
			s.connectionState.get().state !== McpConnectionState.Kind.Error
			&& isContributionEnabled(s.enablement.get())
		);

		let todo = new Set<IMcpServer>();
		if (autoStartConfig === McpAutoStartValue.OnlyNew) {
			todo = new Set(candidates.filter(s => s.cacheState.get() === McpServerCacheState.Unknown));
		} else if (autoStartConfig === McpAutoStartValue.NewAndOutdated) {
			todo = new Set(candidates.filter(s => {
				const c = s.cacheState.get();
				return c === McpServerCacheState.Unknown || c === McpServerCacheState.Outdated;
			}));
		}

		if (!todo.size) {
			state.set(IAutostartResult.Empty, undefined);
			return;
		}

		const interaction = new McpStartServerInteraction();
		const requiringInteraction: (McpDefinitionReference & { errorMessage?: string })[] = [];

		const update = () => state.set({
			working: todo.size > 0,
			starting: [...todo].map(t => t.definition),
			serversRequiringInteraction: requiringInteraction,
		}, undefined);

		update();

		await Promise.all([...todo].map(async (server, i) => {
			try {
				await startServerAndWaitForLiveTools(server, { interaction, errorOnUserInteraction: true }, token);
			} catch (error) {
				if (error instanceof UserInteractionRequiredError) {
					requiringInteraction.push({ id: server.definition.id, label: server.definition.label, errorMessage: error.message });
				}
			} finally {
				todo.delete(server);
				if (!token.isCancellationRequested) {
					update();
				}
			}
		}));
	}

	public resetCaches(): void {
		this.userCache.reset();
		this.workspaceCache.reset();
	}

	public resetTrust(): void {
		this.resetCaches(); // same difference now
	}

	public async activateCollections(): Promise<void> {
		await this._activateCollections();
	}

	private async _activateCollections() {
		const collections = await this._mcpRegistry.discoverCollections();
		this.updateCollectedServers();
		return new Set(collections.map(c => c.id));
	}

	public updateCollectedServers() {
		const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition =>
			collectionDefinition.serverDefinitions.get().map(serverDefinition => {
				return { serverDefinition, collectionDefinition };
			})
		);

		const nextDefinitions = new Set(definitions);
		const currentServers = this._servers.get();
		const nextServers: IMcpServerRec[] = [];
		const pushMatch = (match: (typeof definitions)[0], rec: IMcpServerRec) => {
			nextDefinitions.delete(match);
			nextServers.push(rec);
			const connection = rec.object.connection.get();
			// if the definition was modified, stop the server; it'll be restarted again on-demand
			if (connection && !McpServerDefinition.equals(connection.definition, match.serverDefinition)) {
				rec.object.stop();
				this._logService.debug(`MCP server ${rec.object.definition.id} stopped because the definition changed`);
			}
		};

		// Transfer over any servers that are still valid.
		for (const server of currentServers) {
			const match = definitions.find(d => defsEqual(server.object, d));
			if (match) {
				pushMatch(match, server);
			} else {
				server.object.dispose();
			}
		}

		// Create any new servers that are needed.
		for (const def of nextDefinitions) {
			const object = this._instantiationService.createInstance(
				McpServer,
				def.collectionDefinition,
				def.serverDefinition,
				def.serverDefinition.roots,
				!!def.collectionDefinition.lazy,
				def.collectionDefinition.scope === StorageScope.WORKSPACE ? this.workspaceCache : this.userCache,
				this._prefixGenerator,
				this.enablementModel,
			);

			nextServers.push({ object });
		}

		transaction(tx => {
			this._servers.set(nextServers, tx);
		});
	}

	public override dispose(): void {
		this._servers.get().forEach(s => s.object.dispose());
		super.dispose();
	}
}

function defsEqual(server: IMcpServer, def: { serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition }) {
	return server.collection.id === def.collectionDefinition.id && server.definition.id === def.serverDefinition.id;
}

/**
 * Wraps an {@link EnablementModel} with collision-aware defaults and
 * mutual-exclusion logic for MCP servers with the same label.
 *
 * When collision behavior is `disable`:
 * - Servers whose label collides with a higher-priority server are disabled
 *   by default (unless the user has explicitly toggled them).
 * - Enabling a colliding server disables all other servers with the same label.
 *
 * When collision behavior is `suffix`, delegates everything unchanged.
 */
export class McpCollisionEnablementModel extends CollisionEnablementModel {

	/**
	 * For each server definition ID, the list of all definition IDs that share
	 * the same (case-insensitive) label, in priority order (lowest collection
	 * order first). Empty when collision behavior is `suffix`.
	 */
	constructor(
		base: EnablementModel,
		registry: IMcpRegistry,
		collisionBehavior: IObservable<McpCollisionBehavior>,
	) {
		const collisionGroups = derived(reader => {
			if (collisionBehavior.read(reader) !== McpCollisionBehavior.Disable) {
				return new Map<string, string[]>();
			}

			const collections = registry.collections.read(reader);
			// label → list of server definition IDs, in priority order
			const labelToIds = new Map<string, string[]>();
			for (const collection of collections) {
				for (const server of collection.serverDefinitions.read(reader)) {
					const key = server.label.toLowerCase();
					let ids = labelToIds.get(key);
					if (!ids) {
						ids = [];
						labelToIds.set(key, ids);
					}
					ids.push(server.id);
				}
			}

			const groups = new Map<string, string[]>();
			for (const ids of labelToIds.values()) {
				if (ids.length < 2) {
					continue;
				}
				for (const id of ids) {
					groups.set(id, ids);
				}
			}

			return groups;
		});
		super(base, collisionGroups);
	}
}
