/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableProducer, raceCancellationError, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Iterable } from '../../../../base/common/iterator.js';
import * as json from '../../../../base/common/json.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { mapValues } from '../../../../base/common/objects.js';
import { autorun, autorunSelfDisposable, derived, disposableObservableValue, IDerivedReader, IObservable, IReader, ITransaction, observableFromEvent, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createURITransformer } from '../../../../base/common/uriTransformer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';
import { INotificationService, IPromptChoice, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { ToolProgress } from '../../chat/common/languageModelToolsService.js';
import { mcpActivationEvent } from './mcpConfiguration.js';
import { McpDevModeServerAttache } from './mcpDevMode.js';
import { McpIcons, parseAndValidateMcpIcon, StoredMcpIcons } from './mcpIcons.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { extensionMcpCollectionPrefix, IMcpElicitationService, IMcpIcons, IMcpPrompt, IMcpPromptMessage, IMcpResource, IMcpResourceTemplate, IMcpSamplingService, IMcpServer, IMcpServerConnection, IMcpServerStartOpts, IMcpTool, IMcpToolCallContext, McpCapability, McpCollectionDefinition, McpCollectionReference, McpConnectionFailedError, McpConnectionState, McpDefinitionReference, mcpPromptReplaceSpecialChars, McpResourceURI, McpServerCacheState, McpServerDefinition, McpServerStaticToolAvailability, McpServerTransportType, McpToolName, UserInteractionRequiredError } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';
import { UriTemplate } from './uriTemplate.js';

type ServerBootData = {
	supportsLogging: boolean;
	supportsPrompts: boolean;
	supportsResources: boolean;
	toolCount: number;
	serverName: string;
	serverVersion: string;
};
type ServerBootClassification = {
	owner: 'connor4312';
	comment: 'Details the capabilities of the MCP server';
	supportsLogging: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the server supports logging' };
	supportsPrompts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the server supports prompts' };
	supportsResources: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the server supports resource' };
	toolCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of tools the server advertises' };
	serverName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the MCP server' };
	serverVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the MCP server' };
};

type ElicitationTelemetryData = {
	serverName: string;
	serverVersion: string;
};

type ElicitationTelemetryClassification = {
	owner: 'connor4312';
	comment: 'Triggered when elictation is requested';
	serverName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the MCP server' };
	serverVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the MCP server' };
};

export type McpServerInstallData = {
	serverName: string;
	source: 'gallery' | 'local';
	scope: string;
	success: boolean;
	error?: string;
	hasInputs: boolean;
};

export type McpServerInstallClassification = {
	owner: 'connor4312';
	comment: 'MCP server installation event tracking';
	serverName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the MCP server being installed' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Installation source (gallery or local)' };
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Installation scope (user, workspace, etc.)' };
	success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether installation succeeded' };
	error?: { classification: 'CallstackOrException'; purpose: 'FeatureInsight'; comment: 'Error message if installation failed' };
	hasInputs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the server requires input configuration' };
};

type ServerBootState = {
	state: string;
	time: number;
};
type ServerBootStateClassification = {
	owner: 'connor4312';
	comment: 'Details the capabilities of the MCP server';
	state: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The server outcome' };
	time: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Duration in milliseconds to reach that state' };
};

type StoredMcpPrompt = MCP.Prompt & { _icons: StoredMcpIcons };

interface IToolCacheEntry {
	readonly serverName: string | undefined;
	readonly serverInstructions: string | undefined;
	readonly serverIcons: StoredMcpIcons;

	readonly trustedAtNonce: string | undefined;

	readonly nonce: string | undefined;
	/** Cached tools so we can show what's available before it's started */
	readonly tools: readonly ValidatedMcpTool[];
	/** Cached prompts */
	readonly prompts: readonly StoredMcpPrompt[] | undefined;
	/** Cached capabilities */
	readonly capabilities: McpCapability | undefined;
}

const emptyToolEntry: IToolCacheEntry = {
	serverName: undefined,
	serverIcons: [],
	serverInstructions: undefined,
	trustedAtNonce: undefined,
	nonce: undefined,
	tools: [],
	prompts: undefined,
	capabilities: undefined,
};

interface IServerCacheEntry {
	readonly servers: readonly McpServerDefinition.Serialized[];
}

