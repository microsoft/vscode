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
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { mcpAutoStartConfig, McpAutoStartValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IAutostartResult, IMcpServer, IMcpService, McpCollectionDefinition, McpConnectionState, McpDefinitionReference, McpServerCacheState, McpServerDefinition, McpServerTransportType, McpStartServerInteraction, McpToolName, UserInteractionRequiredError } from './mcpTypes.js';
import { startServerAndWaitForLiveTools } from './mcpTypesUtils.js';

type IMcpServerRec = { object: IMcpServer; toolPrefix: string };

// Telemetry types for deduplication tracking
type McpDeduplicationData = {
	serverId: string;
	keptFromCollection: string;
	skippedFromCollection: string;
	transportType: string;
};

type McpDeduplicationClassification = {
	owner: 'microsoft';
	comment: 'MCP server deduplication event tracking';
	serverId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the server being deduplicated' };
	keptFromCollection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The collection that was kept (higher priority)' };
	skippedFromCollection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The collection that was skipped (lower priority)' };
	transportType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The transport type of the server (stdio or http)' };
};

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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
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

	/**
	 * Deduplicates server definitions to prevent duplicate MCP servers from being created.
	 * Prioritizes servers from higher-priority collections (e.g., workspace over user).
	 * 
	 * @param definitions Array of server definitions with their collection and tool prefix information
	 * @returns Deduplicated array of server definitions with duplicates removed
	 * @internal
	 */
	private deduplicateServerDefinitions(definitions: Array<{ serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition; toolPrefix: string }>): Array<{ serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition; toolPrefix: string }> {
		// Handle empty or null input
		if (!definitions || definitions.length === 0) {
			return [];
		}

		const seen = new Map<string, { serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition; toolPrefix: string }>();
		const deduplicated: Array<{ serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition; toolPrefix: string }> = [];

		// Sort definitions by priority (workspace > user > extension)
		const sortedDefinitions = definitions.sort((a, b) => {
			const aPriority = this.getCollectionPriority(a.collectionDefinition);
			const bPriority = this.getCollectionPriority(b.collectionDefinition);
			return bPriority - aPriority; // Higher priority first
		});

		for (const def of sortedDefinitions) {
			const key = this.getServerDefinitionKey(def.serverDefinition);
			if (!seen.has(key)) {
				seen.set(key, def);
				deduplicated.push(def);
				this._logService.debug(`MCP deduplication: Keeping server ${def.serverDefinition.id} from collection ${def.collectionDefinition.id}`);
			} else {
				// Track deduplication event for telemetry
				const existingDef = seen.get(key)!;
				this._telemetryService.publicLog2<McpDeduplicationData, McpDeduplicationClassification>('mcp/serverDeduplication', {
					serverId: def.serverDefinition.id,
					keptFromCollection: existingDef.collectionDefinition.id,
					skippedFromCollection: def.collectionDefinition.id,
					transportType: def.serverDefinition.launch.type === McpServerTransportType.Stdio ? 'stdio' : 'http'
				});
				
				this._logService.debug(`MCP deduplication: Skipping duplicate server ${def.serverDefinition.id} from collection ${def.collectionDefinition.id}`);
			}
		}

		return deduplicated;
	}

	/**
	 * Gets a unique key for a server definition to identify duplicates.
	 * 
	 * @param serverDefinition The server definition to generate a key for
	 * @returns A unique string key based on server ID and launch configuration
	 * @internal
	 */
	private getServerDefinitionKey(serverDefinition: McpServerDefinition): string {
		// Handle null/undefined input
		if (!serverDefinition || !serverDefinition.id) {
			return 'unknown:unknown';
		}

		// Use server ID as the primary key, but also consider launch configuration for more precise matching
		let configKey = '';
		
		// Handle different transport types safely
		if (serverDefinition.launch?.type === McpServerTransportType.Stdio) {
			// For stdio transport, use command and args
			const commandKey = serverDefinition.launch.command || '';
			const argsKey = serverDefinition.launch.args ? serverDefinition.launch.args.join(' ') : '';
			configKey = `${commandKey}:${argsKey}`;
		} else if (serverDefinition.launch?.type === McpServerTransportType.HTTP) {
			// For HTTP transport, use URI and headers
			const uriKey = serverDefinition.launch.uri?.toString() || '';
			const headersKey = serverDefinition.launch.headers ? JSON.stringify(serverDefinition.launch.headers) : '';
			configKey = `${uriKey}:${headersKey}`;
		}
		
		return `${serverDefinition.id}:${configKey}`;
	}

	/**
	 * Gets the priority of a collection for deduplication (higher number = higher priority).
	 * 
	 * @param collectionDefinition The collection definition to get priority for
	 * @returns Priority number (3=workspace, 2=user, 1=extension)
	 * @internal
	 */
	private getCollectionPriority(collectionDefinition: McpCollectionDefinition): number {
		// Handle null/undefined input
		if (!collectionDefinition || collectionDefinition.scope === undefined) {
			return 0; // Unknown scope gets lowest priority
		}

		// Workspace collections have highest priority
		if (collectionDefinition.scope === StorageScope.WORKSPACE) {
			return 3;
		}
		// User collections have medium priority
		if (collectionDefinition.scope === StorageScope.PROFILE) {
			return 2;
		}
		// Application/Extension collections have lowest priority
		return 1;
	}

	public updateCollectedServers() {
		const prefixGenerator = new McpPrefixGenerator();
		const definitions = this._mcpRegistry.collections.get().flatMap(collectionDefinition =>
			collectionDefinition.serverDefinitions.get().map(serverDefinition => {
				const toolPrefix = prefixGenerator.generate(serverDefinition.label);
				return { serverDefinition, collectionDefinition, toolPrefix };
			})
		);

		// Deduplicate server definitions based on server ID and configuration
		const deduplicatedDefinitions = this.deduplicateServerDefinitions(definitions);
		const nextDefinitions = new Set(deduplicatedDefinitions);
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