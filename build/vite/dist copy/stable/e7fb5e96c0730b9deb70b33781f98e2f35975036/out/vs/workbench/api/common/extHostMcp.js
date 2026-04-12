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
import { DeferredPromise, raceCancellationError, Sequencer, timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, getDefaultMetadataForUrl, parseWWWAuthenticateHeader, scopesMatch } from '../../../base/common/oauth.js';
import { SSEParser } from '../../../base/common/sseParser.js';
import { URI } from '../../../base/common/uri.js';
import { vArray, vNumber, vObj, vObjAny, vOptionalProp, vString } from '../../../base/common/validation.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { canLog, ILogService, LogLevel } from '../../../platform/log/common/log.js';
import product from '../../../platform/product/common/product.js';
import { extensionPrefixedIdentifier, McpServerLaunch, UserInteractionRequiredError } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as Convert from './extHostTypeConverters.js';
import { McpToolAvailability } from './extHostTypes.js';
import { IExtHostVariableResolverProvider } from './extHostVariableResolverService.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
export const IExtHostMpcService = createDecorator('IExtHostMpcService');
const serverDataValidation = vObj({
    label: vString(),
    version: vOptionalProp(vString()),
    metadata: vOptionalProp(vObj({
        capabilities: vOptionalProp(vObjAny()),
        serverInfo: vOptionalProp(vObjAny()),
        tools: vOptionalProp(vArray(vObj({
            availability: vNumber(),
            definition: vObjAny(),
        }))),
    })),
    authentication: vOptionalProp(vObj({
        providerId: vString(),
        scopes: vArray(vString()),
    }))
});
// Can be validated with:
// declare const _serverDataValidationTest: vscode.McpStdioServerDefinition | vscode.McpHttpServerDefinition;
// const _serverDataValidationProd: ValidatorType<typeof serverDataValidation> = _serverDataValidationTest;
let ExtHostMcpService = class ExtHostMcpService extends Disposable {
    constructor(extHostRpc, _logService, _extHostInitData, _workspaceService, _variableResolver) {
        super();
        this._logService = _logService;
        this._extHostInitData = _extHostInitData;
        this._workspaceService = _workspaceService;
        this._variableResolver = _variableResolver;
        this._initialProviderPromises = new Set();
        this._sseEventSources = this._register(new DisposableMap());
        this._unresolvedMcpServers = new Map();
        // MCP server definitions synced from main thread
        this._onDidChangeMcpServerDefinitions = this._register(new Emitter());
        this.onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;
        this._mcpServerDefinitions = [];
        // Active gateways with their server emitters for dynamic updates
        this._activeGateways = new Map();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
    }
    /** Returns all MCP server definitions known to the editor. */
    get mcpServerDefinitions() {
        return this._mcpServerDefinitions;
    }
    /** Called by main thread to notify that MCP server definitions have changed. */
    $onDidChangeMcpServerDefinitions(servers) {
        this._mcpServerDefinitions = servers.map(dto => Convert.McpServerDefinition.to(dto));
        this._onDidChangeMcpServerDefinitions.fire();
    }
    $startMcp(id, opts) {
        this._startMcp(id, McpServerLaunch.fromSerialized(opts.launch), opts.defaultCwd && URI.revive(opts.defaultCwd), opts.errorOnUserInteraction);
    }
    _startMcp(id, launch, _defaultCwd, errorOnUserInteraction) {
        if (launch.type === 2 /* McpServerTransportType.HTTP */) {
            this._sseEventSources.set(id, new McpHTTPHandle(id, launch, this._proxy, this._logService, errorOnUserInteraction));
            return;
        }
        throw new Error('not implemented');
    }
    async $substituteVariables(_workspaceFolder, value) {
        const folderURI = URI.revive(_workspaceFolder);
        const folder = folderURI && await this._workspaceService.resolveWorkspaceFolder(folderURI);
        const variableResolver = await this._variableResolver.getResolver();
        return variableResolver.resolveAsync(folder && {
            uri: folder.uri,
            name: folder.name,
            index: folder.index,
        }, value);
    }
    $stopMcp(id) {
        this._sseEventSources.get(id)
            ?.close()
            .then(() => this._didClose(id));
    }
    _didClose(id) {
        this._sseEventSources.deleteAndDispose(id);
    }
    $sendMessage(id, message) {
        this._sseEventSources.get(id)?.send(message);
    }
    async $waitForInitialCollectionProviders() {
        await Promise.all(this._initialProviderPromises);
    }
    async $resolveMcpLaunch(collectionId, label) {
        const rec = this._unresolvedMcpServers.get(collectionId);
        if (!rec) {
            return;
        }
        const server = rec.servers.find(s => s.label === label);
        if (!server) {
            return;
        }
        if (!rec.provider.resolveMcpServerDefinition) {
            return Convert.McpServerDefinition.from(server);
        }
        const resolved = await rec.provider.resolveMcpServerDefinition(server, CancellationToken.None);
        return resolved ? Convert.McpServerDefinition.from(resolved) : undefined;
    }
    /** {@link vscode.lm.registerMcpServerDefinitionProvider} */
    registerMcpConfigurationProvider(extension, id, provider) {
        const store = new DisposableStore();
        const metadata = extension.contributes?.mcpServerDefinitionProviders?.find(m => m.id === id);
        if (!metadata) {
            throw new Error(`MCP configuration providers must be registered in the contributes.mcpServerDefinitionProviders array within your package.json, but "${id}" was not`);
        }
        const mcp = {
            id: extensionPrefixedIdentifier(extension.identifier, id),
            isTrustedByDefault: true,
            label: metadata?.label ?? extension.displayName ?? extension.name,
            scope: 1 /* StorageScope.WORKSPACE */,
            canResolveLaunch: typeof provider.resolveMcpServerDefinition === 'function',
            extensionId: extension.identifier.value,
            configTarget: this._extHostInitData.remote.isRemote ? 4 /* ConfigurationTarget.USER_REMOTE */ : 2 /* ConfigurationTarget.USER */,
        };
        const update = async () => {
            const list = await provider.provideMcpServerDefinitions(CancellationToken.None);
            this._unresolvedMcpServers.set(mcp.id, { servers: list ?? [], provider });
            const servers = [];
            for (const item of list ?? []) {
                let id = ExtensionIdentifier.toKey(extension.identifier) + '/' + item.label;
                if (servers.some(s => s.id === id)) {
                    let i = 2;
                    while (servers.some(s => s.id === id + i)) {
                        i++;
                    }
                    id = id + i;
                }
                serverDataValidation.validateOrThrow(item);
                if (item.authentication) {
                    checkProposedApiEnabled(extension, 'mcpToolDefinitions');
                }
                let staticMetadata;
                const castAs2 = item;
                if (isProposedApiEnabled(extension, 'mcpToolDefinitions') && castAs2.metadata) {
                    staticMetadata = {
                        capabilities: castAs2.metadata.capabilities,
                        instructions: castAs2.metadata.instructions,
                        serverInfo: castAs2.metadata.serverInfo,
                        tools: castAs2.metadata.tools?.map(t => ({
                            availability: t.availability === McpToolAvailability.Dynamic ? 1 /* McpServerStaticToolAvailability.Dynamic */ : 0 /* McpServerStaticToolAvailability.Initial */,
                            definition: t.definition,
                        })),
                    };
                }
                servers.push({
                    id,
                    label: item.label,
                    cacheNonce: item.version || '$$NONE',
                    staticMetadata,
                    launch: Convert.McpServerDefinition.from(item),
                });
            }
            this._proxy.$upsertMcpCollection(mcp, servers);
        };
        store.add(toDisposable(() => {
            this._unresolvedMcpServers.delete(mcp.id);
            this._proxy.$deleteMcpCollection(mcp.id);
        }));
        if (provider.onDidChangeMcpServerDefinitions) {
            store.add(provider.onDidChangeMcpServerDefinitions(update));
        }
        // todo@connor4312: proposed API back-compat
        // eslint-disable-next-line local/code-no-any-casts
        if (provider.onDidChangeServerDefinitions) {
            // eslint-disable-next-line local/code-no-any-casts
            store.add(provider.onDidChangeServerDefinitions(update));
        }
        // eslint-disable-next-line local/code-no-any-casts
        if (provider.onDidChange) {
            // eslint-disable-next-line local/code-no-any-casts
            store.add(provider.onDidChange(update));
        }
        const promise = new Promise(resolve => {
            setTimeout(() => update().finally(() => {
                this._initialProviderPromises.delete(promise);
                resolve();
            }), 0);
        });
        this._initialProviderPromises.add(promise);
        return store;
    }
    /** {@link vscode.lm.startMcpGateway} */
    async startMcpGateway() {
        const result = await this._proxy.$startMcpGateway();
        if (!result) {
            return undefined;
        }
        const gatewayId = result.gatewayId;
        const servers = result.servers.map(s => ({
            label: s.label,
            address: URI.revive(s.address),
        }));
        const onDidChangeServers = new Emitter();
        this._activeGateways.set(gatewayId, { servers, onDidChangeServers });
        return {
            get servers() { return servers; },
            onDidChangeServers: onDidChangeServers.event,
            dispose: () => {
                this._activeGateways.delete(gatewayId);
                onDidChangeServers.dispose();
                this._proxy.$disposeMcpGateway(gatewayId);
            }
        };
    }
    /** Called by main thread to notify that a gateway's server set has changed. */
    $onDidChangeGatewayServers(gatewayId, newServers) {
        const gateway = this._activeGateways.get(gatewayId);
        if (!gateway) {
            return;
        }
        const servers = newServers.map(s => ({
            label: s.label,
            address: URI.revive(s.address),
        }));
        gateway.servers.length = 0;
        gateway.servers.push(...servers);
        gateway.onDidChangeServers.fire(servers);
    }
};
ExtHostMcpService = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, ILogService),
    __param(2, IExtHostInitDataService),
    __param(3, IExtHostWorkspace),
    __param(4, IExtHostVariableResolverProvider)
], ExtHostMcpService);
export { ExtHostMcpService };
var HttpMode;
(function (HttpMode) {
    HttpMode[HttpMode["Unknown"] = 0] = "Unknown";
    HttpMode[HttpMode["Http"] = 1] = "Http";
    HttpMode[HttpMode["SSE"] = 2] = "SSE";
})(HttpMode || (HttpMode = {}));
const MAX_FOLLOW_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];
/**
 * Implementation of both MCP HTTP Streaming as well as legacy SSE.
 *
 * The first request will POST to the endpoint, assuming HTTP streaming. If the
 * server is legacy SSE, it should return some 4xx status in that case,
 * and we'll automatically fall back to SSE and res
 */
