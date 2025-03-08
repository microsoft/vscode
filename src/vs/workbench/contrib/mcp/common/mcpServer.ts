/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { autorun, autorunWithStore, derived, disposableObservableValue, IObservable, ITransaction, observableFromEvent, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { McpCollectionDefinition, IMcpServer, IMcpServerConnection, McpServerDefinition, IMcpTool, McpConnectionFailedError, McpConnectionState } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';


interface IMetadataCacheEntry {
	/** Cached tools so we can show what's available before it's started */
	readonly tools: readonly MCP.Tool[];
}

export class McpServerMetadataCache extends Disposable {
	private didChange = false;
	private readonly cache = new LRUCache<string, IMetadataCacheEntry>(128);

	constructor(
		scope: StorageScope,
		@IStorageService storageService: IStorageService,
	) {
		super();

		type StoredType = [string, IMetadataCacheEntry][];

		const storageKey = 'mcpToolCache';
		this._register(storageService.onWillSaveState(() => {
			if (this.didChange) {
				storageService.store(storageKey, this.cache.toJSON() satisfies StoredType, scope, StorageTarget.MACHINE);
				this.didChange = false;
			}
		}));

		try {
			const cached: StoredType | undefined = storageService.getObject(storageKey, scope);
			cached?.forEach(([k, v]) => this.cache.set(k, v));
		} catch {
			// ignored
		}
	}

	getTools(definitionId: string): readonly MCP.Tool[] | undefined {
		return this.cache.get(definitionId)?.tools;
	}

	storeTools(definitionId: string, tools: readonly MCP.Tool[]): void {
		this.cache.set(definitionId, { ...this.cache.get(definitionId), tools });
		this.didChange = true;
	}
}

export class McpServer extends Disposable implements IMcpServer {
	private readonly _connectionSequencer = new Sequencer();
	private readonly _connection = this._register(disposableObservableValue<IMcpServerConnection | undefined>(this, undefined));

	public readonly state: IObservable<McpConnectionState> = derived(reader => this._connection.read(reader)?.state.read(reader) ?? { state: McpConnectionState.Kind.Stopped });

	private get toolsFromCache() {
		return this._toolCache.getTools(this.definition.id);
	}
	private readonly toolsFromServerPromise = observableValue<ObservablePromise<readonly MCP.Tool[]> | undefined>(this, undefined);
	private readonly toolsFromServer = derived(reader => this.toolsFromServerPromise.read(reader)?.promiseResult.read(reader)?.data);

	public readonly tools = derived(reader => {
		const serverTools = this.toolsFromServer.read(reader);
		const definitions = serverTools ?? this.toolsFromCache ?? [];
		return definitions.map(def => new McpTool(this, def));
	});

	constructor(
		public readonly collection: McpCollectionDefinition,
		public readonly definition: McpServerDefinition,
		private readonly _toolCache: McpServerMetadataCache,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IWorkspaceContextService workspacesService: IWorkspaceContextService,
	) {
		super();

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
	}

	public showOutput(): void {
		this._connection.get()?.showOutput();
	}

	public start(): Promise<McpConnectionState> {
		return this._connectionSequencer.queue(async () => {
			let connection = this._connection.get();
			if (!connection) {
				connection = await this._mcpRegistry.resolveConnection(this.collection, this.definition);
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
			this.toolsFromServerPromise.set(new ObservablePromise(handler.listTools({}, cts.token)), tx);
		};

		store.add(handler.onDidChangeToolList(() => updateTools(undefined)));

		transaction(tx => {
			updateTools(tx);
		});
	}

	/**
	 * Helper function to call the function on the handler once it's online. The
	 * connection started if it is not already.
	 */
	public callOn<R>(fn: (handler: McpServerRequestHandler) => Promise<R>, token?: CancellationToken): Promise<R> {
		const store = new DisposableStore();
		this.start(); // idempotent

		try {
			return new Promise((resolve, reject) => {
				if (token) {
					store.add(token.onCancellationRequested(() => {
						reject(new CancellationError());
					}));
				}
				store.add(autorun(reader => {
					const connection = this._connection.read(reader);
					if (!connection) {
						return;
					}

					const handler = connection.handler.read(reader);
					if (handler) {
						resolve(fn(handler));
						store.dispose(); // aggressive dispose to prevent multiple racey calls
					} else {
						const state = connection.state.read(reader);
						if (state.state === McpConnectionState.Kind.Error) {
							reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
						} else {
							reject(new McpConnectionFailedError('MCP server has stopped'));
						}
					}
				}));
			});
		} finally {
			store.dispose();
		}
	}
}

export class McpTool implements IMcpTool {
	constructor(
		private readonly _server: McpServer,
		public readonly definition: MCP.Tool,
	) { }

	call(params: Record<string, unknown>, token?: CancellationToken): Promise<MCP.CallToolResult> {
		return this._server.callOn(h => h.callTool({ name: this.definition.name, arguments: params }), token);
	}
}
