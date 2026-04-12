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
import { Emitter } from '../../../base/common/event.js';
import { isJsonRpcResponse } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agentService.js';
import { isSessionAction } from '../common/state/sessionActions.js';
import { MIN_PROTOCOL_VERSION, PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import { AHP_PROVIDER_NOT_FOUND, AHP_SESSION_NOT_FOUND, AHP_UNSUPPORTED_PROTOCOL_VERSION, isJsonRpcNotification, isJsonRpcRequest, JSON_RPC_INTERNAL_ERROR, ProtocolError, } from '../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../common/state/sessionState.js';
/** Default capacity of the server-side action replay buffer. */
const REPLAY_BUFFER_CAPACITY = 1000;
/** Build a JSON-RPC success response suitable for transport.send(). */
function jsonRpcSuccess(id, result) {
    return { jsonrpc: '2.0', id, result };
}
/** Build a JSON-RPC error response suitable for transport.send(). */
function jsonRpcError(id, code, message, data) {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}
/** Build a JSON-RPC error response from an unknown thrown value, preserving {@link ProtocolError} fields. */
function jsonRpcErrorFrom(id, err) {
    if (err instanceof ProtocolError) {
        return jsonRpcError(id, err.code, err.message, err.data);
    }
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, message);
}
/**
 * Server-side handler that manages protocol connections, routes JSON-RPC
 * messages to the agent service, and broadcasts actions/notifications
 * to subscribed clients.
 */
