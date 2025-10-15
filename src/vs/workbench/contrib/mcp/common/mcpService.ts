/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mcpAutoStartConfig, McpAutoStartValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IAutostartResult, IMcpServer, IMcpService, McpCollectionDefinition, McpConnectionState, McpDefinitionReference, McpServerCacheState, McpServerDefinition, McpStartServerInteraction, McpToolName, UserInteractionRequiredError } from './mcpTypes.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';

type IMcpServerRec = { object: IMcpServer; toolPrefix: string };

export class McpService extends Disposable implements IMcpService {

	declare _serviceBrand: undefined;

	private readonly _currentAutoStarts = new Set<CancellationTokenSource>();
	private readonly _servers = observableValue<readonly IMcpServerRec[]>(this, []);
	public readonly servers: IObservable<readonly IMcpServer[]> = this._servers.map(servers => servers.map(s => s.object));

	public get lazyCollectionState() { return this._mcpRegistry.lazyCollectionState; }

	protected readonly userCache: McpServerMetadataCache;
	protected readonly workspaceCache: McpServerMetadataCache;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

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

		this._autostart(autoStartConfig, state, cts.token).finally(() => store.dispose());

		return state;
	}

	private async _autostart(autoStartConfig: McpAutoStartValue, state: ISettableObservable<IAutostartResult>, token: CancellationToken) {
		await this._activateCollections();

		if (token.isCancellationRequested) {
			return;
		}

		// don't try re-running errored servers, let the user choose if they want that
		const candidates = this.servers.get().filter(s => s.connectionState.get().state !== McpConnectionState.Kind.Error);

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

		await Promise.all([...todo].map(async (server, i) => {
			try {
				await startServerAndWaitForLiveTools(server, { interaction, errorOnUserInteraction: true }, token);
			} catch (error) {
				if (error instanceof UserInteractionRequiredError) {
					requiringInteraction.push({ id: server.definition.id, label: server.definition.label, errorMessage: error.message });
				}
			}

			if (!token.isCancellationRequested) {
				todo.delete(server);
				update();
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
		const collectionIds = await this._activateCollections();

		// Discover any newly-collected servers with unknown tools
		const todo: Promise<unknown>[] = [];
		for (const { object: server } of this._servers.get()) {
			if (collectionIds.has(server.collection.id)) {
				const state = server.cacheState.get();
				if (state === McpServerCacheState.Unknown) {
					todo.push(server.start());
				}
			}
		}

		await Promise.all(todo);
	}

	private async _activateCollections() {
		const collections = await this._mcpRegistry.discoverCollections();
		this.updateCollectedServers();
		return new Set(collections.map(c => c.id));
	}

	public updateCollectedServers() {
		const prefixGenerator = new McpPrefixGenerator();
		const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition =>
			collectionDefinition.serverDefinitions.get().map(serverDefinition => {
				const toolPrefix = prefixGenerator.generate(serverDefinition.label);
				return { serverDefinition, collectionDefinition, toolPrefix };
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
			const match = definitions.find(d => defsEqual(server.object, d) && server.toolPrefix === d.toolPrefix);
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
				def.toolPrefix,
			);

			nextServers.push({ object, toolPrefix: def.toolPrefix });
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

// Helper class for generating unique MCP tool prefixes
class McpPrefixGenerator {
	private readonly seenPrefixes = new Set<string>();

	generate(label: string): string {
		const baseToolPrefix = McpToolName.Prefix + label.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, McpToolName.MaxPrefixLen - McpToolName.Prefix.length - 1);
		let toolPrefix = baseToolPrefix + '_';
		for (let i = 2; this.seenPrefixes.has(toolPrefix); i++) {
			toolPrefix = baseToolPrefix + i + '_';
		}
		this.seenPrefixes.add(toolPrefix);
		return toolPrefix;
	}
}
