/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { autorun, autorunWithStore, derived, disposableObservableValue, IObservable, ITransaction, observableFromEvent, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { mcpActivationEvent } from './mcpConfiguration.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { extensionMcpCollectionPrefix, IMcpServer, IMcpServerConnection, IMcpTool, McpCollectionReference, McpConnectionFailedError, McpConnectionState, McpDefinitionReference, McpServerDefinition, McpServerToolsState } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';


interface IToolCacheEntry {
	/** Cached tools so we can show what's available before it's started */
	readonly tools: readonly MCP.Tool[];
}

interface IServerCacheEntry {
	readonly servers: readonly McpServerDefinition.Serialized[];
}

export class McpServerMetadataCache extends Disposable {
	private didChange = false;
	private readonly cache = new LRUCache<string, IToolCacheEntry>(128);
	private readonly extensionServers = new Map</* collection ID */string, IServerCacheEntry>();

	constructor(
		scope: StorageScope,
		@IStorageService storageService: IStorageService,
	) {
		super();

		type StoredType = {
			extensionServers: [string, IServerCacheEntry][];
			serverTools: [string, IToolCacheEntry][];
		};

		const storageKey = 'mcpToolCache';
		this._register(storageService.onWillSaveState(() => {
			if (this.didChange) {
				storageService.store(storageKey, {
					extensionServers: [...this.extensionServers],
					serverTools: this.cache.toJSON(),
				} satisfies StoredType, scope, StorageTarget.MACHINE);
				this.didChange = false;
			}
		}));

		try {
			const cached: StoredType | undefined = storageService.getObject(storageKey, scope);
			this.extensionServers = new Map(cached?.extensionServers ?? []);
			cached?.serverTools?.forEach(([k, v]) => this.cache.set(k, v));
		} catch {
			// ignored
		}
	}

	/** Resets the cache for tools and extension servers */
	reset() {
		this.cache.clear();
		this.extensionServers.clear();
		this.didChange = true;
	}

	/** Gets cached tools for a server (used before a server is running) */
	getTools(definitionId: string): readonly MCP.Tool[] | undefined {
		return this.cache.get(definitionId)?.tools;
	}

	/** Sets cached tools for a server */
	storeTools(definitionId: string, tools: readonly MCP.Tool[]): void {
		this.cache.set(definitionId, { ...this.cache.get(definitionId), tools });
		this.didChange = true;
	}

	/** Gets cached servers for a collection (used for extensions, before the extension activates) */
	getServers(collectionId: string) {
		return this.extensionServers.get(collectionId);
	}

	/** Sets cached servers for a collection */
	storeServers(collectionId: string, entry: IServerCacheEntry | undefined): void {
		if (entry) {
			this.extensionServers.set(collectionId, entry);
		} else {
			this.extensionServers.delete(collectionId);
		}
		this.didChange = true;
	}
}

export class McpServer extends Disposable implements IMcpServer {
	private readonly _connectionSequencer = new Sequencer();
	private readonly _connection = this._register(disposableObservableValue<IMcpServerConnection | undefined>(this, undefined));

	public readonly connection = this._connection;
	public readonly connectionState: IObservable<McpConnectionState> = derived(reader => this._connection.read(reader)?.state.read(reader) ?? { state: McpConnectionState.Kind.Stopped });

	private get toolsFromCache() {
		return this._toolCache.getTools(this.definition.id);
	}
	private readonly toolsFromServerPromise = observableValue<ObservablePromise<readonly MCP.Tool[]> | undefined>(this, undefined);
	private readonly toolsFromServer = derived(reader => this.toolsFromServerPromise.read(reader)?.promiseResult.read(reader)?.data);

	public readonly tools: IObservable<readonly IMcpTool[]>;

	public readonly toolsState = derived(reader => {
		const fromServer = this.toolsFromServerPromise.read(reader);
		const connectionState = this.connectionState.read(reader);
		const isIdle = McpConnectionState.canBeStarted(connectionState.state) && !fromServer;
		if (isIdle) {
			return this.toolsFromCache ? McpServerToolsState.Cached : McpServerToolsState.Unknown;
		}

		const fromServerResult = fromServer?.promiseResult.read(reader);
		if (!fromServerResult) {
			return this.toolsFromCache ? McpServerToolsState.RefreshingFromCached : McpServerToolsState.RefreshingFromUnknown;
		}

		return fromServerResult.error ? (this.toolsFromCache ? McpServerToolsState.Cached : McpServerToolsState.Unknown) : McpServerToolsState.Live;
	});

	private readonly _loggerId: string;
	private readonly _logger: ILogger;

	public get trusted() {
		return this._mcpRegistry.getTrust(this.collection);
	}

	constructor(
		public readonly collection: McpCollectionReference,
		public readonly definition: McpDefinitionReference,
		private readonly _requiresExtensionActivation: boolean | undefined,
		private readonly _toolCache: McpServerMetadataCache,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IWorkspaceContextService workspacesService: IWorkspaceContextService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IOutputService private readonly _outputService: IOutputService,
	) {
		super();

		this._loggerId = `mcpServer/${definition.id}`;
		this._logger = this._register(_loggerService.createLogger(this._loggerId, { hidden: true, name: `MCP: ${definition.label}` }));
		// If the logger is disposed but not deregistered, then the disposed instance
		// is reused and no-ops. todo@sandy081 this seems like a bug.
		this._register(toDisposable(() => _loggerService.deregisterLogger(this._loggerId)));

		// 1. Reflect workspaces into the MCP roots
		const workspaces = observableFromEvent(
			this,
			workspacesService.onDidChangeWorkspaceFolders,
			() => workspacesService.getWorkspace().folders,
		);

		this._register(autorunWithStore(reader => {
			const cnx = this._connection.read(reader)?.handler.read(reader);
			if (!cnx) {
				return;
			}

			cnx.roots = workspaces.read(reader).map(wf => ({
				uri: wf.uri.toString(),
				name: wf.name,
			}));
		}));

		// 2. Populate this.tools when we connect to a server.
		this._register(autorunWithStore((reader, store) => {
			const cnx = this._connection.read(reader)?.handler.read(reader);
			if (cnx) {
				this.populateLiveData(cnx, store);
			} else {
				this.resetLiveData();
			}
		}));

		// 3. Update the cache when tools update
		this._register(autorun(reader => {
			const tools = this.toolsFromServer.read(reader);
			if (tools) {
				this._toolCache.storeTools(definition.id, tools);
			}
		}));

		// 4. Publish tools
		const toolPrefix = this._mcpRegistry.collectionToolPrefix(this.collection);
		this.tools = derived(reader => {
			const serverTools = this.toolsFromServer.read(reader);
			const definitions = serverTools ?? this.toolsFromCache ?? [];
			const prefix = toolPrefix.read(reader);
			return definitions.map(def => new McpTool(this, prefix, def));
		});
	}

	public showOutput(): void {
		this._loggerService.setVisibility(this._loggerId, true);
		this._outputService.showChannel(this._loggerId);
	}

	public start(isFromInteraction?: boolean): Promise<McpConnectionState> {
		return this._connectionSequencer.queue(async () => {
			const activationEvent = mcpActivationEvent(this.collection.id.slice(extensionMcpCollectionPrefix.length));
			if (this._requiresExtensionActivation && !this._extensionService.activationEventIsDone(activationEvent)) {
				await this._extensionService.activateByEvent(activationEvent);
				await Promise.all(this._mcpRegistry.delegates
					.map(r => r.waitForInitialProviderPromises()));
				// This can happen if the server was created from a cached MCP server seen
				// from an extension, but then it wasn't registered when the extension activated.
				if (this._store.isDisposed) {
					return { state: McpConnectionState.Kind.Stopped };
				}
			}

			let connection = this._connection.get();
			if (connection && McpConnectionState.canBeStarted(connection.state.get().state)) {
				connection.dispose();
				connection = undefined;
				this._connection.set(connection, undefined);
			}

			if (!connection) {
				connection = await this._mcpRegistry.resolveConnection({
					logger: this._logger,
					collectionRef: this.collection,
					definitionRef: this.definition,
					forceTrust: isFromInteraction,
				});
				if (!connection) {
					return { state: McpConnectionState.Kind.Stopped };
				}

				if (this._store.isDisposed) {
					connection.dispose();
					return { state: McpConnectionState.Kind.Stopped };
				}

				this._connection.set(connection, undefined);
			}

			return connection.start();
		});
	}

	public stop(): Promise<void> {
		return this._connection.get()?.stop() || Promise.resolve();
	}

	private resetLiveData() {
		transaction(tx => {
			this.toolsFromServerPromise.set(undefined, tx);
		});
	}

	private populateLiveData(handler: McpServerRequestHandler, store: DisposableStore) {
		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		// todo: add more than just tools here

		const updateTools = (tx: ITransaction | undefined) => {
			const toolPromise = handler.capabilities.tools ? handler.listTools({}, cts.token) : Promise.resolve([]);
			const toolPromiseSafe = toolPromise.then(tools => {
				handler.logger.info(`Discovered ${tools.length} tools`);
				return tools.map(tool => {
					if (!tool.description) {
						// Ensure a description is provided for each tool, #243919
						handler.logger.warn(`Tool ${tool.name} does not have a description. Tools must be accurately described to be called`);
						tool.description = '<empty>';
					}

					return tool;
				});
			});
			this.toolsFromServerPromise.set(new ObservablePromise(toolPromiseSafe), tx);
		};

		store.add(handler.onDidChangeToolList(() => {
			handler.logger.info('Tool list changed, refreshing tools...');
			updateTools(undefined);
		}));

		transaction(tx => {
			updateTools(tx);
		});
	}

	/**
	 * Helper function to call the function on the handler once it's online. The
	 * connection started if it is not already.
	 */
	public async callOn<R>(fn: (handler: McpServerRequestHandler) => Promise<R>, token: CancellationToken = CancellationToken.None): Promise<R> {

		await this.start(); // idempotent

		let ranOnce = false;
		let d: IDisposable;

		const callPromise = new Promise<R>((resolve, reject) => {

			d = autorun(reader => {
				const connection = this._connection.read(reader);
				if (!connection || ranOnce) {
					return;
				}

				const handler = connection.handler.read(reader);
				if (!handler) {
					const state = connection.state.read(reader);
					if (state.state === McpConnectionState.Kind.Error) {
						reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
						return;
					} else if (state.state === McpConnectionState.Kind.Stopped) {
						reject(new McpConnectionFailedError('MCP server has stopped'));
						return;
					} else {
						// keep waiting for handler
						return;
					}
				}

				resolve(fn(handler));
				ranOnce = true; // aggressive prevent multiple racey calls, don't dispose because autorun is sync
			});
		});

		return raceCancellationError(callPromise, token).finally(() => d.dispose());
	}
}

export class McpTool implements IMcpTool {

	readonly id: string;

	constructor(
		private readonly _server: McpServer,
		idPrefix: string,
		public readonly definition: MCP.Tool,
	) {
		this.id = (idPrefix + definition.name).replaceAll('.', '_');
	}

	call(params: Record<string, unknown>, token?: CancellationToken): Promise<MCP.CallToolResult> {
		return this._server.callOn(h => h.callTool({ name: this.definition.name, arguments: params }), token);
	}
}