export class McpHTTPHandle extends Disposable {
    constructor(_id, _launch, _proxy, _logService, _errorOnUserInteraction) {
        super();
        this._id = _id;
        this._launch = _launch;
        this._proxy = _proxy;
        this._logService = _logService;
        this._errorOnUserInteraction = _errorOnUserInteraction;
        this._requestSequencer = new Sequencer();
        this._postEndpoint = new DeferredPromise();
        this._mode = { value: 0 /* HttpMode.Unknown */ };
        this._cts = new CancellationTokenSource();
        this._abortCtrl = new AbortController();
        this._didSendClose = false;
        this._register(toDisposable(() => {
            this._abortCtrl.abort();
            this._cts.dispose(true);
        }));
        this._proxy.$onDidChangeState(this._id, { state: 2 /* McpConnectionState.Kind.Running */ });
    }
    async send(message) {
        try {
            if (this._mode.value === 0 /* HttpMode.Unknown */) {
                await this._requestSequencer.queue(() => this._send(message));
            }
            else {
                await this._send(message);
            }
        }
        catch (err) {
            const msg = `Error sending message to ${this._launch.uri}: ${String(err)}`;
            this._proxy.$onDidChangeState(this._id, { state: 3 /* McpConnectionState.Kind.Error */, message: msg });
        }
    }
    async close() {
        if (this._mode.value === 1 /* HttpMode.Http */ && this._mode.sessionId && !this._didSendClose) {
            this._didSendClose = true;
            try {
                await this._closeSession(this._mode.sessionId);
            }
            catch {
                // ignored -- already logged
            }
        }
        this._proxy.$onDidChangeState(this._id, { state: 0 /* McpConnectionState.Kind.Stopped */ });
    }
    async _closeSession(sessionId) {
        const headers = {
            ...Object.fromEntries(this._launch.headers),
            'Mcp-Session-Id': sessionId,
        };
        try {
            await this._addAuthHeader(headers, { errorOnUserInteraction: true });
        }
        catch (e) {
            // If auth is no longer available (e.g. user signed out), skip the close request
            this._log(LogLevel.Debug, `Skipping session close: authentication no longer available`);
            return;
        }
        // no fetch with retry here -- don't try to auth if we get an auth failure
        await this._fetch(this._launch.uri.toString(true), {
            method: 'DELETE',
            headers,
        });
    }
    _send(message) {
        if (this._mode.value === 2 /* HttpMode.SSE */) {
            return this._sendLegacySSE(this._mode.endpoint, message);
        }
        else {
            return this._sendStreamableHttp(message, this._mode.value === 1 /* HttpMode.Http */ ? this._mode.sessionId : undefined);
        }
    }
    /**
     * Sends a streamable-HTTP request.
     * 1. Posts to the endpoint
     * 2. Updates internal state as needed. Falls back to SSE if appropriate.
     * 3. If the response body is empty, JSON, or a JSON stream, handle it appropriately.
     */
    async _sendStreamableHttp(message, sessionId) {
        const asBytes = new TextEncoder().encode(message);
        const headers = {
            ...Object.fromEntries(this._launch.headers),
            'Content-Type': 'application/json',
            'Content-Length': String(asBytes.length),
            Accept: 'text/event-stream, application/json',
        };
        if (sessionId) {
            headers['Mcp-Session-Id'] = sessionId;
        }
        await this._addAuthHeader(headers);
        const res = await this._fetchWithAuthRetry(this._launch.uri.toString(true), {
            method: 'POST',
            headers,
            body: asBytes,
        }, headers);
        const wasUnknown = this._mode.value === 0 /* HttpMode.Unknown */;
        // Mcp-Session-Id is the strongest signal that we're in streamable HTTP mode
        const nextSessionId = res.headers.get('Mcp-Session-Id');
        if (nextSessionId) {
            this._mode = { value: 1 /* HttpMode.Http */, sessionId: nextSessionId };
        }
        if (this._mode.value === 0 /* HttpMode.Unknown */ &&
            // We care about 4xx errors...
            res.status >= 400 && res.status < 500
            // ...except for auth errors
            && !isAuthStatusCode(res.status)) {
            this._log(LogLevel.Info, `${res.status} status sending message to ${this._launch.uri}, will attempt to fall back to legacy SSE`);
            this._sseFallbackWithMessage(message);
            return;
        }
        if (res.status >= 300) {
            // "When a client receives HTTP 404 in response to a request containing an Mcp-Session-Id, it MUST start a new session by sending a new InitializeRequest without a session ID attached"
            // Though this says only 404, some servers send 400s as well, including their example
            // https://github.com/modelcontextprotocol/typescript-sdk/issues/389
            const retryWithSessionId = this._mode.value === 1 /* HttpMode.Http */ && !!this._mode.sessionId && (res.status === 400 || res.status === 404);
            this._proxy.$onDidChangeState(this._id, {
                state: 3 /* McpConnectionState.Kind.Error */,
                message: `${res.status} status sending message to ${this._launch.uri}: ${await this._getErrText(res)}` + (retryWithSessionId ? `; will retry with new session ID` : ''),
                shouldRetry: retryWithSessionId,
            });
            return;
        }
        if (this._mode.value === 0 /* HttpMode.Unknown */) {
            this._mode = { value: 1 /* HttpMode.Http */, sessionId: undefined };
        }
        if (wasUnknown) {
            this._attachStreamableBackchannel();
        }
        await this._handleSuccessfulStreamableHttp(res, message);
    }
    async _sseFallbackWithMessage(message) {
        const endpoint = await this._attachSSE();
        if (endpoint) {
            this._mode = { value: 2 /* HttpMode.SSE */, endpoint };
            await this._sendLegacySSE(endpoint, message);
        }
    }
    async _handleSuccessfulStreamableHttp(res, message) {
        if (res.status === 202) {
            return; // no body
        }
        const contentType = res.headers.get('Content-Type')?.toLowerCase() || '';
        if (contentType.startsWith('text/event-stream')) {
            const parser = new SSEParser(event => {
                if (event.type === 'message') {
                    this._proxy.$onDidReceiveMessage(this._id, event.data);
                }
                else if (event.type === 'endpoint') {
                    // An SSE server that didn't correctly return a 4xx status when we POSTed
                    this._log(LogLevel.Warning, `Received SSE endpoint from a POST to ${this._launch.uri}, will fall back to legacy SSE`);
                    this._sseFallbackWithMessage(message);
                    throw new CancellationError(); // just to end the SSE stream
                }
            });
            try {
                await this._doSSE(parser, res);
            }
            catch (err) {
                this._log(LogLevel.Warning, `Error reading SSE stream: ${String(err)}`);
            }
        }
        else if (contentType.startsWith('application/json')) {
            this._proxy.$onDidReceiveMessage(this._id, await res.text());
        }
        else {
            const responseBody = await res.text();
            if (isJSON(responseBody)) { // try to read as JSON even if the server didn't set the content type
                this._proxy.$onDidReceiveMessage(this._id, responseBody);
            }
            else {
                this._log(LogLevel.Warning, `Unexpected ${res.status} response for request: ${responseBody}`);
            }
        }
    }
    /**
     * Attaches the SSE backchannel that streamable HTTP servers can use
     * for async notifications. This is a "MAY" support, so if the server gives
     * us a 4xx code, we'll stop trying to connect..
     */
    async _attachStreamableBackchannel() {
        let lastEventId;
        let canReconnectAt;
        for (let retry = 0; !this._store.isDisposed; retry++) {
            if (canReconnectAt !== undefined) {
                await timeout(Math.max(0, canReconnectAt - Date.now()), this._cts.token);
                canReconnectAt = undefined;
            }
            else {
                await timeout(Math.min(retry * 1000, 30_000), this._cts.token);
            }
            let res;
            try {
                const headers = {
                    ...Object.fromEntries(this._launch.headers),
                    'Accept': 'text/event-stream',
                };
                await this._addAuthHeader(headers);
                if (this._mode.value === 1 /* HttpMode.Http */ && this._mode.sessionId !== undefined) {
                    headers['Mcp-Session-Id'] = this._mode.sessionId;
                }
                if (lastEventId) {
                    headers['Last-Event-ID'] = lastEventId;
                }
                res = await this._fetchWithAuthRetry(this._launch.uri.toString(true), {
                    method: 'GET',
                    headers,
                }, headers);
            }
            catch (e) {
                this._log(LogLevel.Info, `Error connecting to ${this._launch.uri} for async notifications, will retry`);
                continue;
            }
            if (res.status >= 400) {
                this._log(LogLevel.Debug, `${res.status} status connecting to ${this._launch.uri} for async notifications; they will be disabled: ${await this._getErrText(res)}`);
                return;
            }
            // Only reset the retry counter if we definitely get an event stream to avoid
            // spamming servers that (incorrectly) don't return one from this endpoint.
            if (res.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
                retry = 0;
            }
            const parser = new SSEParser(event => {
                if (event.retry) {
                    canReconnectAt = Date.now() + event.retry;
                }
                if (event.type === 'message' && event.data) {
                    this._proxy.$onDidReceiveMessage(this._id, event.data);
                }
                if (event.id) {
                    lastEventId = event.id;
                }
            });
            try {
                await this._doSSE(parser, res);
            }
            catch (e) {
                this._log(LogLevel.Info, `Error reading from async stream, we will reconnect: ${e}`);
            }
        }
    }
    /**
     * Starts a legacy SSE attachment, where the SSE response is the session lifetime.
     * Unlike `_attachStreamableBackchannel`, this fails the server if it disconnects.
     */
    async _attachSSE() {
        const postEndpoint = new DeferredPromise();
        const headers = {
            ...Object.fromEntries(this._launch.headers),
            'Accept': 'text/event-stream',
        };
        await this._addAuthHeader(headers);
        let res;
        try {
            res = await this._fetchWithAuthRetry(this._launch.uri.toString(true), {
                method: 'GET',
                headers,
            }, headers);
            if (res.status >= 300) {
                this._proxy.$onDidChangeState(this._id, { state: 3 /* McpConnectionState.Kind.Error */, message: `${res.status} status connecting to ${this._launch.uri} as SSE: ${await this._getErrText(res)}` });
                return;
            }
        }
        catch (e) {
            this._proxy.$onDidChangeState(this._id, { state: 3 /* McpConnectionState.Kind.Error */, message: `Error connecting to ${this._launch.uri} as SSE: ${e}` });
            return;
        }
        const parser = new SSEParser(event => {
            if (event.type === 'message') {
                this._proxy.$onDidReceiveMessage(this._id, event.data);
            }
            else if (event.type === 'endpoint') {
                postEndpoint.complete(new URL(event.data, this._launch.uri.toString(true)).toString());
            }
        });
        this._register(toDisposable(() => postEndpoint.cancel()));
        this._doSSE(parser, res).catch(err => {
            this._proxy.$onDidChangeState(this._id, { state: 3 /* McpConnectionState.Kind.Error */, message: `Error reading SSE stream: ${String(err)}` });
        });
        return postEndpoint.p;
    }
    /**
     * Sends a legacy SSE message to the server. The response is always empty and
     * is otherwise received in {@link _attachSSE}'s loop.
     */
    async _sendLegacySSE(url, message) {
        const asBytes = new TextEncoder().encode(message);
        const headers = {
            ...Object.fromEntries(this._launch.headers),
            'Content-Type': 'application/json',
            'Content-Length': String(asBytes.length),
        };
        await this._addAuthHeader(headers);
        const res = await this._fetch(url, {
            method: 'POST',
            headers,
            body: asBytes,
        });
        if (res.status >= 300) {
            this._log(LogLevel.Warning, `${res.status} status sending message to ${this._postEndpoint}: ${await this._getErrText(res)}`);
        }
    }
    /** Generic handle to pipe a response into an SSE parser. */
    async _doSSE(parser, res) {
        if (!res.body) {
            return;
        }
        const reader = res.body.getReader();
        let chunk;
        do {
            try {
                chunk = await raceCancellationError(reader.read(), this._cts.token);
            }
            catch (err) {
                reader.cancel();
                if (this._store.isDisposed) {
                    return;
                }
                else {
                    throw err;
                }
            }
            if (chunk.value) {
                parser.feed(chunk.value);
            }
        } while (!chunk.done);
    }
    async _addAuthHeader(headers, options) {
        const errorOnUserInteraction = options?.errorOnUserInteraction ?? this._errorOnUserInteraction;
        if (this._authMetadata) {
            try {
                const authDetails = {
                    authorizationServer: this._authMetadata.authorizationServer.toJSON(),
                    authorizationServerMetadata: this._authMetadata.serverMetadata,
                    resourceMetadata: this._authMetadata.resourceMetadata,
                    scopes: this._authMetadata.scopes
                };
                const token = await this._proxy.$getTokenFromServerMetadata(this._id, authDetails, {
                    errorOnUserInteraction,
                    forceNewRegistration: options?.forceNewRegistration
                });
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
            catch (e) {
                if (UserInteractionRequiredError.is(e)) {
                    this._proxy.$onDidChangeState(this._id, { state: 0 /* McpConnectionState.Kind.Stopped */, reason: 'needs-user-interaction' });
                    throw new CancellationError();
                }
                this._log(LogLevel.Warning, `Error getting token from server metadata: ${String(e)}`);
            }
        }
        if (this._launch.authentication) {
            try {
                this._log(LogLevel.Debug, `Using provided authentication config: providerId=${this._launch.authentication.providerId}, scopes=${this._launch.authentication.scopes.join(', ')}`);
                const token = await this._proxy.$getTokenForProviderId(this._id, this._launch.authentication.providerId, this._launch.authentication.scopes, {
                    errorOnUserInteraction,
                    forceNewRegistration: options?.forceNewRegistration
                });
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                    this._log(LogLevel.Info, 'Successfully obtained token from provided authentication config');
                }
            }
            catch (e) {
                if (UserInteractionRequiredError.is(e)) {
                    this._proxy.$onDidChangeState(this._id, { state: 0 /* McpConnectionState.Kind.Stopped */, reason: 'needs-user-interaction' });
                    throw new CancellationError();
                }
                this._log(LogLevel.Warning, `Error getting token from provided authentication config: ${String(e)}`);
            }
        }
        return headers;
    }
    _log(level, message) {
        if (!this._store.isDisposed) {
            this._proxy.$onDidPublishLog(this._id, level, message);
        }
    }
    async _getErrText(res) {
        try {
            return await res.text();
        }
        catch {
            return res.statusText;
        }
    }
    /**
     * Helper method to perform fetch with authentication retry logic.
     * If the initial request returns an auth error and we don't have auth metadata,
     * it will populate the auth metadata and retry once.
     * If we already have auth metadata, check if the scopes changed and update them.
     */
    async _fetchWithAuthRetry(mcpUrl, init, headers) {
        const doFetch = () => this._fetch(mcpUrl, init);
        let res = await doFetch();
        if (isAuthStatusCode(res.status)) {
            if (!this._authMetadata) {
                this._authMetadata = await createAuthMetadata(mcpUrl, res.headers, {
                    sameOriginHeaders: {
                        ...Object.fromEntries(this._launch.headers),
                        'MCP-Protocol-Version': MCP.LATEST_PROTOCOL_VERSION
                    },
                    fetch: (url, init) => this._fetch(url, init),
                    log: (level, message) => this._log(level, message)
                });
                this._proxy.$logMcpAuthSetup(this._authMetadata.telemetry);
                await this._addAuthHeader(headers);
                if (headers['Authorization']) {
                    // Update the headers in the init object
                    init.headers = headers;
                    res = await doFetch();
                }
            }
            else {
                // We have auth metadata, but got an auth error. Check if the scopes changed.
                if (this._authMetadata.update(res.headers)) {
                    await this._addAuthHeader(headers);
                    if (headers['Authorization']) {
                        // Update the headers in the init object
                        init.headers = headers;
                        res = await doFetch();
                    }
                }
            }
        }
        // If we have an Authorization header and still get an auth error, we should retry with a new auth registration
        if (headers['Authorization'] && isAuthStatusCode(res.status)) {
            const errorText = await this._getErrText(res);
            this._log(LogLevel.Info, `Received ${res.status} status with Authorization header, retrying with new auth registration. Error details: ${errorText || 'no additional details'}`);
            await this._addAuthHeader(headers, { forceNewRegistration: true });
            res = await doFetch();
        }
        return res;
    }
    async _fetch(url, init) {
        init.headers['user-agent'] = `${product.nameLong}/${product.version}`;
        if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
            const traceObj = { ...init, headers: { ...init.headers } };
            if (traceObj.body) {
                traceObj.body = new TextDecoder().decode(traceObj.body);
            }
            if (traceObj.headers?.Authorization) {
                traceObj.headers.Authorization = '***'; // don't log the auth header
            }
            this._log(LogLevel.Trace, `Fetching ${url} with options: ${JSON.stringify(traceObj)}`);
        }
        let currentUrl = url;
        let response;
        for (let redirectCount = 0; redirectCount < MAX_FOLLOW_REDIRECTS; redirectCount++) {
            response = await this._fetchInternal(currentUrl, {
                ...init,
                signal: this._abortCtrl.signal,
                redirect: 'manual'
            });
            // Check for redirect status codes (301, 302, 303, 307, 308)
            if (!REDIRECT_STATUS_CODES.includes(response.status)) {
                break;
            }
            const location = response.headers.get('location');
            if (!location) {
                break;
            }
            const nextUrl = new URL(location, currentUrl).toString();
            this._log(LogLevel.Trace, `Redirect (${response.status}) from ${currentUrl} to ${nextUrl}`);
            currentUrl = nextUrl;
            // Per fetch spec, for 303 always use GET, keep method unless original was POST and 301/302, then GET.
            if (response.status === 303 || ((response.status === 301 || response.status === 302) && init.method === 'POST')) {
                init.method = 'GET';
                delete init.body;
            }
        }
        if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
            const headers = {};
            response.headers.forEach((value, key) => { headers[key] = value; });
            this._log(LogLevel.Trace, `Fetched ${currentUrl}: ${JSON.stringify({
                status: response.status,
                headers: headers,
            })}`);
        }
        return response;
    }
    _fetchInternal(url, init) {
        return fetch(url, init);
    }
}
function isJSON(str) {
    try {
        JSON.parse(str);
        return true;
    }
    catch (e) {
        return false;
    }
}
function isAuthStatusCode(status) {
    return status === 401 || status === 403;
}
/**
 * Concrete implementation of IAuthMetadata that manages OAuth authentication metadata.
 * Consumers should use {@link createAuthMetadata} to create instances.
 */