const toolInvalidCharRe = /[^a-z0-9_-]/gi;

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

	/** Resets the cache for primitives and extension servers */
	reset() {
		this.cache.clear();
		this.extensionServers.clear();
		this.didChange = true;
	}

	/** Gets cached primitives for a server (used before a server is running) */
	get(definitionId: string) {
		return this.cache.get(definitionId);
	}

	/** Sets cached primitives for a server */
	store(definitionId: string, entry: Partial<IToolCacheEntry>): void {
		const prev = this.get(definitionId) || emptyToolEntry;
		this.cache.set(definitionId, { ...prev, ...entry });
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

type ValidatedMcpTool = MCP.Tool & {
	_icons: StoredMcpIcons;

	/**
	 * Tool name as published by the MCP server. This may
	 * be different than the one in {@link definition} due to name normalization
	 * in {@link McpServer._getValidatedTools}.
	 */
	serverToolName: string;
};

interface StoredServerMetadata {
	readonly serverName: string | undefined;
	readonly serverInstructions: string | undefined;
	readonly serverIcons: StoredMcpIcons | undefined;
}

interface ServerMetadata {
	readonly serverName: string | undefined;
	readonly serverInstructions: string | undefined;
	readonly icons: IMcpIcons;
}

class CachedPrimitive<T, C> {
	/**
	 * @param _definitionId Server definition ID
	 * @param _cache Metadata cache instance
	 * @param _fromStaticDefinition Static definition that came with the server.
	 * This should ONLY have a value if it should be used instead of whatever
	 * is currently in the cache.
	 * @param _fromCache Pull the value from the cache entry.
	 * @param _toT Transform the value to the observable type.
	 * @param defaultValue Default value if no cache entry.
	 */
	constructor(
		private readonly _definitionId: string,
		private readonly _cache: McpServerMetadataCache,
		private readonly _fromStaticDefinition: IObservable<C | undefined> | undefined,
		private readonly _fromCache: (entry: IToolCacheEntry) => C,
		private readonly _toT: (values: C, reader: IDerivedReader<void>) => T,
		private readonly defaultValue: C,
	) { }

	public get fromCache(): { nonce: string | undefined; data: C } | undefined {
		const c = this._cache.get(this._definitionId);
		return c ? { data: this._fromCache(c), nonce: c.nonce } : undefined;
	}

	public hasStaticDefinition(reader: IReader | undefined) {
		return !!this._fromStaticDefinition?.read(reader);
	}

	public readonly fromServerPromise = observableValue<ObservablePromise<{
		readonly data: C;
		readonly nonce: string | undefined;
	}> | undefined>(this, undefined);

	private readonly fromServer = derived(reader => this.fromServerPromise.read(reader)?.promiseResult.read(reader)?.data);

	public readonly value: IObservable<T> = derived(reader => {
		const serverTools = this.fromServer.read(reader);
		const definitions = serverTools?.data ?? this._fromStaticDefinition?.read(reader) ?? this.fromCache?.data ?? this.defaultValue;
		return this._toT(definitions, reader);
	});
}

export class McpServer extends Disposable implements IMcpServer {
	/**
	 * Helper function to call the function on the handler once it's online. The
	 * connection started if it is not already.
	 */
	public static async callOn<R>(server: IMcpServer, fn: (handler: McpServerRequestHandler) => Promise<R>, token: CancellationToken = CancellationToken.None): Promise<R> {
		await server.start({ promptType: 'all-untrusted' }); // idempotent

		let ranOnce = false;
		let d: IDisposable;

		const callPromise = new Promise<R>((resolve, reject) => {

			d = autorun(reader => {
				const connection = server.connection.read(reader);
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

	public readonly collection: McpCollectionReference;
	private readonly _connectionSequencer = new Sequencer();
	private readonly _connection = this._register(disposableObservableValue<IMcpServerConnection | undefined>(this, undefined));

	public readonly connection = this._connection;
	public readonly connectionState: IObservable<McpConnectionState> = derived(reader => this._connection.read(reader)?.state.read(reader) ?? { state: McpConnectionState.Kind.Stopped });


	private readonly _capabilities: CachedPrimitive<number | undefined, number | undefined>;
	public get capabilities() {
		return this._capabilities.value;
	}

	private readonly _tools: CachedPrimitive<readonly IMcpTool[], readonly ValidatedMcpTool[]>;
	public get tools() {
		return this._tools.value;
	}

	private readonly _prompts: CachedPrimitive<readonly IMcpPrompt[], readonly StoredMcpPrompt[]>;
	public get prompts() {
		return this._prompts.value;
	}

	private readonly _serverMetadata: CachedPrimitive<ServerMetadata, StoredServerMetadata | undefined>;
	public get serverMetadata() {
		return this._serverMetadata.value;
	}

	public get trustedAtNonce() {
		return this._primitiveCache.get(this.definition.id)?.trustedAtNonce;
	}

	public set trustedAtNonce(nonce: string | undefined) {
		this._primitiveCache.store(this.definition.id, { trustedAtNonce: nonce });
	}

	private readonly _fullDefinitions: IObservable<{
		server: McpServerDefinition | undefined;
		collection: McpCollectionDefinition | undefined;
	}>;

	public readonly cacheState = derived(reader => {
		const currentNonce = () => this._fullDefinitions.read(reader)?.server?.cacheNonce;
		const stateWhenServingFromCache = () => {
			if (this._tools.hasStaticDefinition(reader)) {
				return McpServerCacheState.Cached;
			}

			if (!this._tools.fromCache) {
				return McpServerCacheState.Unknown;
			}

			return currentNonce() === this._tools.fromCache.nonce ? McpServerCacheState.Cached : McpServerCacheState.Outdated;
		};

		const fromServer = this._tools.fromServerPromise.read(reader);
		const connectionState = this.connectionState.read(reader);
		const isIdle = McpConnectionState.canBeStarted(connectionState.state) || !fromServer;
		if (isIdle) {
			return stateWhenServingFromCache();
		}

		const fromServerResult = fromServer?.promiseResult.read(reader);
		if (!fromServerResult) {
			return this._tools.fromCache ? McpServerCacheState.RefreshingFromCached : McpServerCacheState.RefreshingFromUnknown;
		}

		if (fromServerResult.error) {
			return stateWhenServingFromCache();
		}

		return fromServerResult.data?.nonce === currentNonce() ? McpServerCacheState.Live : McpServerCacheState.Outdated;
	});

	private readonly _loggerId: string;
	private readonly _logger: ILogger;
	private _lastModeDebugged = false;
	/** Count of running tool calls, used to detect if sampling is during an LM call */
	public runningToolCalls = new Set<IMcpToolCallContext>();

	constructor(
		initialCollection: McpCollectionDefinition,
		public readonly definition: McpDefinitionReference,
		explicitRoots: URI[] | undefined,
		private readonly _requiresExtensionActivation: boolean | undefined,
		private readonly _primitiveCache: McpServerMetadataCache,
		toolPrefix: string,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IWorkspaceContextService workspacesService: IWorkspaceContextService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IOutputService private readonly _outputService: IOutputService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IMcpSamplingService private readonly _samplingService: IMcpSamplingService,
		@IMcpElicitationService private readonly _elicitationService: IMcpElicitationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this.collection = initialCollection;
		this._fullDefinitions = this._mcpRegistry.getServerDefinition(this.collection, this.definition);
		this._loggerId = `mcpServer.${definition.id}`;
		this._logger = this._register(_loggerService.createLogger(this._loggerId, { hidden: true, name: `MCP: ${definition.label}` }));

		const that = this;
		this._register(this._instantiationService.createInstance(McpDevModeServerAttache, this, { get lastModeDebugged() { return that._lastModeDebugged; } }));

		// If the logger is disposed but not deregistered, then the disposed instance
		// is reused and no-ops. todo@sandy081 this seems like a bug.
		this._register(toDisposable(() => _loggerService.deregisterLogger(this._loggerId)));

		// 1. Reflect workspaces into the MCP roots
		const workspaces = explicitRoots
			? observableValue(this, explicitRoots.map(uri => ({ uri, name: basename(uri) })))
			: observableFromEvent(
				this,
				workspacesService.onDidChangeWorkspaceFolders,
				() => workspacesService.getWorkspace().folders,
			);

		const uriTransformer = environmentService.remoteAuthority ? createURITransformer(environmentService.remoteAuthority) : undefined;

		this._register(autorun(reader => {
			const cnx = this._connection.read(reader)?.handler.read(reader);
			if (!cnx) {
				return;
			}

			cnx.roots = workspaces.read(reader)
				.filter(w => w.uri.authority === (initialCollection.remoteAuthority || ''))
				.map(w => ({
					name: w.name,
					uri: URI.from(uriTransformer?.transformIncoming(w.uri) ?? w.uri).toString()
				}));
		}));

		// 2. Populate this.tools when we connect to a server.
		this._register(autorun(reader => {
			const cnx = this._connection.read(reader);
			const handler = cnx?.handler.read(reader);
			if (handler) {
				this._populateLiveData(handler, cnx?.definition.cacheNonce, reader.store);
			} else if (this._tools) {
				this.resetLiveData();
			}
		}));

		const staticMetadata = derived(reader => {
			const def = this._fullDefinitions.read(reader).server;
			return def && def.cacheNonce !== this._tools.fromCache?.nonce ? def.staticMetadata : undefined;
		});

		// 3. Publish tools
		this._tools = new CachedPrimitive<readonly IMcpTool[], readonly ValidatedMcpTool[]>(
			this.definition.id,
			this._primitiveCache,
			staticMetadata
				.map(m => {
					const tools = m?.tools?.filter(t => t.availability === McpServerStaticToolAvailability.Initial).map(t => t.definition);
					return tools?.length ? new ObservablePromise(this._getValidatedTools(tools)) : undefined;
				})
				.map((o, reader) => o?.promiseResult.read(reader)?.data),
			(entry) => entry.tools,
			(entry) => entry.map(def => new McpTool(this, toolPrefix, def)).sort((a, b) => a.compare(b)),
			[],
		);

		// 4. Publish prompts
		this._prompts = new CachedPrimitive<readonly IMcpPrompt[], readonly StoredMcpPrompt[]>(
			this.definition.id,
			this._primitiveCache,
			undefined,
			(entry) => entry.prompts || [],
			(entry) => entry.map(e => new McpPrompt(this, e)),
			[],
		);

		this._serverMetadata = new CachedPrimitive<ServerMetadata, StoredServerMetadata | undefined>(
			this.definition.id,
			this._primitiveCache,
			staticMetadata.map(m => m ? this._toStoredMetadata(m?.serverInfo, m?.instructions) : undefined),
			(entry) => ({ serverName: entry.serverName, serverInstructions: entry.serverInstructions, serverIcons: entry.serverIcons }),
			(entry) => ({ serverName: entry?.serverName, serverInstructions: entry?.serverInstructions, icons: McpIcons.fromStored(entry?.serverIcons) }),
			undefined,
		);

		this._capabilities = new CachedPrimitive<number | undefined, number | undefined>(
			this.definition.id,
			this._primitiveCache,
			staticMetadata.map(m => m?.capabilities !== undefined ? encodeCapabilities(m.capabilities) : undefined),
			(entry) => entry.capabilities,
			(entry) => entry,
			undefined,
		);
	}

	public readDefinitions(): IObservable<{ server: McpServerDefinition | undefined; collection: McpCollectionDefinition | undefined }> {
		return this._fullDefinitions;
	}

	public showOutput(preserveFocus?: boolean) {
		this._loggerService.setVisibility(this._loggerId, true);
		return this._outputService.showChannel(this._loggerId, preserveFocus);
	}

	public resources(token?: CancellationToken): AsyncIterable<IMcpResource[]> {
		const cts = new CancellationTokenSource(token);
		return new AsyncIterableProducer<IMcpResource[]>(async emitter => {
			await McpServer.callOn(this, async (handler) => {
				for await (const resource of handler.listResourcesIterable({}, cts.token)) {
					emitter.emitOne(resource.map(r => new McpResource(this, r, McpIcons.fromParsed(this._parseIcons(r)))));
					if (cts.token.isCancellationRequested) {
						return;
					}
				}
			});
		}, () => cts.dispose(true));
	}

	public resourceTemplates(token?: CancellationToken): Promise<IMcpResourceTemplate[]> {
		return McpServer.callOn(this, async (handler) => {
			const templates = await handler.listResourceTemplates({}, token);
			return templates.map(t => new McpResourceTemplate(this, t, McpIcons.fromParsed(this._parseIcons(t))));
		}, token);
	}

	public start({ interaction, autoTrustChanges, promptType, debug, errorOnUserInteraction }: IMcpServerStartOpts = {}): Promise<McpConnectionState> {
		interaction?.participants.set(this.definition.id, { s: 'unknown' });

		return this._connectionSequencer.queue<McpConnectionState>(async () => {
			const activationEvent = mcpActivationEvent(this.collection.id.slice(extensionMcpCollectionPrefix.length));
			if (this._requiresExtensionActivation && !this._extensionService.activationEventIsDone(activationEvent)) {
				await this._extensionService.activateByEvent(activationEvent);
				await Promise.all(this._mcpRegistry.delegates.get()
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
				this._lastModeDebugged = !!debug;
				const that = this;
				connection = await this._mcpRegistry.resolveConnection({
					interaction,
					autoTrustChanges,
					promptType,
					trustNonceBearer: {
						get trustedAtNonce() { return that.trustedAtNonce; },
						set trustedAtNonce(nonce: string | undefined) { that.trustedAtNonce = nonce; }
					},
					logger: this._logger,
					collectionRef: this.collection,
					definitionRef: this.definition,
					debug,
					errorOnUserInteraction,
				});
				if (!connection) {
					return { state: McpConnectionState.Kind.Stopped };
				}

				if (this._store.isDisposed) {
					connection.dispose();
					return { state: McpConnectionState.Kind.Stopped };
				}

				this._connection.set(connection, undefined);

				if (connection.definition.devMode) {
					this.showOutput();
				}
			}

			const start = Date.now();
			let state = await connection.start({
				createMessageRequestHandler: params => this._samplingService.sample({
					isDuringToolCall: this.runningToolCalls.size > 0,
					server: this,
					params,
				}).then(r => r.sample),
				elicitationRequestHandler: req => {
					const serverInfo = connection.handler.get()?.serverInfo;
					if (serverInfo) {
						this._telemetryService.publicLog2<ElicitationTelemetryData, ElicitationTelemetryClassification>('mcp.elicitationRequested', {
							serverName: serverInfo.name,
							serverVersion: serverInfo.version,
						});
					}

					return this._elicitationService.elicit(this, Iterable.first(this.runningToolCalls), req, CancellationToken.None);
				}
			});

			this._telemetryService.publicLog2<ServerBootState, ServerBootStateClassification>('mcp/serverBootState', {
				state: McpConnectionState.toKindString(state.state),
				time: Date.now() - start,
			});

			if (state.state === McpConnectionState.Kind.Error) {
				this.showInteractiveError(connection, state, debug);
			}

			// MCP servers that need auth can 'start' but will stop with an interaction-needed
			// error they first make a request. In this case, wait until the handler fully
			// initializes before resolving (throwing if it ends up needing auth)
			if (errorOnUserInteraction && state.state === McpConnectionState.Kind.Running) {
				let disposable: IDisposable;
				state = await new Promise<McpConnectionState>((resolve, reject) => {
					disposable = autorun(reader => {
						const handler = connection.handler.read(reader);
						if (handler) {
							resolve(state);
						}

						const s = connection.state.read(reader);
						if (s.state === McpConnectionState.Kind.Stopped && s.reason === 'needs-user-interaction') {
							reject(new UserInteractionRequiredError('auth'));
						}

						if (!McpConnectionState.isRunning(s)) {
							resolve(s);
						}
					});
				}).finally(() => disposable.dispose());
			}

			return state;
		}).finally(() => {
			interaction?.participants.set(this.definition.id, { s: 'resolved' });
		});
	}

	private showInteractiveError(cnx: IMcpServerConnection, error: McpConnectionState.Error, debug?: boolean) {
		if (error.code === 'ENOENT' && cnx.launchDefinition.type === McpServerTransportType.Stdio) {
			let docsLink: string | undefined;
			switch (cnx.launchDefinition.command) {
				case 'uvx':
					docsLink = `https://aka.ms/vscode-mcp-install/uvx`;
					break;
				case 'npx':
					docsLink = `https://aka.ms/vscode-mcp-install/npx`;
					break;
				case 'dnx':
					docsLink = `https://aka.ms/vscode-mcp-install/dnx`;
					break;
				case 'dotnet':
					docsLink = `https://aka.ms/vscode-mcp-install/dotnet`;
					break;
			}

			const options: IPromptChoice[] = [{
				label: localize('mcp.command.showOutput', "Show Output"),
				run: () => this.showOutput(),
			}];

			if (cnx.definition.devMode?.debug?.type === 'debugpy' && debug) {
				this._notificationService.prompt(Severity.Error, localize('mcpDebugPyHelp', 'The command "{0}" was not found. You can specify the path to debugpy in the `dev.debug.debugpyPath` option.', cnx.launchDefinition.command, cnx.definition.label), [...options, {
					label: localize('mcpViewDocs', 'View Docs'),
					run: () => this._openerService.open(URI.parse('https://aka.ms/vscode-mcp-install/debugpy')),
				}]);
				return;
			}

			if (docsLink) {
				options.push({
					label: localize('mcpServerInstall', 'Install {0}', cnx.launchDefinition.command),
					run: () => this._openerService.open(URI.parse(docsLink)),
				});
			}

			this._notificationService.prompt(Severity.Error, localize('mcpServerNotFound', 'The command "{0}" needed to run {1} was not found.', cnx.launchDefinition.command, cnx.definition.label), options);
		} else {
			this._notificationService.warn(localize('mcpServerError', 'The MCP server {0} could not be started: {1}', cnx.definition.label, error.message));
		}
	}

	public stop(): Promise<void> {
		return this._connection.get()?.stop() || Promise.resolve();
	}

	/** Waits for any ongoing tools to be refreshed before resolving. */
	public awaitToolRefresh() {
		return new Promise<void>(resolve => {
			autorunSelfDisposable(reader => {
				const promise = this._tools.fromServerPromise.read(reader);
				const result = promise?.promiseResult.read(reader);
				if (result) {
					resolve();
				}
			});
		});
	}

	private resetLiveData() {
		transaction(tx => {
			this._tools.fromServerPromise.set(undefined, tx);
			this._prompts.fromServerPromise.set(undefined, tx);
		});
	}

	private async _normalizeTool(originalTool: MCP.Tool): Promise<ValidatedMcpTool | { error: string[] }> {
		const tool: ValidatedMcpTool = {
			...originalTool,
			serverToolName: originalTool.name,
			_icons: this._parseIcons(originalTool),
		};
		if (!tool.description) {
			// Ensure a description is provided for each tool, #243919
			this._logger.warn(`Tool ${tool.name} does not have a description. Tools must be accurately described to be called`);
			tool.description = '<empty>';
		}

		if (toolInvalidCharRe.test(tool.name)) {
			this._logger.warn(`Tool ${JSON.stringify(tool.name)} is invalid. Tools names may only contain [a-z0-9_-]`);
			tool.name = tool.name.replace(toolInvalidCharRe, '_');
		}

		type JsonDiagnostic = { message: string; range: { line: number; character: number }[] };

		let diagnostics: JsonDiagnostic[] = [];
		const toolJson = JSON.stringify(tool.inputSchema);
		try {
			const schemaUri = URI.parse('https://json-schema.org/draft-07/schema');
			diagnostics = await this._commandService.executeCommand<JsonDiagnostic[]>('json.validate', schemaUri, toolJson) || [];
		} catch (e) {
			// ignored (error in json extension?);
		}

		if (!diagnostics.length) {
			return tool;
		}

		// because it's all one line from JSON.stringify, we can treat characters as offsets.
		const tree = json.parseTree(toolJson);
		const messages = diagnostics.map(d => {
			const node = json.findNodeAtOffset(tree, d.range[0].character);
			const path = node && `/${json.getNodePath(node).join('/')}`;
			return d.message + (path ? ` (at ${path})` : '');
		});

		return { error: messages };
	}

	private async _getValidatedTools(tools: MCP.Tool[]): Promise<ValidatedMcpTool[]> {
		let error = '';

		const validations = await Promise.all(tools.map(t => this._normalizeTool(t)));
		const validated: ValidatedMcpTool[] = [];
		for (const [i, result] of validations.entries()) {
			if ('error' in result) {
				error += localize('mcpBadSchema.tool', 'Tool `{0}` has invalid JSON parameters:', tools[i].name) + '\n';
				for (const message of result.error) {
					error += `\t- ${message}\n`;
				}
				error += `\t- Schema: ${JSON.stringify(tools[i].inputSchema)}\n\n`;
			} else {
				validated.push(result);
			}
		}

		if (error) {
			this._logger.warn(`${tools.length - validated.length} tools have invalid JSON schemas and will be omitted`);
			warnInvalidTools(this._instantiationService, this.definition.label, error);
		}

		return validated;
	}

	/**
	 * Parses incoming MCP icons and returns the resulting 'stored' record. Note
	 * that this requires an active MCP server connection since we validate
	 * against some of that connection's data. The icons may however be stored
	 * and rehydrated later.
	 */
	private _parseIcons(icons: MCP.Icons) {
		const cnx = this._connection.get();
		if (!cnx) {
			return [];
		}

		return parseAndValidateMcpIcon(icons, cnx.launchDefinition, this._logger);
	}

	private _setServerTools(nonce: string | undefined, toolsPromise: Promise<MCP.Tool[]>, tx: ITransaction | undefined) {
		const toolPromiseSafe = toolsPromise.then(async tools => {
			this._logger.info(`Discovered ${tools.length} tools`);
			const data = await this._getValidatedTools(tools);
			this._primitiveCache.store(this.definition.id, { tools: data, nonce });
			return { data, nonce };
		});
		this._tools.fromServerPromise.set(new ObservablePromise(toolPromiseSafe), tx);
		return toolPromiseSafe;
	}

	private _setServerPrompts(nonce: string | undefined, promptsPromise: Promise<MCP.Prompt[]>, tx: ITransaction | undefined) {
		const promptsPromiseSafe = promptsPromise.then((result): { data: StoredMcpPrompt[]; nonce: string | undefined } => {
			const data: StoredMcpPrompt[] = result.map(prompt => ({
				...prompt,
				_icons: this._parseIcons(prompt)
			}));
			this._primitiveCache.store(this.definition.id, { prompts: data, nonce });
			return { data, nonce };
		});

		this._prompts.fromServerPromise.set(new ObservablePromise(promptsPromiseSafe), tx);
		return promptsPromiseSafe;
	}

	private _toStoredMetadata(serverInfo?: MCP.Implementation, instructions?: string): StoredServerMetadata {
		return {
			serverName: serverInfo ? serverInfo.title || serverInfo.name : undefined,
			serverInstructions: instructions,
			serverIcons: serverInfo ? this._parseIcons(serverInfo) : undefined,
		};
	}

	private _setServerMetadata(
		nonce: string | undefined,
		{ serverInfo, instructions, capabilities }: { serverInfo: MCP.Implementation; instructions: string | undefined; capabilities: MCP.ServerCapabilities },
		tx: ITransaction | undefined,
	) {
		const serverMetadata: StoredServerMetadata = this._toStoredMetadata(serverInfo, instructions);
		this._serverMetadata.fromServerPromise.set(ObservablePromise.resolved({ nonce, data: serverMetadata }), tx);

		const capabilitiesEncoded = encodeCapabilities(capabilities);
		this._capabilities.fromServerPromise.set(ObservablePromise.resolved({ data: capabilitiesEncoded, nonce }), tx);
		this._primitiveCache.store(this.definition.id, { ...serverMetadata, nonce, capabilities: capabilitiesEncoded });
	}

	private _populateLiveData(handler: McpServerRequestHandler, cacheNonce: string | undefined, store: DisposableStore) {
		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		const updateTools = (tx: ITransaction | undefined) => {
			const toolPromise = handler.capabilities.tools ? handler.listTools({}, cts.token) : Promise.resolve([]);
			return this._setServerTools(cacheNonce, toolPromise, tx);
		};

		const updatePrompts = (tx: ITransaction | undefined) => {
			const promptsPromise = handler.capabilities.prompts ? handler.listPrompts({}, cts.token) : Promise.resolve([]);
			return this._setServerPrompts(cacheNonce, promptsPromise, tx);
		};

		store.add(handler.onDidChangeToolList(() => {
			this._logger.info('Tool list changed, refreshing tools...');
			updateTools(undefined);
		}));

		store.add(handler.onDidChangePromptList(() => {
			this._logger.info('Prompts list changed, refreshing prompts...');
			updatePrompts(undefined);
		}));

		transaction(tx => {
			this._setServerMetadata(cacheNonce, { serverInfo: handler.serverInfo, instructions: handler.serverInstructions, capabilities: handler.capabilities }, tx);
			updatePrompts(tx);
			const toolUpdate = updateTools(tx);

			toolUpdate.then(tools => {
				this._telemetryService.publicLog2<ServerBootData, ServerBootClassification>('mcp/serverBoot', {
					supportsLogging: !!handler.capabilities.logging,
					supportsPrompts: !!handler.capabilities.prompts,
					supportsResources: !!handler.capabilities.resources,
					toolCount: tools.data.length,
					serverName: handler.serverInfo.name,
					serverVersion: handler.serverInfo.version,
				});
			});
		});
	}
}

class McpPrompt implements IMcpPrompt {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly title?: string;
	readonly arguments: readonly MCP.PromptArgument[];
	readonly icons: IMcpIcons;

	constructor(
		private readonly _server: McpServer,
		private readonly _definition: StoredMcpPrompt,
	) {
		this.id = mcpPromptReplaceSpecialChars(this._server.definition.label + '.' + _definition.name);
		this.name = _definition.name;
		this.title = _definition.title;
		this.description = _definition.description;
		this.arguments = _definition.arguments || [];
		this.icons = McpIcons.fromStored(this._definition._icons);
	}

	async resolve(args: Record<string, string>, token?: CancellationToken): Promise<IMcpPromptMessage[]> {
		const result = await McpServer.callOn(this._server, h => h.getPrompt({ name: this._definition.name, arguments: args }, token), token);
		return result.messages;
	}

	async complete(argument: string, prefix: string, alreadyResolved: Record<string, string>, token?: CancellationToken): Promise<string[]> {
		const result = await McpServer.callOn(this._server, h => h.complete({
			ref: { type: 'ref/prompt', name: this._definition.name },
			argument: { name: argument, value: prefix },
			context: { arguments: alreadyResolved },
		}, token), token);
		return result.completion.values;
	}
}

function encodeCapabilities(cap: MCP.ServerCapabilities): McpCapability {
	let out = 0;
	if (cap.logging) { out |= McpCapability.Logging; }
	if (cap.completions) { out |= McpCapability.Completions; }
	if (cap.prompts) {
		out |= McpCapability.Prompts;
		if (cap.prompts.listChanged) {
			out |= McpCapability.PromptsListChanged;
		}
	}
	if (cap.resources) {
		out |= McpCapability.Resources;
		if (cap.resources.subscribe) {
			out |= McpCapability.ResourcesSubscribe;
		}
		if (cap.resources.listChanged) {
			out |= McpCapability.ResourcesListChanged;
		}
	}
	if (cap.tools) {
		out |= McpCapability.Tools;
		if (cap.tools.listChanged) {
			out |= McpCapability.ToolsListChanged;
		}
	}
	return out;
}

export class McpTool implements IMcpTool {

	readonly id: string;
	readonly referenceName: string;
	readonly icons: IMcpIcons;

	public get definition(): MCP.Tool { return this._definition; }

	constructor(
		private readonly _server: McpServer,
		idPrefix: string,
		private readonly _definition: ValidatedMcpTool,
	) {
		this.referenceName = _definition.name.replaceAll('.', '_');
		this.id = (idPrefix + _definition.name).replaceAll('.', '_').slice(0, McpToolName.MaxLength);
		this.icons = McpIcons.fromStored(this._definition._icons);
	}

	async call(params: Record<string, unknown>, context?: IMcpToolCallContext, token?: CancellationToken): Promise<MCP.CallToolResult> {
		// serverToolName is always set now, but older cache entries (from 1.99-Insiders) may not have it.
		const name = this._definition.serverToolName ?? this._definition.name;
		if (context) { this._server.runningToolCalls.add(context); }
		try {
			const meta: Record<string, unknown> = {};
			if (context?.chatSessionId) {
				meta['vscode.conversationId'] = context.chatSessionId;
			}
			if (context?.chatRequestId) {
				meta['vscode.requestId'] = context.chatRequestId;
			}

			const result = await McpServer.callOn(this._server, h => h.callTool({
				name,
				arguments: params,
				_meta: Object.keys(meta).length > 0 ? meta : undefined
			}, token), token);

			// Wait for tools to refresh for dynamic servers (#261611)
			await this._server.awaitToolRefresh();

			return result;
		} finally {
			if (context) { this._server.runningToolCalls.delete(context); }
		}
	}

	async callWithProgress(params: Record<string, unknown>, progress: ToolProgress, context?: IMcpToolCallContext, token?: CancellationToken): Promise<MCP.CallToolResult> {
		if (context) { this._server.runningToolCalls.add(context); }
		try {
			return await this._callWithProgress(params, progress, context, token);
		} finally {
			if (context) { this._server.runningToolCalls.delete(context); }
		}
	}

	_callWithProgress(params: Record<string, unknown>, progress: ToolProgress, context?: IMcpToolCallContext, token?: CancellationToken, allowRetry = true): Promise<MCP.CallToolResult> {
		// serverToolName is always set now, but older cache entries (from 1.99-Insiders) may not have it.
		const name = this._definition.serverToolName ?? this._definition.name;
		const progressToken = generateUuid();

		return McpServer.callOn(this._server, async h => {
			const listener = h.onDidReceiveProgressNotification((e) => {
				if (e.params.progressToken === progressToken) {
					progress.report({
						message: e.params.message,
						progress: e.params.total !== undefined && e.params.progress !== undefined ? e.params.progress / e.params.total : undefined,
					});
				}
			});

			const meta: Record<string, unknown> = { progressToken };
			if (context?.chatSessionId) {
				meta['vscode.conversationId'] = context.chatSessionId;
			}
			if (context?.chatRequestId) {
				meta['vscode.requestId'] = context.chatRequestId;
			}

			try {
				const result = await h.callTool({ name, arguments: params, _meta: meta }, token);
				// Wait for tools to refresh for dynamic servers (#261611)
				await this._server.awaitToolRefresh();

				return result;
			} catch (err) {
				const state = this._server.connectionState.get();
				if (allowRetry && state.state === McpConnectionState.Kind.Error && state.shouldRetry) {
					return this._callWithProgress(params, progress, context, token, false);
				} else {
					throw err;
				}
			} finally {
				listener.dispose();
			}
		}, token);
	}

	compare(other: IMcpTool): number {
		return this._definition.name.localeCompare(other.definition.name);
	}
}

function warnInvalidTools(instaService: IInstantiationService, serverName: string, errorText: string) {
	instaService.invokeFunction((accessor) => {
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(IEditorService);
		notificationService.notify({
			severity: Severity.Warning,
			message: localize('mcpBadSchema', 'MCP server `{0}` has tools with invalid parameters which will be omitted.', serverName),
			actions: {
				primary: [{
					class: undefined,
					enabled: true,
					id: 'mcpBadSchema.show',
					tooltip: '',
					label: localize('mcpBadSchema.show', 'Show'),
					run: () => {
						editorService.openEditor({
							resource: undefined,
							contents: errorText,
						});
					}
				}]
			}
		});
	});
}

class McpResource implements IMcpResource {
	readonly uri: URI;
	readonly mcpUri: string;
	readonly name: string;
	readonly description: string | undefined;
	readonly mimeType: string | undefined;
	readonly sizeInBytes: number | undefined;
	readonly title: string | undefined;

	constructor(
		server: McpServer,
		original: MCP.Resource,
		public readonly icons: IMcpIcons,
	) {
		this.mcpUri = original.uri;
		this.title = original.title;
		this.uri = McpResourceURI.fromServer(server.definition, original.uri);
		this.name = original.name;
		this.description = original.description;
		this.mimeType = original.mimeType;
		this.sizeInBytes = original.size;
	}
}

class McpResourceTemplate implements IMcpResourceTemplate {
	readonly name: string;
	readonly title?: string | undefined;
	readonly description?: string;
	readonly mimeType?: string;
	readonly template: UriTemplate;

	constructor(
		private readonly _server: McpServer,
		private readonly _definition: MCP.ResourceTemplate,
		public readonly icons: IMcpIcons,
	) {
		this.name = _definition.name;
		this.description = _definition.description;
		this.mimeType = _definition.mimeType;
		this.title = _definition.title;
		this.template = UriTemplate.parse(_definition.uriTemplate);
	}

	public resolveURI(vars: Record<string, unknown>): URI {
		const serverUri = this.template.resolve(vars);
		return McpResourceURI.fromServer(this._server.definition, serverUri);
	}

	async complete(templatePart: string, prefix: string, alreadyResolved: Record<string, string | string[]>, token?: CancellationToken): Promise<string[]> {
		const result = await McpServer.callOn(this._server, h => h.complete({
			ref: { type: 'ref/resource', uri: this._definition.uriTemplate },
			argument: { name: templatePart, value: prefix },
			context: {
				arguments: mapValues(alreadyResolved, v => Array.isArray(v) ? v.join('/') : v),
			},
		}, token), token);
		return result.completion.values;
	}
}
