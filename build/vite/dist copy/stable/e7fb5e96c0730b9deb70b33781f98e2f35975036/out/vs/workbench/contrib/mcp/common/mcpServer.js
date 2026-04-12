/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var McpServer_1;
import { AsyncIterableProducer, raceCancellationError, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Iterable } from '../../../../base/common/iterator.js';
import * as json from '../../../../base/common/json.js';
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { mapValues } from '../../../../base/common/objects.js';
import { autorun, autorunSelfDisposable, derived, disposableObservableValue, observableFromEvent, ObservablePromise, observableValue, transaction } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createURITransformer } from '../../../../base/common/uriTransformer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { chatSessionResourceToId } from '../../chat/common/model/chatUri.js';
import { mcpActivationEvent } from './mcpConfiguration.js';
import { McpDevModeServerAttache } from './mcpDevMode.js';
import { McpIcons, parseAndValidateMcpIcon } from './mcpIcons.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { IMcpSandboxService } from './mcpSandboxService.js';
import { McpTaskManager } from './mcpTaskManager.js';
import { extensionMcpCollectionPrefix, IMcpElicitationService, IMcpSamplingService, McpConnectionFailedError, McpConnectionState, mcpPromptReplaceSpecialChars, McpResourceURI, MpcResponseError, UserInteractionRequiredError } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';
import { UriTemplate } from './uriTemplate.js';
const emptyToolEntry = {
    serverName: undefined,
    serverIcons: [],
    serverInstructions: undefined,
    trustedAtNonce: undefined,
    nonce: undefined,
    tools: [],
    prompts: undefined,
    capabilities: undefined,
};
const toolInvalidCharRe = /[^a-z0-9_-]/gi;
let McpServerMetadataCache = class McpServerMetadataCache extends Disposable {
    constructor(scope, storageService) {
        super();
        this.didChange = false;
        this.cache = new LRUCache(128);
        this.extensionServers = new Map();
        const storageKey = 'mcpToolCache';
        this._register(storageService.onWillSaveState(() => {
            if (this.didChange) {
                storageService.store(storageKey, {
                    extensionServers: [...this.extensionServers],
                    serverTools: this.cache.toJSON(),
                }, scope, 1 /* StorageTarget.MACHINE */);
                this.didChange = false;
            }
        }));
        try {
            const cached = storageService.getObject(storageKey, scope);
            this.extensionServers = new Map(cached?.extensionServers ?? []);
            cached?.serverTools?.forEach(([k, v]) => this.cache.set(k, v));
        }
        catch {
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
    get(definitionId) {
        return this.cache.get(definitionId);
    }
    /** Sets cached primitives for a server */
    store(definitionId, entry) {
        const prev = this.get(definitionId) || emptyToolEntry;
        this.cache.set(definitionId, { ...prev, ...entry });
        this.didChange = true;
    }
    /** Gets cached servers for a collection (used for extensions, before the extension activates) */
    getServers(collectionId) {
        return this.extensionServers.get(collectionId);
    }
    /** Sets cached servers for a collection */
    storeServers(collectionId, entry) {
        if (entry) {
            this.extensionServers.set(collectionId, entry);
        }
        else {
            this.extensionServers.delete(collectionId);
        }
        this.didChange = true;
    }
};
McpServerMetadataCache = __decorate([
    __param(1, IStorageService)
], McpServerMetadataCache);
export { McpServerMetadataCache };
class CachedPrimitive {
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
    constructor(_definitionId, _cache, _fromStaticDefinition, _fromCache, _toT, defaultValue) {
        this._definitionId = _definitionId;
        this._cache = _cache;
        this._fromStaticDefinition = _fromStaticDefinition;
        this._fromCache = _fromCache;
        this._toT = _toT;
        this.defaultValue = defaultValue;
        this.fromServerPromise = observableValue(this, undefined);
        this.fromServer = derived(reader => this.fromServerPromise.read(reader)?.promiseResult.read(reader)?.data);
        this.value = derived(reader => {
            const serverTools = this.fromServer.read(reader);
            const definitions = serverTools?.data ?? this._fromStaticDefinition?.read(reader) ?? this.fromCache?.data ?? this.defaultValue;
            return this._toT(definitions, reader);
        });
    }
    get fromCache() {
        const c = this._cache.get(this._definitionId);
        return c ? { data: this._fromCache(c), nonce: c.nonce } : undefined;
    }
    hasStaticDefinition(reader) {
        return !!this._fromStaticDefinition?.read(reader);
    }
}
let McpServer = McpServer_1 = class McpServer extends Disposable {
    /**
     * Helper function to call the function on the handler once it's online. The
     * connection started if it is not already.
     */
    static async callOn(server, fn, token = CancellationToken.None) {
        await server.start({ promptType: 'all-untrusted' }); // idempotent
        let ranOnce = false;
        let d;
        const callPromise = new Promise((resolve, reject) => {
            d = autorun(reader => {
                const connection = server.connection.read(reader);
                if (!connection || ranOnce) {
                    return;
                }
                const handler = connection.handler.read(reader);
                if (!handler) {
                    const state = connection.state.read(reader);
                    if (state.state === 3 /* McpConnectionState.Kind.Error */) {
                        reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
                        return;
                    }
                    else if (state.state === 0 /* McpConnectionState.Kind.Stopped */) {
                        reject(new McpConnectionFailedError('MCP server has stopped'));
                        return;
                    }
                    else {
                        // keep waiting for handler
                        return;
                    }
                }
                resolve(fn(handler, connection));
                ranOnce = true; // aggressive prevent multiple racey calls, don't dispose because autorun is sync
            });
        });
        return raceCancellationError(callPromise, token).finally(() => d.dispose());
    }
    get capabilities() {
        return this._capabilities.value;
    }
    get tools() {
        return this._tools.value;
    }
    get prompts() {
        return this._prompts.value;
    }
    get serverMetadata() {
        return this._serverMetadata.value;
    }
    get trustedAtNonce() {
        return this._primitiveCache.get(this.definition.id)?.trustedAtNonce;
    }
    set trustedAtNonce(nonce) {
        this._primitiveCache.store(this.definition.id, { trustedAtNonce: nonce });
    }
    get logger() {
        return this._logger;
    }
    constructor(initialCollection, definition, explicitRoots, _requiresExtensionActivation, _primitiveCache, toolPrefix, enablementModel, _mcpRegistry, workspacesService, _extensionService, _loggerService, _outputService, _telemetryService, _commandService, _instantiationService, _dialogService, _notificationService, _openerService, _samplingService, _elicitationService, _mcpSandboxService, environmentService) {
        super();
        this.definition = definition;
        this._requiresExtensionActivation = _requiresExtensionActivation;
        this._primitiveCache = _primitiveCache;
        this._mcpRegistry = _mcpRegistry;
        this._extensionService = _extensionService;
        this._loggerService = _loggerService;
        this._outputService = _outputService;
        this._telemetryService = _telemetryService;
        this._commandService = _commandService;
        this._instantiationService = _instantiationService;
        this._dialogService = _dialogService;
        this._notificationService = _notificationService;
        this._openerService = _openerService;
        this._samplingService = _samplingService;
        this._elicitationService = _elicitationService;
        this._mcpSandboxService = _mcpSandboxService;
        /** Shared task manager that survives reconnections */
        this._taskManager = this._register(new McpTaskManager());
        this._connectionSequencer = new Sequencer();
        this._connection = this._register(disposableObservableValue(this, undefined));
        this.connection = this._connection;
        this.connectionState = derived(reader => this._connection.read(reader)?.state.read(reader) ?? { state: 0 /* McpConnectionState.Kind.Stopped */ });
        this.cacheState = derived(reader => {
            const currentNonce = () => this._fullDefinitions.read(reader)?.server?.cacheNonce;
            const stateWhenServingFromCache = () => {
                if (this._tools.hasStaticDefinition(reader)) {
                    return 1 /* McpServerCacheState.Cached */;
                }
                if (!this._tools.fromCache) {
                    return 0 /* McpServerCacheState.Unknown */;
                }
                return currentNonce() === this._tools.fromCache.nonce ? 1 /* McpServerCacheState.Cached */ : 2 /* McpServerCacheState.Outdated */;
            };
            const fromServer = this._tools.fromServerPromise.read(reader);
            const connectionState = this.connectionState.read(reader);
            const isIdle = McpConnectionState.canBeStarted(connectionState.state) || !fromServer;
            if (isIdle) {
                return stateWhenServingFromCache();
            }
            const fromServerResult = fromServer?.promiseResult.read(reader);
            if (!fromServerResult) {
                return this._tools.fromCache ? 4 /* McpServerCacheState.RefreshingFromCached */ : 3 /* McpServerCacheState.RefreshingFromUnknown */;
            }
            if (fromServerResult.error) {
                return stateWhenServingFromCache();
            }
            return fromServerResult.data?.nonce === currentNonce() ? 5 /* McpServerCacheState.Live */ : 2 /* McpServerCacheState.Outdated */;
        });
        this._lastModeDebugged = false;
        this._isQuietStart = false;
        this._isSandboxSuggestionDialogVisible = false;
        this._potentialSandboxBlocks = [];
        this._potentialSandboxBlockListener = this._register(new MutableDisposable());
        /** Count of running tool calls, used to detect if sampling is during an LM call */
        this.runningToolCalls = new Set();
        this.collection = initialCollection;
        this._fullDefinitions = this._mcpRegistry.getServerDefinition(this.collection, this.definition);
        this.enablement = derived(r => enablementModel.readEnabled(definition.id, r));
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
            : observableFromEvent(this, workspacesService.onDidChangeWorkspaceFolders, () => workspacesService.getWorkspace().folders);
        const uriTransformer = environmentService.remoteAuthority ? createURITransformer(environmentService.remoteAuthority) : undefined;
        this._register(autorun(reader => {
            const cnx = this._connection.read(reader)?.handler.read(reader);
            if (!cnx) {
                return;
            }
            cnx.roots = workspaces.read(reader)
                .filter(w => w.uri.authority === (initialCollection.remoteAuthority || ''))
                .map(w => {
                let uri = URI.from(uriTransformer?.transformIncoming(w.uri) ?? w.uri);
                if (uri.scheme === Schemas.file) { // #271812
                    uri = URI.file(normalizeDriveLetter(uri.fsPath, true));
                }
                return { name: w.name, uri: uri.toString() };
            });
        }));
        // 2. Populate this.tools when we connect to a server.
        this._register(autorun(reader => {
            const cnx = this._connection.read(reader);
            const handler = cnx?.handler.read(reader);
            if (handler) {
                this._populateLiveData(handler, cnx?.definition.cacheNonce, reader.store);
            }
            else if (this._tools) {
                this.resetLiveData();
            }
        }));
        this._register(autorun(reader => {
            const cnx = this._connection.read(reader);
            this._potentialSandboxBlockListener.value = cnx?.onPotentialSandboxBlock(block => this.recordPotentialSandboxBlock(block));
        }));
        const staticMetadata = derived(reader => {
            const def = this._fullDefinitions.read(reader).server;
            return def && def.cacheNonce !== this._tools.fromCache?.nonce ? def.staticMetadata : undefined;
        });
        // 3. Publish tools
        this._tools = new CachedPrimitive(this.definition.id, this._primitiveCache, staticMetadata
            .map(m => {
            const tools = m?.tools?.filter(t => t.availability === 0 /* McpServerStaticToolAvailability.Initial */).map(t => t.definition);
            return tools?.length ? new ObservablePromise(this._getValidatedTools(tools)) : undefined;
        })
            .map((o, reader) => o?.promiseResult.read(reader)?.data), (entry) => entry.tools, (entry) => entry.map(def => this._instantiationService.createInstance(McpTool, this, toolPrefix, def)).sort((a, b) => a.compare(b)), []);
        // 4. Publish prompts
        this._prompts = new CachedPrimitive(this.definition.id, this._primitiveCache, undefined, (entry) => entry.prompts || [], (entry) => entry.map(e => new McpPrompt(this, e)), []);
        this._serverMetadata = new CachedPrimitive(this.definition.id, this._primitiveCache, staticMetadata.map(m => m ? this._toStoredMetadata(m?.serverInfo, m?.instructions) : undefined), (entry) => ({ serverName: entry.serverName, serverInstructions: entry.serverInstructions, serverIcons: entry.serverIcons }), (entry) => ({ serverName: entry?.serverName, serverInstructions: entry?.serverInstructions, icons: McpIcons.fromStored(entry?.serverIcons) }), undefined);
        this._capabilities = new CachedPrimitive(this.definition.id, this._primitiveCache, staticMetadata.map(m => m?.capabilities !== undefined ? encodeCapabilities(m.capabilities) : undefined), (entry) => entry.capabilities, (entry) => entry, undefined);
    }
    readDefinitions() {
        return this._fullDefinitions;
    }
    showOutput(preserveFocus) {
        this._loggerService.setVisibility(this._loggerId, true);
        return this._outputService.showChannel(this._loggerId, preserveFocus);
    }
    resources(token) {
        const cts = new CancellationTokenSource(token);
        return new AsyncIterableProducer(async (emitter) => {
            await McpServer_1.callOn(this, async (handler) => {
                for await (const resource of handler.listResourcesIterable({}, cts.token)) {
                    emitter.emitOne(resource.map(r => new McpResource(this, r, McpIcons.fromParsed(this._parseIcons(r)))));
                    if (cts.token.isCancellationRequested) {
                        return;
                    }
                }
            });
        }, () => cts.dispose(true));
    }
    resourceTemplates(token) {
        return McpServer_1.callOn(this, async (handler) => {
            const templates = await handler.listResourceTemplates({}, token);
            return templates.map(t => new McpResourceTemplate(this, t, McpIcons.fromParsed(this._parseIcons(t))));
        }, token);
    }
    start({ interaction, autoTrustChanges, promptType, debug, errorOnUserInteraction } = {}) {
        interaction?.participants.set(this.definition.id, { s: 'unknown' });
        return this._connectionSequencer.queue(async () => {
            const activationEvent = mcpActivationEvent(this.collection.id.slice(extensionMcpCollectionPrefix.length));
            if (this._requiresExtensionActivation && !this._extensionService.activationEventIsDone(activationEvent)) {
                await this._extensionService.activateByEvent(activationEvent);
                await Promise.all(this._mcpRegistry.delegates.get()
                    .map(r => r.waitForInitialProviderPromises()));
                // This can happen if the server was created from a cached MCP server seen
                // from an extension, but then it wasn't registered when the extension activated.
                if (this._store.isDisposed) {
                    return { state: 0 /* McpConnectionState.Kind.Stopped */ };
                }
            }
            let connection = this._connection.get();
            this._isQuietStart = !!errorOnUserInteraction;
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
                        set trustedAtNonce(nonce) { that.trustedAtNonce = nonce; }
                    },
                    logger: this._logger,
                    collectionRef: this.collection,
                    definitionRef: this.definition,
                    debug,
                    errorOnUserInteraction,
                    taskManager: this._taskManager,
                });
                if (!connection) {
                    return { state: 0 /* McpConnectionState.Kind.Stopped */ };
                }
                if (this._store.isDisposed) {
                    connection.dispose();
                    return { state: 0 /* McpConnectionState.Kind.Stopped */ };
                }
                this._connection.set(connection, undefined);
                if (connection.definition.devMode) {
                    this.showOutput();
                }
            }
            this._potentialSandboxBlocks.length = 0;
            const start = Date.now();
            let state = await connection.start({
                createMessageRequestHandler: (params, token) => this._samplingService.sample({
                    isDuringToolCall: this.runningToolCalls.size > 0,
                    server: this,
                    params,
                }, token).then(r => r.sample),
                elicitationRequestHandler: async (req, token) => {
                    const serverInfo = connection.handler.get()?.serverInfo;
                    if (serverInfo) {
                        this._telemetryService.publicLog2('mcp.elicitationRequested', {
                            serverName: serverInfo.name,
                            serverVersion: serverInfo.version,
                        });
                    }
                    const r = await this._elicitationService.elicit(this, Iterable.first(this.runningToolCalls), req, token || CancellationToken.None);
                    r.dispose();
                    return r.value;
                }
            });
            this._telemetryService.publicLog2('mcp/serverBootState', {
                state: McpConnectionState.toKindString(state.state),
                time: Date.now() - start,
            });
            // MCP servers that need auth can 'start' but will stop with an interaction-needed
            // error they first make a request. In this case, wait until the handler fully
            // initializes before resolving (throwing if it ends up needing auth)
            if (errorOnUserInteraction && state.state === 2 /* McpConnectionState.Kind.Running */) {
                let disposable;
                state = await new Promise((resolve, reject) => {
                    disposable = autorun(reader => {
                        const handler = connection.handler.read(reader);
                        if (handler) {
                            resolve(state);
                        }
                        const s = connection.state.read(reader);
                        if (s.state === 0 /* McpConnectionState.Kind.Stopped */ && s.reason === 'needs-user-interaction') {
                            reject(new UserInteractionRequiredError('auth'));
                        }
                        if (!McpConnectionState.isRunning(s)) {
                            resolve(s);
                        }
                    });
                }).finally(() => disposable.dispose());
            }
            if (state.state === 3 /* McpConnectionState.Kind.Error */) {
                let disposable;
                state = await new Promise((resolve, reject) => {
                    disposable = autorun(reader => {
                        const cnx = this._connection.read(reader);
                        const state = cnx?.state.read(reader);
                        if (cnx && state?.state === 3 /* McpConnectionState.Kind.Error */) {
                            if (!this._isQuietStart) {
                                this.showInteractiveError(cnx, state, this._lastModeDebugged);
                            }
                            else {
                                reject(new UserInteractionRequiredError('start'));
                            }
                        }
                    });
                }).finally(() => disposable.dispose());
            }
            return state;
        }).finally(() => {
            interaction?.participants.set(this.definition.id, { s: 'resolved' });
        });
    }
    showInteractiveError(cnx, error, debug) {
        if (cnx.definition.sandboxEnabled) {
            if (!this.showSandboxConfigSuggestionFromPotentialBlocks(cnx, this._potentialSandboxBlocks)) {
                this._notificationService.warn(localize('mcpServerError', 'The MCP server {0} could not be started: {1}', cnx.definition.label, error.message));
            }
            return;
        }
        if (error.code === 'ENOENT' && cnx.launchDefinition.type === 1 /* McpServerTransportType.Stdio */) {
            let docsLink;
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
            const options = [{
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
        }
        else {
            this._notificationService.warn(localize('mcpServerError', 'The MCP server {0} could not be started: {1}', cnx.definition.label, error.message));
        }
    }
    showSandboxConfigSuggestionFromPotentialBlocks(cnx, potentialBlocks) {
        if (!cnx.definition.sandboxEnabled || !potentialBlocks.length || this._isSandboxSuggestionDialogVisible) {
            return false;
        }
        if (this._isQuietStart) {
            throw new UserInteractionRequiredError('sandbox-suggestion');
        }
        const existingSandboxConfig = this._fullDefinitions.get().collection?.sandbox;
        const suggestion = this._mcpSandboxService.getSandboxConfigSuggestionMessage(cnx.definition.label, potentialBlocks, existingSandboxConfig);
        if (!suggestion) {
            // clear potential blocks as there are no suggestions for them.
            this._removePotentialSandboxBlocks(potentialBlocks);
            return false;
        }
        this._confirmAndApplySandboxConfigSuggestion(cnx, potentialBlocks, suggestion);
        return true;
    }
    _confirmAndApplySandboxConfigSuggestion(cnx, potentialBlocks, suggestion) {
        const mcpResource = cnx.definition.presentation?.origin?.uri ?? this.collection.presentation?.origin;
        const configTarget = this._fullDefinitions.get().collection?.configTarget;
        this._isSandboxSuggestionDialogVisible = true;
        void this._dialogService.confirm({
            type: 'warning',
            message: localize('mcpSandboxSuggestion.confirm.message', "Update sandbox configuration in mcp.json for {0}?", cnx.definition.label),
            detail: suggestion.message,
            primaryButton: localize('mcpSandboxSuggestion.confirm.yes', "Yes"),
            cancelButton: localize('mcpSandboxSuggestion.confirm.no', "No"),
        }).then(async (result) => {
            if (!result.confirmed) {
                return;
            }
            if (!mcpResource || configTarget === undefined) {
                this._notificationService.warn(localize('mcpSandboxSuggestion.apply.unavailable', "Couldn't determine where to update sandbox configuration for {0}.", cnx.definition.label));
                return;
            }
            try {
                const updated = await this._mcpSandboxService.applySandboxConfigSuggestion(cnx.definition, mcpResource, configTarget, potentialBlocks, suggestion.sandboxConfig);
                if (updated) {
                    this._removePotentialSandboxBlocks(potentialBlocks);
                    this._notificationService.info(localize('mcpSandboxSuggestion.apply.success', "Updated sandbox configuration for {0} in mcp.json. Restart server.", cnx.definition.label));
                }
            }
            catch (e) {
                this._notificationService.error(localize('mcpSandboxSuggestion.apply.error', "Failed to update sandbox configuration for {0}: {1}", cnx.definition.label, e instanceof Error ? e.message : String(e)));
            }
        }).finally(() => {
            this._isSandboxSuggestionDialogVisible = false;
        });
    }
    recordPotentialSandboxBlock(block) {
        this._potentialSandboxBlocks.push(block);
        if (this._potentialSandboxBlocks.length > 200) {
            this._potentialSandboxBlocks.splice(0, this._potentialSandboxBlocks.length - 200);
        }
        const connection = this._connection.get();
        if (connection?.state.get().state === 2 /* McpConnectionState.Kind.Running */) {
            this.showSandboxConfigSuggestionFromPotentialBlocks(connection, this._potentialSandboxBlocks);
        }
    }
    _removePotentialSandboxBlocks(blocks) {
        if (!blocks.length || !this._potentialSandboxBlocks.length) {
            return;
        }
        const toRemove = new Set(blocks);
        this._potentialSandboxBlocks = this._potentialSandboxBlocks.filter(block => !toRemove.has(block));
    }
    stop() {
        return this._connection.get()?.stop() || Promise.resolve();
    }
    /** Waits for any ongoing tools to be refreshed before resolving. */
    awaitToolRefresh() {
        return new Promise(resolve => {
            autorunSelfDisposable(reader => {
                const promise = this._tools.fromServerPromise.read(reader);
                const result = promise?.promiseResult.read(reader);
                if (result) {
                    resolve();
                }
            });
        });
    }
    resetLiveData() {
        transaction(tx => {
            this._tools.fromServerPromise.set(undefined, tx);
            this._prompts.fromServerPromise.set(undefined, tx);
        });
    }
    async _normalizeTool(originalTool) {
        // Parse MCP Apps UI metadata from _meta.ui
        const uiMeta = originalTool._meta?.ui;
        // Compute visibility from _meta.ui.visibility, defaulting to Model | App
        let visibility = 1 /* McpToolVisibility.Model */ | 2 /* McpToolVisibility.App */;
        if (uiMeta?.visibility && Array.isArray(uiMeta.visibility)) {
            visibility &= 0;
            if (uiMeta.visibility.includes('model')) {
                visibility |= 1 /* McpToolVisibility.Model */;
            }
            if (uiMeta.visibility.includes('app')) {
                visibility |= 2 /* McpToolVisibility.App */;
            }
        }
        const tool = {
            ...originalTool,
            serverToolName: originalTool.name,
            _icons: this._parseIcons(originalTool),
            visibility,
            uiResourceUri: uiMeta?.resourceUri,
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
        // Per MCP spec, properties is optional. But JSON Schema Draft 7 requires
        // it for object types. Normalize the schema to include an empty properties
        // object if not present. https://github.com/microsoft/vscode/issues/251723
        if (tool.inputSchema && !tool.inputSchema.properties) {
            tool.inputSchema = { ...tool.inputSchema, properties: {} };
        }
        let diagnostics = [];
        const toolJson = JSON.stringify(tool.inputSchema);
        try {
            const schemaUri = URI.parse('https://json-schema.org/draft-07/schema');
            diagnostics = await this._commandService.executeCommand('json.validate', schemaUri, toolJson) || [];
        }
        catch (e) {
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
    async _getValidatedTools(tools) {
        let error = '';
        const validations = await Promise.all(tools.map(t => this._normalizeTool(t)));
        const validated = [];
        for (const [i, result] of validations.entries()) {
            if ('error' in result) {
                error += localize('mcpBadSchema.tool', 'Tool `{0}` has invalid JSON parameters:', tools[i].name) + '\n';
                for (const message of result.error) {
                    error += `\t- ${message}\n`;
                }
                error += `\t- Schema: ${JSON.stringify(tools[i].inputSchema)}\n\n`;
            }
            else {
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
    _parseIcons(icons) {
        const cnx = this._connection.get();
        if (!cnx) {
            return [];
        }
        return parseAndValidateMcpIcon(icons, cnx.launchDefinition, this._logger);
    }
    _setServerTools(nonce, toolsPromise, tx) {
        const toolPromiseSafe = toolsPromise.then(async (tools) => {
            this._logger.info(`Discovered ${tools.length} tools`);
            const data = await this._getValidatedTools(tools);
            this._primitiveCache.store(this.definition.id, { tools: data, nonce });
            return { data, nonce };
        });
        this._tools.fromServerPromise.set(new ObservablePromise(toolPromiseSafe), tx);
        return toolPromiseSafe;
    }
    _setServerPrompts(nonce, promptsPromise, tx) {
        const promptsPromiseSafe = promptsPromise.then((result) => {
            const data = result.map(prompt => ({
                ...prompt,
                _icons: this._parseIcons(prompt)
            }));
            this._primitiveCache.store(this.definition.id, { prompts: data, nonce });
            return { data, nonce };
        });
        this._prompts.fromServerPromise.set(new ObservablePromise(promptsPromiseSafe), tx);
        return promptsPromiseSafe;
    }
    _toStoredMetadata(serverInfo, instructions) {
        return {
            serverName: serverInfo ? serverInfo.title || serverInfo.name : undefined,
            serverInstructions: instructions,
            serverIcons: serverInfo ? this._parseIcons(serverInfo) : undefined,
        };
    }
    _setServerMetadata(nonce, { serverInfo, instructions, capabilities }, tx) {
        const serverMetadata = this._toStoredMetadata(serverInfo, instructions);
        this._serverMetadata.fromServerPromise.set(ObservablePromise.resolved({ nonce, data: serverMetadata }), tx);
        const capabilitiesEncoded = encodeCapabilities(capabilities);
        this._capabilities.fromServerPromise.set(ObservablePromise.resolved({ data: capabilitiesEncoded, nonce }), tx);
        this._primitiveCache.store(this.definition.id, { ...serverMetadata, nonce, capabilities: capabilitiesEncoded });
    }
    _populateLiveData(handler, cacheNonce, store) {
        const cts = new CancellationTokenSource();
        store.add(toDisposable(() => cts.dispose(true)));
        const updateTools = (tx) => {
            const toolPromise = handler.capabilities.tools ? handler.listTools({}, cts.token) : Promise.resolve([]);
            return this._setServerTools(cacheNonce, toolPromise, tx);
        };
        const updatePrompts = (tx) => {
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
                this._telemetryService.publicLog2('mcp/serverBoot', {
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
};
McpServer = McpServer_1 = __decorate([
    __param(7, IMcpRegistry),
    __param(8, IWorkspaceContextService),
    __param(9, IExtensionService),
    __param(10, ILoggerService),
    __param(11, IOutputService),
    __param(12, ITelemetryService),
    __param(13, ICommandService),
    __param(14, IInstantiationService),
    __param(15, IDialogService),
    __param(16, INotificationService),
    __param(17, IOpenerService),
    __param(18, IMcpSamplingService),
    __param(19, IMcpElicitationService),
    __param(20, IMcpSandboxService),
    __param(21, IWorkbenchEnvironmentService)
], McpServer);
export { McpServer };
class McpPrompt {
    constructor(_server, _definition) {
        this._server = _server;
        this._definition = _definition;
        this.id = mcpPromptReplaceSpecialChars(this._server.definition.label + '.' + _definition.name);
        this.name = _definition.name;
        this.title = _definition.title;
        this.description = _definition.description;
        this.arguments = _definition.arguments || [];
        this.icons = McpIcons.fromStored(this._definition._icons);
    }
    async resolve(args, token) {
        const result = await McpServer.callOn(this._server, h => h.getPrompt({ name: this._definition.name, arguments: args }, token), token);
        return result.messages;
    }
    async complete(argument, prefix, alreadyResolved, token) {
        const result = await McpServer.callOn(this._server, h => h.complete({
            ref: { type: 'ref/prompt', name: this._definition.name },
            argument: { name: argument, value: prefix },
            context: { arguments: alreadyResolved },
        }, token), token);
        return result.completion.values;
    }
}
function encodeCapabilities(cap) {
    let out = 0;
    if (cap.logging) {
        out |= 1 /* McpCapability.Logging */;
    }
    if (cap.completions) {
        out |= 2 /* McpCapability.Completions */;
    }
    if (cap.prompts) {
        out |= 4 /* McpCapability.Prompts */;
        if (cap.prompts.listChanged) {
            out |= 8 /* McpCapability.PromptsListChanged */;
        }
    }
    if (cap.resources) {
        out |= 16 /* McpCapability.Resources */;
        if (cap.resources.subscribe) {
            out |= 32 /* McpCapability.ResourcesSubscribe */;
        }
        if (cap.resources.listChanged) {
            out |= 64 /* McpCapability.ResourcesListChanged */;
        }
    }
    if (cap.tools) {
        out |= 128 /* McpCapability.Tools */;
        if (cap.tools.listChanged) {
            out |= 256 /* McpCapability.ToolsListChanged */;
        }
    }
    return out;
}
let McpTool = class McpTool {
    get definition() { return this._definition; }
    get uiResourceUri() { return this._definition.uiResourceUri; }
    constructor(_server, idPrefix, _definition, _elicitationService) {
        this._server = _server;
        this._definition = _definition;
        this._elicitationService = _elicitationService;
        this.referenceName = _definition.name.replaceAll('.', '_');
        this.id = (idPrefix + _definition.name).replaceAll('.', '_').slice(0, 64 /* McpToolName.MaxLength */);
        this.icons = McpIcons.fromStored(this._definition._icons);
        this.visibility = _definition.visibility ?? (1 /* McpToolVisibility.Model */ | 2 /* McpToolVisibility.App */);
    }
    async call(params, context, token) {
        if (context) {
            this._server.runningToolCalls.add(context);
        }
        try {
            return await this._callWithProgress(params, undefined, context, token);
        }
        finally {
            if (context) {
                this._server.runningToolCalls.delete(context);
            }
        }
    }
    async callWithProgress(params, progress, context, token) {
        if (context) {
            this._server.runningToolCalls.add(context);
        }
        try {
            return await this._callWithProgress(params, progress, context, token);
        }
        finally {
            if (context) {
                this._server.runningToolCalls.delete(context);
            }
        }
    }
    _callWithProgress(params, progress, context, token = CancellationToken.None, allowRetry = true) {
        // serverToolName is always set now, but older cache entries (from 1.99-Insiders) may not have it.
        const name = this._definition.serverToolName ?? this._definition.name;
        const progressToken = progress ? generateUuid() : undefined;
        const store = new DisposableStore();
        return McpServer.callOn(this._server, async (h) => {
            if (progress) {
                store.add(h.onDidReceiveProgressNotification((e) => {
                    if (e.params.progressToken === progressToken) {
                        progress.report({
                            message: e.params.message,
                            progress: e.params.total !== undefined && e.params.progress !== undefined ? e.params.progress / e.params.total : undefined,
                        });
                    }
                }));
            }
            const meta = { progressToken };
            if (context?.chatSessionResource) {
                meta['vscode.conversationId'] = chatSessionResourceToId(context.chatSessionResource);
            }
            if (context?.chatRequestId) {
                meta['vscode.requestId'] = context.chatRequestId;
            }
            const taskHint = this._definition.execution?.taskSupport;
            const serverSupportsTasksForTools = h.capabilities.tasks?.requests?.tools?.call !== undefined;
            const shouldUseTask = serverSupportsTasksForTools && (taskHint === 'required' || taskHint === 'optional');
            try {
                const result = await h.callTool({
                    name,
                    arguments: params,
                    task: shouldUseTask ? {} : undefined,
                    _meta: meta,
                }, token, progress ? (message) => progress.report({ message }) : undefined);
                // Wait for tools to refresh for dynamic servers (#261611)
                await this._server.awaitToolRefresh();
                return result;
            }
            catch (err) {
                // Handle URL elicitation required error
                if (err instanceof MpcResponseError && err.code === MCP.URL_ELICITATION_REQUIRED && allowRetry) {
                    await this._handleElicitationErr(err, context, token);
                    return this._callWithProgress(params, progress, context, token, false);
                }
                const state = this._server.connectionState.get();
                if (allowRetry && state.state === 3 /* McpConnectionState.Kind.Error */ && state.shouldRetry) {
                    return this._callWithProgress(params, progress, context, token, false);
                }
                else {
                    throw err;
                }
            }
            finally {
                store.dispose();
            }
        }, token);
    }
    async _handleElicitationErr(err, context, token) {
        const elicitations = err.data?.elicitations;
        if (Array.isArray(elicitations) && elicitations.length > 0) {
            for (const elicitation of elicitations) {
                const elicitResult = await this._elicitationService.elicit(this._server, context, elicitation, token);
                try {
                    if (elicitResult.value.action !== 'accept') {
                        throw err;
                    }
                    if (elicitResult.kind === 1 /* ElicitationKind.URL */) {
                        await elicitResult.wait;
                    }
                }
                finally {
                    elicitResult.dispose();
                }
            }
        }
    }
    compare(other) {
        return this._definition.name.localeCompare(other.definition.name);
    }
};
McpTool = __decorate([
    __param(3, IMcpElicitationService)
], McpTool);
export { McpTool };
function warnInvalidTools(instaService, serverName, errorText) {
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
class McpResource {
    constructor(server, original, icons) {
        this.icons = icons;
        this.mcpUri = original.uri;
        this.title = original.title;
        this.uri = McpResourceURI.fromServer(server.definition, original.uri);
        this.name = original.name;
        this.description = original.description;
        this.mimeType = original.mimeType;
        this.sizeInBytes = original.size;
    }
}
class McpResourceTemplate {
    constructor(_server, _definition, icons) {
        this._server = _server;
        this._definition = _definition;
        this.icons = icons;
        this.name = _definition.name;
        this.description = _definition.description;
        this.mimeType = _definition.mimeType;
        this.title = _definition.title;
        this.template = UriTemplate.parse(_definition.uriTemplate);
    }
    resolveURI(vars) {
        const serverUri = this.template.resolve(vars);
        return McpResourceURI.fromServer(this._server.definition, serverUri);
    }
    async complete(templatePart, prefix, alreadyResolved, token) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BTZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE9BQU8sRUFBRSx5QkFBeUIsRUFBc0QsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JQLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkNBQTJDLENB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