class AuthMetadata {
    constructor(authorizationServer, serverMetadata, resourceMetadata, scopes, telemetry, _log) {
        this.authorizationServer = authorizationServer;
        this.serverMetadata = serverMetadata;
        this.resourceMetadata = resourceMetadata;
        this.telemetry = telemetry;
        this._log = _log;
        this._scopes = scopes;
    }
    get scopes() {
        return this._scopes;
    }
    update(responseHeaders) {
        const scopesChallenge = this._parseScopesFromResponse(responseHeaders);
        if (!scopesMatch(scopesChallenge, this._scopes)) {
            this._log(LogLevel.Info, `Scopes changed from ${JSON.stringify(this._scopes)} to ${JSON.stringify(scopesChallenge)}, updating`);
            this._scopes = scopesChallenge;
            return true;
        }
        return false;
    }
    _parseScopesFromResponse(responseHeaders) {
        const authHeader = responseHeaders.get('WWW-Authenticate');
        if (!authHeader) {
            return undefined;
        }
        const challenges = parseWWWAuthenticateHeader(authHeader);
        for (const challenge of challenges) {
            if (challenge.scheme === 'Bearer' && challenge.params['scope']) {
                const scopes = challenge.params['scope'].split(AUTH_SCOPE_SEPARATOR).filter(s => s.trim().length);
                if (scopes.length) {
                    this._log(LogLevel.Info, `Found scope challenge in WWW-Authenticate header: ${challenge.params['scope']}`);
                    return scopes;
                }
            }
        }
        return undefined;
    }
}
/**
 * Creates an AuthMetadata instance by discovering OAuth metadata from the server.
 *
 * This function:
 * 1. Parses the WWW-Authenticate header for resource_metadata and scope challenges
 * 2. Fetches OAuth protected resource metadata from well-known URIs or the challenge URL
 * 3. Fetches authorization server metadata
 * 4. Falls back to default metadata if discovery fails
 *
 * @param resourceUrl The resource server URL
 * @param wwwAuthenticateValue The value of the WWW-Authenticate header from the original HTTP response
 * @param options Configuration options including headers, fetch function, and logger
 * @returns A new AuthMetadata instance
 */