let ProtocolServerHandler = class ProtocolServerHandler extends Disposable {
    constructor(_agentService, _stateManager, _server, _config, _clientFileSystemProvider, _logService) {
        super();
        this._agentService = _agentService;
        this._stateManager = _stateManager;
        this._server = _server;
        this._config = _config;
        this._clientFileSystemProvider = _clientFileSystemProvider;
        this._logService = _logService;
        this._clients = new Map();
        this._replayBuffer = [];
        this._onDidChangeConnectionCount = this._register(new Emitter());
        /** Fires with the current client count whenever a client connects or disconnects. */
        this.onDidChangeConnectionCount = this._onDidChangeConnectionCount.event;
        // ---- Requests (expect a response) ---------------------------------------
        /**
         * Methods handled by the request dispatcher (excludes initialize/reconnect
         * which are handled during the handshake phase).
         */
        this._requestHandlers = {
            subscribe: async (client, params) => {
                try {
                    const snapshot = await this._agentService.subscribe(URI.parse(params.resource));
                    client.subscriptions.add(params.resource);
                    return { snapshot };
                }
                catch (err) {
                    if (err instanceof ProtocolError) {
                        throw err;
                    }
                    throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.resource}`);
                }
            },
            createSession: async (_client, params) => {
                let createdSession;
                // Resolve fork turnId to a 0-based index using the source session's
                // turn list in the state manager.
                let fork;
                if (params.fork) {
                    const sourceState = this._stateManager.getSessionState(params.fork.session);
                    if (!sourceState) {
                        throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork source session not found: ${params.fork.session}`);
                    }
                    const turnIndex = sourceState.turns.findIndex(t => t.id === params.fork.turnId);
                    if (turnIndex < 0) {
                        throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork turn ID ${params.fork.turnId} not found in session ${params.fork.session}`);
                    }
                    fork = { session: URI.parse(params.fork.session), turnIndex };
                }
                try {
                    createdSession = await this._agentService.createSession({
                        provider: params.provider,
                        model: params.model,
                        workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
                        session: URI.parse(params.session),
                        fork,
                    });
                }
                catch (err) {
                    if (err instanceof ProtocolError) {
                        throw err;
                    }
                    throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, err instanceof Error ? err.message : String(err));
                }
                // Verify the provider honored the client-chosen session URI per the protocol contract
                if (createdSession.toString() !== URI.parse(params.session).toString()) {
                    this._logService.warn(`[ProtocolServer] createSession: provider returned URI ${createdSession.toString()} but client requested ${params.session}`);
                }
                return null;
            },
            disposeSession: async (_client, params) => {
                await this._agentService.disposeSession(URI.parse(params.session));
                return null;
            },
            resourceWrite: async (_client, params) => {
                return this._agentService.resourceWrite(params);
            },
            listSessions: async () => {
                const sessions = await this._agentService.listSessions();
                const items = sessions.map(s => ({
                    resource: s.session.toString(),
                    provider: AgentSession.provider(s.session) ?? 'copilot',
                    title: s.summary ?? 'Session',
                    status: "idle" /* SessionStatus.Idle */,
                    createdAt: s.startTime,
                    modifiedAt: s.modifiedTime,
                    workingDirectory: s.workingDirectory?.toString(),
                }));
                return { items };
            },
            fetchTurns: async (_client, params) => {
                const state = this._stateManager.getSessionState(params.session);
                if (!state) {
                    throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.session}`);
                }
                const turns = state.turns;
                const limit = Math.min(params.limit ?? 50, 100);
                let endIndex = turns.length;
                if (params.before) {
                    const idx = turns.findIndex(t => t.id === params.before);
                    if (idx !== -1) {
                        endIndex = idx;
                    }
                }
                const startIndex = Math.max(0, endIndex - limit);
                return {
                    turns: turns.slice(startIndex, endIndex),
                    hasMore: startIndex > 0,
                };
            },
            resourceList: async (_client, params) => {
                return this._agentService.resourceList(URI.parse(params.uri));
            },
            resourceRead: async (_client, params) => {
                return this._agentService.resourceRead(URI.parse(params.uri));
            },
            resourceCopy: async (_client, params) => {
                return this._agentService.resourceCopy(params);
            },
            resourceDelete: async (_client, params) => {
                return this._agentService.resourceDelete(params);
            },
            resourceMove: async (_client, params) => {
                return this._agentService.resourceMove(params);
            },
        };
        // ---- Reverse RPC (server → client requests) ----------------------------
        this._reverseRequestId = 0;
        this._pendingReverseRequests = new Map();
        this._register(this._server.onConnection(transport => {
            this._handleNewConnection(transport);
        }));
        this._register(this._stateManager.onDidEmitEnvelope(envelope => {
            this._replayBuffer.push(envelope);
            if (this._replayBuffer.length > REPLAY_BUFFER_CAPACITY) {
                this._replayBuffer.shift();
            }
            this._broadcastAction(envelope);
        }));
        this._register(this._stateManager.onDidEmitNotification(notification => {
            this._broadcastNotification(notification);
        }));
    }
    // ---- Connection handling -------------------------------------------------
    _handleNewConnection(transport) {
        const disposables = new DisposableStore();
        let client;
        disposables.add(transport.onMessage(msg => {
            if (isJsonRpcRequest(msg)) {
                this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);
                // Handle initialize/reconnect as requests that set up the client
                if (!client && msg.method === 'initialize') {
                    try {
                        const result = this._handleInitialize(msg.params, transport, disposables);
                        client = result.client;
                        transport.send(jsonRpcSuccess(msg.id, result.response));
                    }
                    catch (err) {
                        transport.send(jsonRpcErrorFrom(msg.id, err));
                    }
                    return;
                }
                if (!client && msg.method === 'reconnect') {
                    try {
                        const result = this._handleReconnect(msg.params, transport, disposables);
                        client = result.client;
                        transport.send(jsonRpcSuccess(msg.id, result.response));
                    }
                    catch (err) {
                        transport.send(jsonRpcErrorFrom(msg.id, err));
                    }
                    return;
                }
                if (!client) {
                    return;
                }
                this._handleRequest(client, msg.method, msg.params, msg.id);
            }
            else if (isJsonRpcNotification(msg)) {
                this._logService.trace(`[ProtocolServer] notification: method=${msg.method}`);
                // Notification — fire-and-forget
                switch (msg.method) {
                    case 'unsubscribe':
                        if (client) {
                            client.subscriptions.delete(msg.params.resource);
                        }
                        break;
                    case 'dispatchAction':
                        if (client) {
                            this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(msg.params.action.type)}`);
                            const action = msg.params.action;
                            this._agentService.dispatchAction(action, client.clientId, msg.params.clientSeq);
                        }
                        break;
                }
            }
            else if (isJsonRpcResponse(msg)) {
                const pending = this._pendingReverseRequests.get(msg.id);
                if (pending) {
                    this._pendingReverseRequests.delete(msg.id);
                    if (hasKey(msg, { error: true })) {
                        pending.reject(new Error(msg.error?.message ?? 'Reverse RPC error'));
                    }
                    else {
                        pending.resolve(msg.result);
                    }
                }
            }
        }));
        disposables.add(transport.onClose(() => {
            if (client && this._clients.get(client.clientId) === client) {
                this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}`);
                this._clients.delete(client.clientId);
                this._rejectPendingReverseRequests(client.clientId);
                this._onDidChangeConnectionCount.fire(this._clients.size);
            }
            disposables.dispose();
        }));
        disposables.add(transport);
    }
    // ---- Handshake handlers ----------------------------------------------------
    _handleInitialize(params, transport, disposables) {
        this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, version=${params.protocolVersion}`);
        if (params.protocolVersion < MIN_PROTOCOL_VERSION) {
            throw new ProtocolError(AHP_UNSUPPORTED_PROTOCOL_VERSION, `Client protocol version ${params.protocolVersion} is below minimum ${MIN_PROTOCOL_VERSION}`);
        }
        const client = {
            clientId: params.clientId,
            protocolVersion: params.protocolVersion,
            transport,
            subscriptions: new Set(),
            disposables,
        };
        this._clients.set(params.clientId, client);
        this._onDidChangeConnectionCount.fire(this._clients.size);
        disposables.add(this._clientFileSystemProvider.registerAuthority(params.clientId, {
            resourceList: (uri) => this._sendReverseRequest(params.clientId, 'resourceList', { uri: uri.toString() }),
            resourceRead: (uri) => this._sendReverseRequest(params.clientId, 'resourceRead', { uri: uri.toString() }),
            resourceWrite: (params_) => this._sendReverseRequest(params.clientId, 'resourceWrite', params_),
            resourceDelete: (params_) => this._sendReverseRequest(params.clientId, 'resourceDelete', params_),
            resourceMove: (params_) => this._sendReverseRequest(params.clientId, 'resourceMove', params_),
        }));
        const snapshots = [];
        if (params.initialSubscriptions) {
            for (const uri of params.initialSubscriptions) {
                const snapshot = this._stateManager.getSnapshot(uri);
                if (snapshot) {
                    snapshots.push(snapshot);
                    client.subscriptions.add(uri.toString());
                }
            }
        }
        return {
            client,
            response: {
                protocolVersion: PROTOCOL_VERSION,
                serverSeq: this._stateManager.serverSeq,
                snapshots,
                defaultDirectory: this._config.defaultDirectory,
            },
        };
    }
    _handleReconnect(params, transport, disposables) {
        this._logService.info(`[ProtocolServer] Reconnect: clientId=${params.clientId}, lastSeenSeq=${params.lastSeenServerSeq}`);
        const client = {
            clientId: params.clientId,
            protocolVersion: PROTOCOL_VERSION,
            transport,
            subscriptions: new Set(),
            disposables,
        };
        this._clients.set(params.clientId, client);
        this._onDidChangeConnectionCount.fire(this._clients.size);
        const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
        const canReplay = params.lastSeenServerSeq >= oldestBuffered;
        if (canReplay) {
            const actions = [];
            for (const sub of params.subscriptions) {
                client.subscriptions.add(sub.toString());
            }
            for (const envelope of this._replayBuffer) {
                if (envelope.serverSeq > params.lastSeenServerSeq) {
                    if (this._isRelevantToClient(client, envelope)) {
                        actions.push(envelope);
                    }
                }
            }
            return { client, response: { type: 'replay', actions } };
        }
        else {
            const snapshots = [];
            for (const sub of params.subscriptions) {
                const snapshot = this._stateManager.getSnapshot(sub);
                if (snapshot) {
                    snapshots.push(snapshot);
                    client.subscriptions.add(sub);
                }
            }
            return { client, response: { type: 'snapshot', snapshots } };
        }
    }
    /**
     * Sends a JSON-RPC request to a connected client and waits for the response.
     * Used for reverse-RPC operations like reading client-side files.
     * Rejects if the client disconnects or the server is disposed.
     */
    _sendReverseRequest(clientId, method, params) {
        const client = this._clients.get(clientId);
        if (!client) {
            return Promise.reject(new Error(`Client ${clientId} is not connected`));
        }
        const id = ++this._reverseRequestId;
        return new Promise((resolve, reject) => {
            this._pendingReverseRequests.set(id, { clientId, resolve: resolve, reject });
            const request = { jsonrpc: '2.0', id, method, params };
            client.transport.send(request);
        });
    }
    /**
     * Rejects and clears all pending reverse-RPC requests for a given client.
     */
    _rejectPendingReverseRequests(clientId) {
        for (const [id, pending] of this._pendingReverseRequests) {
            if (pending.clientId === clientId) {
                this._pendingReverseRequests.delete(id);
                pending.reject(new Error(`Client ${clientId} disconnected`));
            }
        }
    }
    _handleRequest(client, method, params, id) {
        const handler = this._requestHandlers.hasOwnProperty(method) ? this._requestHandlers[method] : undefined;
        if (handler) {
            handler(client, params).then(result => {
                this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
                client.transport.send(jsonRpcSuccess(id, result ?? null));
            }).catch(err => {
                this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
                client.transport.send(jsonRpcErrorFrom(id, err));
            });
            return;
        }
        // VS Code extension methods (not in the typed protocol maps yet)
        const extensionResult = this._handleExtensionRequest(method, params);
        if (extensionResult) {
            extensionResult.then(result => {
                client.transport.send(jsonRpcSuccess(id, result ?? null));
            }).catch(err => {
                this._logService.error(`[ProtocolServer] Extension request '${method}' failed`, err);
                client.transport.send(jsonRpcErrorFrom(id, err));
            });
            return;
        }
        client.transport.send(jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, `Unknown method: ${method}`));
    }
    /**
     * Handle VS Code extension methods that are not yet part of the typed
     * protocol. Returns a Promise if the method was recognized, undefined
     * otherwise.
     */
    _handleExtensionRequest(method, params) {
        switch (method) {
            case 'getResourceMetadata':
                return this._agentService.getResourceMetadata();
            case 'authenticate': {
                const authParams = params;
                if (!authParams || typeof authParams.resource !== 'string' || typeof authParams.token !== 'string') {
                    return Promise.reject(new ProtocolError(-32602, 'Invalid authenticate params'));
                }
                return this._agentService.authenticate(authParams);
            }
            case 'refreshModels':
                return this._agentService.refreshModels();
            case 'listAgents':
                return this._agentService.listAgents();
            case 'shutdown':
                return this._agentService.shutdown();
            default:
                return undefined;
        }
    }
    // ---- Broadcasting -------------------------------------------------------
    _broadcastAction(envelope) {
        this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
        const msg = { jsonrpc: '2.0', method: 'action', params: envelope };
        for (const client of this._clients.values()) {
            if (this._isRelevantToClient(client, envelope)) {
                client.transport.send(msg);
            }
        }
    }
    _broadcastNotification(notification) {
        const msg = { jsonrpc: '2.0', method: 'notification', params: { notification } };
        for (const client of this._clients.values()) {
            client.transport.send(msg);
        }
    }
    _isRelevantToClient(client, envelope) {
        const action = envelope.action;
        if (action.type.startsWith('root/')) {
            return client.subscriptions.has(ROOT_STATE_URI);
        }
        if (isSessionAction(action)) {
            return client.subscriptions.has(action.session);
        }
        return false;
    }
    dispose() {
        for (const client of this._clients.values()) {
            client.disposables.dispose();
        }
        this._clients.clear();
        for (const [, pending] of this._pendingReverseRequests) {
            pending.reject(new Error('ProtocolServerHandler disposed'));
        }
        this._pendingReverseRequests.clear();
        this._replayBuffer.length = 0;
        super.dispose();
    }
};
ProtocolServerHandler = __decorate([
    __param(5, ILogService)
], ProtocolServerHandler);
export { ProtocolServerHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvcHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXRELE9BQU8sRUFBRSxZQUFZLEVBQWdELE1BQU0sMkJBQTJCLENBQUM7QUFFdkcsT0FBTyxFQUFrQyxlQUFlLEVBQXVCLE1BQU0sbUNBQW1DLENBQUM7QUFDekgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEcsT0FBTyxFQUNOLHNCQUFzQixFQUN0QixxQkFBcUIsRUFDckIsZ0NBQWdDLEVBRWhDLHFCQUFxQixFQUNyQixnQkFBZ0IsRUFDaEIsdUJBQXVCLEVBQ3ZCLGFBQWEsR0FNYixNQUFNLG9DQUFvQyxDQUFDO0FBQzVDLE9BQU8sRUFBRSxjQUFjLEVBQWlCLE1BQU0saUNBQWlDLENBQUM7QUFJaEYsZ0VBQWdFO0FBQ2hFLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDO0FBRXBDLHVFQUF1RTtBQUN2RSxTQUFTLGNBQWMsQ0FBQyxFQUFVLEVBQUUsTUFBZTtJQUNsRCxPQUFP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