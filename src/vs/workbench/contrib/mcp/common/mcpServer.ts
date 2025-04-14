/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer } from '../../../../base/common/async.js';
import * as json from '../../../../base/common/json.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { autorun, autorunWithStore, derived, disposableObservableValue, IObservable, ITransaction, observableFromEvent, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogger, ILoggerService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { mcpActivationEvent } from './mcpConfiguration.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { extensionMcpCollectionPrefix, IMcpServer, IMcpServerConnection, IMcpTool, McpCollectionReference, McpConnectionFailedError, McpConnectionState, McpDefinitionReference, McpServerDefinition, McpServerToolsState } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

type ServerBootData = {
	supportsLogging: boolean;
	supportsPrompts: boolean;
	supportsResources: boolean;
	toolCount: number;
};
type ServerBootClassification = {
	owner: 'connor4312';
	comment: 'Details the capabilities of the MCP server';
	supportsLogging: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the server supports logging' };
	supportsPrompts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the server supports prompts' };
	supportsResources: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the server supports resource' };
	toolCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of tools the server advertises' };
};

type ServerBootState = {
	state: string;
	time: number;
};
type ServerBootStateClassification = {
	owner: 'connor4312';
	comment: 'Details the capabilities of the MCP server';
	state: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The server outcome' };
	time: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Duration in milliseconds to reach that state' };
};

interface IToolCacheEntry {
	/** Cached tools so we can show what's available before it's started */
	readonly tools: readonly IValidatedMcpTool[];
}

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

	/** Resets the cache for tools and extension servers */
	reset() {
		this.cache.clear();
		this.extensionServers.clear();
		this.didChange = true;
	}

	/** Gets cached tools for a server (used before a server is running) */
	getTools(definitionId: string): readonly IValidatedMcpTool[] | undefined {
		return this.cache.get(definitionId)?.tools;
	}

	/** Sets cached tools for a server */
	storeTools(definitionId: string, tools: readonly IValidatedMcpTool[]): void {
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

interface IValidatedMcpTool extends MCP.Tool {
	/**
	 * Tool name as published by the MCP server. This may
	 * be different than the one in {@link definition} due to name normalization
	 * in {@link McpServer._getValidatedTools}.
	 */
	serverToolName: string;
}

export class McpServer extends Disposable implements IMcpServer {
	private readonly _connectionSequencer = new Sequencer();
	private readonly _connection = this._register(disposableObservableValue<IMcpServerConnection | undefined>(this, undefined));

	public readonly connection = this._connection;
	public readonly connectionState: IObservable<McpConnectionState> = derived(reader => this._connection.read(reader)?.state.read(reader) ?? { state: McpConnectionState.Kind.Stopped });

	private get toolsFromCache() {
		return this._toolCache.getTools(this.definition.id);
	}
	private readonly toolsFromServerPromise = observableValue<ObservablePromise<readonly IValidatedMcpTool[]> | undefined>(this, undefined);
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
		explicitRoots: URI[] | undefined,
		private readonly _requiresExtensionActivation: boolean | undefined,
		private readonly _toolCache: McpServerMetadataCache,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IWorkspaceContextService workspacesService: IWorkspaceContextService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IOutputService private readonly _outputService: IOutputService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._loggerId = `mcpServer.${definition.id}`;
		this._logger = this._register(_loggerService.createLogger(this._loggerId, { hidden: true, name: `MCP: ${definition.label}` }));
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

			const start = Date.now();
			const state = await connection.start();
			this._telemetryService.publicLog2<ServerBootState, ServerBootStateClassification>('mcp/serverBootState', {
				state: McpConnectionState.toKindString(state.state),
				time: Date.now() - start,
			});

			return state;
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

	private async _normalizeTool(originalTool: MCP.Tool): Promise<IValidatedMcpTool | { error: string[] }> {
		const tool: IValidatedMcpTool = { ...originalTool, serverToolName: originalTool.name };
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

	private async _getValidatedTools(handler: McpServerRequestHandler, tools: MCP.Tool[]): Promise<IValidatedMcpTool[]> {
		let error = '';

		const validations = await Promise.all(tools.map(t => this._normalizeTool(t)));
		const validated: IValidatedMcpTool[] = [];
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
			handler.logger.warn(`${tools.length - validated.length} tools have invalid JSON schemas and will be omitted`);
			warnInvalidTools(this._instantiationService, this.definition.label, error);
		}

		return validated;
	}

	private populateLiveData(handler: McpServerRequestHandler, store: DisposableStore) {
		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		// todo: add more than just tools here

		const updateTools = (tx: ITransaction | undefined) => {
			const toolPromise = handler.capabilities.tools ? handler.listTools({}, cts.token) : Promise.resolve([]);
			const toolPromiseSafe = toolPromise.then(async tools => {
				handler.logger.info(`Discovered ${tools.length} tools`);
				return this._getValidatedTools(handler, tools);
			});
			this.toolsFromServerPromise.set(new ObservablePromise(toolPromiseSafe), tx);

			return [toolPromise];
		};

		store.add(handler.onDidChangeToolList(() => {
			handler.logger.info('Tool list changed, refreshing tools...');
			updateTools(undefined);
		}));

		let promises: ReturnType<typeof updateTools>;
		transaction(tx => {
			promises = updateTools(tx);
		});

		Promise.all(promises!).then(([tools]) => {
			this._telemetryService.publicLog2<ServerBootData, ServerBootClassification>('mcp/serverBoot', {
				supportsLogging: !!handler.capabilities.logging,
				supportsPrompts: !!handler.capabilities.prompts,
				supportsResources: !!handler.capabilities.resources,
				toolCount: tools.length,
			});
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

	public get definition(): MCP.Tool { return this._definition; }

	constructor(
		private readonly _server: McpServer,
		idPrefix: string,
		private readonly _definition: IValidatedMcpTool,
	) {
		this.id = (idPrefix + _definition.name).replaceAll('.', '_');
	}

	call(params: Record<string, unknown>, token?: CancellationToken): Promise<MCP.CallToolResult> {
		// serverToolName is always set now, but older cache entries (from 1.99-Insiders) may not have it.
		const name = this._definition.serverToolName ?? this._definition.name;
		return this._server.callOn(h => h.callTool({ name, arguments: params }), token);
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