export async function createAuthMetadata(resourceUrl, initialResponseHeaders, options) {
    const { sameOriginHeaders, fetch, log } = options;
    // Track discovery sources for telemetry
    let resourceMetadataSource = "none" /* IAuthResourceMetadataSource.None */;
    let serverMetadataSource;
    // Parse the WWW-Authenticate header for resource_metadata and scope challenges
    const { resourceMetadataChallenge, scopesChallenge: scopesChallengeFromHeader } = parseWWWAuthenticateHeaderForChallenges(initialResponseHeaders.get('WWW-Authenticate') ?? undefined, log);
    // Fetch the resource metadata either from the challenge URL or from well-known URIs
    let serverMetadataUrl;
    let resource;
    let scopesChallenge = scopesChallengeFromHeader;
    try {
        const { metadata, discoveryUrl, errors } = await fetchResourceMetadata(resourceUrl, resourceMetadataChallenge, {
            sameOriginHeaders,
            fetch: (url, init) => fetch(url, init)
        });
        for (const err of errors) {
            log(LogLevel.Warning, `Error fetching resource metadata: ${err}`);
        }
        log(LogLevel.Info, `Discovered resource metadata at ${discoveryUrl}`);
        // Determine if resource metadata came from header or well-known
        resourceMetadataSource = resourceMetadataChallenge ? "header" /* IAuthResourceMetadataSource.Header */ : "wellKnown" /* IAuthResourceMetadataSource.WellKnown */;
        // TODO:@TylerLeonhardt support multiple authorization servers
        // Consider using one that has an auth provider first, over the dynamic flow
        serverMetadataUrl = metadata.authorization_servers?.[0];
        if (!serverMetadataUrl) {
            log(LogLevel.Warning, `No authorization_servers found in resource metadata ${discoveryUrl} - Is this resource metadata configured correctly?`);
        }
        else {
            log(LogLevel.Info, `Using auth server metadata url: ${serverMetadataUrl}`);
            serverMetadataSource = "resourceMetadata" /* IAuthServerMetadataSource.ResourceMetadata */;
        }
        scopesChallenge ??= metadata.scopes_supported;
        resource = metadata;
    }
    catch (e) {
        log(LogLevel.Warning, `Could not fetch resource metadata: ${String(e)}`);
    }
    const baseUrl = new URL(resourceUrl).origin;
    // If we are not given a resource_metadata, see if the well-known server metadata is available
    // on the base url.
    let additionalHeaders = {};
    if (!serverMetadataUrl) {
        serverMetadataUrl = baseUrl;
        // Maintain the same origin headers when talking to the resource origin.
        if (sameOriginHeaders) {
            additionalHeaders = sameOriginHeaders;
        }
    }
    try {
        log(LogLevel.Debug, `Fetching auth server metadata for: ${serverMetadataUrl} ...`);
        const { metadata, discoveryUrl, errors } = await fetchAuthorizationServerMetadata(serverMetadataUrl, {
            additionalHeaders,
            fetch: (url, init) => fetch(url, init)
        });
        for (const err of errors) {
            log(LogLevel.Warning, `Error fetching authorization server metadata: ${err}`);
        }
        log(LogLevel.Info, `Discovered authorization server metadata at ${discoveryUrl}`);
        // If serverMetadataSource is not yet defined, it means we fell back to baseUrl
        // and successfully fetched from well-known
        serverMetadataSource ??= "wellKnown" /* IAuthServerMetadataSource.WellKnown */;
        return new AuthMetadata(URI.parse(serverMetadataUrl), metadata, resource, scopesChallenge, { resourceMetadataSource, serverMetadataSource }, log);
    }
    catch (e) {
        log(LogLevel.Warning, `Error populating auth server metadata for ${serverMetadataUrl}: ${String(e)}`);
    }
    // If there's no well-known server metadata, then use the default values based off of the url.
    const defaultMetadata = getDefaultMetadataForUrl(new URL(baseUrl));
    log(LogLevel.Info, 'Using default auth metadata');
    return new AuthMetadata(URI.parse(baseUrl), defaultMetadata, resource, scopesChallenge, { resourceMetadataSource, serverMetadataSource: "default" /* IAuthServerMetadataSource.Default */ }, log);
}
/**
 * Parses the WWW-Authenticate header for resource_metadata and scope challenges.
 */
function parseWWWAuthenticateHeaderForChallenges(wwwAuthenticateValue, log) {
    if (!wwwAuthenticateValue) {
        return {};
    }
    let resourceMetadataChallenge;
    let scopesChallenge;
    const challenges = parseWWWAuthenticateHeader(wwwAuthenticateValue);
    for (const challenge of challenges) {
        if (challenge.scheme === 'Bearer') {
            if (!resourceMetadataChallenge && challenge.params['resource_metadata']) {
                resourceMetadataChallenge = challenge.params['resource_metadata'];
                log(LogLevel.Debug, `Found resource_metadata challenge in WWW-Authenticate header: ${resourceMetadataChallenge}`);
            }
            if (!scopesChallenge && challenge.params['scope']) {
                const scopes = challenge.params['scope'].split(AUTH_SCOPE_SEPARATOR).filter(s => s.trim().length);
                if (scopes.length) {
                    log(LogLevel.Debug, `Found scope challenge in WWW-Authenticate header: ${challenge.params['scope']}`);
                    scopesChallenge = scopes;
                }
            }
            if (resourceMetadataChallenge && scopesChallenge) {
                break;
            }
        }
    }
    return { resourceMetadataChallenge, scopesChallenge };
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE1jcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RNY3AudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDM0csT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsZ0NBQWdDLEVBQUUscUJBQXFCLEVBQUUsd0JBQXdCLEVBQXlFLDBCQUEwQixFQUFFLFdBQVcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hRLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTVHLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSxtREFBbUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFF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