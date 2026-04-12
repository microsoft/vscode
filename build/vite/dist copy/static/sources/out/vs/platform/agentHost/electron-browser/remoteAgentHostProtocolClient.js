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
// Protocol client for communicating with a remote agent host process.
// Wraps WebSocketClientTransport and SessionClientState to provide a
// higher-level API matching IAgentService.
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { AgentSession } from '../common/agentService.js';
import { agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../common/agentHostUri.js';
import { PROTOCOL_VERSION } from '../common/state/sessionCapabilities.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from '../common/state/sessionProtocol.js';
import { isClientTransport } from '../common/state/sessionTransport.js';
import { AhpErrorCodes } from '../common/state/protocol/errors.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
/**
 * A protocol-level client for a single remote agent host connection.
 * Manages the WebSocket transport, handshake, subscriptions, action dispatch,
 * and command/response correlation.
 *
 * Implements {@link IAgentConnection} so consumers can program against
 * a single interface regardless of whether the agent host is local or remote.
 */
let RemoteAgentHostProtocolClient = class RemoteAgentHostProtocolClient extends Disposable {
    get clientId() {
        return this._clientId;
    }
    get address() {
        return this._address;
    }
    get defaultDirectory() {
        return this._defaultDirectory;
    }
    constructor(address, transport, _logService, _fileService) {
        super();
        this._logService = _logService;
        this._fileService = _fileService;
        this._clientId = generateUuid();
        this._serverSeq = 0;
        this._nextClientSeq = 1;
        this._onDidAction = this._register(new Emitter());
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = this._register(new Emitter());
        this.onDidNotification = this._onDidNotification.event;
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        /** Pending JSON-RPC requests keyed by request id. */
        this._pendingRequests = new Map();
        this._nextRequestId = 1;
        this._address = address;
        this._connectionAuthority = agentHostAuthority(address);
        this._transport = transport;
        this._register(this._transport);
        this._register(this._transport.onMessage(msg => this._handleMessage(msg)));
        this._register(this._transport.onClose(() => this._onDidClose.fire()));
    }
    /**
     * Connect to the remote agent host and perform the protocol handshake.
     */
    async connect() {
        if (isClientTransport(this._transport)) {
            await this._transport.connect();
        }
        const result = await this._sendRequest('initialize', {
            protocolVersion: PROTOCOL_VERSION,
            clientId: this._clientId,
        });
        this._serverSeq = result.serverSeq;
        // defaultDirectory arrives from the protocol as either a URI string
        // (e.g. "file:///Users/roblou") or a serialized URI object
        // ({ scheme, path, ... }). Extract just the filesystem path.
        if (result.defaultDirectory) {
            const dir = result.defaultDirectory;
            if (typeof dir === 'string') {
                this._defaultDirectory = URI.parse(dir).path;
            }
            else {
                this._defaultDirectory = URI.revive(dir).path;
            }
        }
    }
    /**
     * Subscribe to state at a URI. Returns the current state snapshot.
     */
    async subscribe(resource) {
        const result = await this._sendRequest('subscribe', { resource: resource.toString() });
        return result.snapshot;
    }
    /**
     * Unsubscribe from state at a URI.
     */
    unsubscribe(resource) {
        this._sendNotification('unsubscribe', { resource: resource.toString() });
    }
    /**
     * Dispatch a client action to the server. Returns the clientSeq used.
     */
    dispatchAction(action, _clientId, clientSeq) {
        this._sendNotification('dispatchAction', { clientSeq, action });
    }
    /**
     * Create a new session on the remote agent host.
     */
    async createSession(config) {
        const provider = config?.provider ?? 'copilot';
        const session = AgentSession.uri(provider, generateUuid());
        await this._sendRequest('createSession', {
            session: session.toString(),
            provider,
            model: config?.model,
            workingDirectory: config?.workingDirectory ? fromAgentHostUri(config.workingDirectory).toString() : undefined,
        });
        return session;
    }
    /**
     * Retrieve the server's resource metadata describing auth requirements.
     */
    async getResourceMetadata() {
        return await this._sendExtensionRequest('getResourceMetadata');
    }
    /**
     * Authenticate with the remote agent host using a specific scheme.
     */
    async authenticate(params) {
        return await this._sendExtensionRequest('authenticate', params);
    }
    /**
     * Refresh the model list from all providers on the remote host.
     */
    async refreshModels() {
        await this._sendExtensionRequest('refreshModels');
    }
    /**
     * Discover available agent backends from the remote host.
     */
    async listAgents() {
        return await this._sendExtensionRequest('listAgents');
    }
    /**
     * Gracefully shut down all sessions on the remote host.
     */
    async shutdown() {
        await this._sendExtensionRequest('shutdown');
    }
    /**
     * Dispose a session on the remote agent host.
     */
    async disposeSession(session) {
        await this._sendRequest('disposeSession', { session: session.toString() });
    }
    /**
     * List all sessions from the remote agent host.
     */
    async listSessions() {
        const result = await this._sendRequest('listSessions', {});
        return result.items.map((s) => ({
            session: URI.parse(s.resource),
            startTime: s.createdAt,
            modifiedTime: s.modifiedAt,
            summary: s.title,
            workingDirectory: typeof s.workingDirectory === 'string' ? toAgentHostUri(URI.parse(s.workingDirectory), this._connectionAuthority) : undefined,
        }));
    }
    /**
     * List the contents of a directory on the remote host's filesystem.
     */
    async resourceList(uri) {
        return await this._sendRequest('resourceList', { uri: uri.toString() });
    }
    /**
     * Read the content of a resource on the remote host.
     */
    async resourceRead(uri) {
        return this._sendRequest('resourceRead', { uri: uri.toString() });
    }
    async resourceWrite(params) {
        return this._sendRequest('resourceWrite', params);
    }
    async resourceCopy(params) {
        return this._sendRequest('resourceCopy', params);
    }
    async resourceDelete(params) {
        return this._sendRequest('resourceDelete', params);
    }
    async resourceMove(params) {
        return this._sendRequest('resourceMove', params);
    }
    _handleMessage(msg) {
        if (isJsonRpcRequest(msg)) {
            this._handleReverseRequest(msg.id, msg.method, msg.params);
        }
        else if (isJsonRpcResponse(msg)) {
            const pending = this._pendingRequests.get(msg.id);
            if (pending) {
                this._pendingRequests.delete(msg.id);
                if (hasKey(msg, { error: true })) {
                    this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
                    pending.error(new Error(msg.error.message));
                }
                else {
                    pending.complete(msg.result);
                }
            }
            else {
                this._logService.warn(`[RemoteAgentHostProtocol] Received response for unknown request id ${msg.id}`);
            }
        }
        else if (isJsonRpcNotification(msg)) {
            switch (msg.method) {
                case 'action': {
                    // Protocol envelope → VS Code envelope (superset of action types)
                    const envelope = msg.params;
                    this._serverSeq = Math.max(this._serverSeq, envelope.serverSeq);
                    this._onDidAction.fire(envelope);
                    break;
                }
                case 'notification': {
                    const notification = msg.params.notification;
                    this._logService.trace(`[RemoteAgentHostProtocol] Notification: ${notification.type}`);
                    this._onDidNotification.fire(notification);
                    break;
                }
                default:
                    this._logService.trace(`[RemoteAgentHostProtocol] Unhandled method: ${msg.method}`);
                    break;
            }
        }
        else {
            this._logService.warn(`[RemoteAgentHostProtocol] Unrecognized message:`, JSON.stringify(msg));
        }
    }
    /**
     * Handles reverse RPC requests from the server (e.g. resourceList,
     * resourceRead). Reads from the local file service and sends a response.
     */
    _handleReverseRequest(id, method, params) {
        const sendResult = (result) => {
            this._transport.send({ jsonrpc: '2.0', id, result });
        };
        const sendError = (err) => {
            const fsCode = toFileSystemProviderErrorCode(err instanceof Error ? err : undefined);
            let code = -32000;
            switch (fsCode) {
                case FileSystemProviderErrorCode.FileNotFound:
                    code = AhpErrorCodes.NotFound;
                    break;
                case FileSystemProviderErrorCode.NoPermissions:
                    code = AhpErrorCodes.PermissionDenied;
                    break;
                case FileSystemProviderErrorCode.FileExists:
                    code = AhpErrorCodes.AlreadyExists;
                    break;
            }
            this._transport.send({ jsonrpc: '2.0', id, error: { code, message: err instanceof Error ? err.message : String(err) } });
        };
        const handle = (fn) => {
            fn().then(sendResult, sendError);
        };
        const p = params;
        switch (method) {
            case 'resourceList':
                if (!p.uri) {
                    sendError(new Error('Missing uri'));
                    return;
                }
                return handle(async () => {
                    const stat = await this._fileService.resolve(URI.parse(p.uri));
                    return { entries: (stat.children ?? []).map(c => ({ name: c.name, type: c.isDirectory ? 'directory' : 'file' })) };
                });
            case 'resourceRead':
                if (!p.uri) {
                    sendError(new Error('Missing uri'));
                    return;
                }
                return handle(async () => {
                    const content = await this._fileService.readFile(URI.parse(p.uri));
                    return { data: encodeBase64(content.value), encoding: "base64" /* ContentEncoding.Base64 */ };
                });
            case 'resourceWrite':
                if (!p.uri || !p.data) {
                    sendError(new Error('Missing uri or data'));
                    return;
                }
                return handle(async () => {
                    const writeUri = URI.parse(p.uri);
                    const buf = p.encoding === "base64" /* ContentEncoding.Base64 */
                        ? decodeBase64(p.data)
                        : VSBuffer.fromString(p.data);
                    if (p.createOnly) {
                        await this._fileService.createFile(writeUri, buf, { overwrite: false });
                    }
                    else {
                        await this._fileService.writeFile(writeUri, buf);
                    }
                    return {};
                });
            case 'resourceDelete':
                if (!p.uri) {
                    sendError(new Error('Missing uri'));
                    return;
                }
                return handle(() => this._fileService.del(URI.parse(p.uri), { recursive: !!p.recursive }).then(() => ({})));
            case 'resourceMove':
                if (!p.source || !p.destination) {
                    sendError(new Error('Missing source or destination'));
                    return;
                }
                return handle(() => this._fileService.move(URI.parse(p.source), URI.parse(p.destination), !p.failIfExists).then(() => ({})));
            default:
                this._logService.warn(`[RemoteAgentHostProtocol] Unhandled reverse request: ${method}`);
                sendError(new Error(`Unknown method: ${method}`));
        }
    }
    /** Send a typed JSON-RPC notification for a protocol-defined method. */
    _sendNotification(method, params) {
        // Generic M can't satisfy the distributive IAhpNotification union directly
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        this._transport.send({ jsonrpc: '2.0', method, params });
    }
    /** Send a typed JSON-RPC request for a protocol-defined method. */
    _sendRequest(method, params) {
        const id = this._nextRequestId++;
        const deferred = new DeferredPromise();
        this._pendingRequests.set(id, deferred);
        // Generic M can't satisfy the distributive IAhpRequest union directly
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        this._transport.send({ jsonrpc: '2.0', id, method, params });
        return deferred.p;
    }
    /** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
    _sendExtensionRequest(method, params) {
        const id = this._nextRequestId++;
        const deferred = new DeferredPromise();
        this._pendingRequests.set(id, deferred);
        // Cast: extension methods aren't in the typed protocol maps yet
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        this._transport.send({ jsonrpc: '2.0', id, method, params });
        return deferred.p;
    }
    /**
     * Get the next client sequence number for optimistic dispatch.
     */
    nextClientSeq() {
        return this._nextClientSeq++;
    }
};
RemoteAgentHostProtocolClient = __decorate([
    __param(2, ILogService),
    __param(3, IFileService)
], RemoteAgentHostProtocolClient);
export { RemoteAgentHostProtocolClient };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxzRUFBc0U7QUFDdEUscUVBQXFFO0FBQ3JFLDJDQUEyQztBQUUzQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdkQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLDJCQUEyQixFQUFFLFlBQVksRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZILE9BQU8sRUFBRSxZQUFZLEVBQXFKLE1BQU0sMkJBQTJCLENBQUM7QUFDNU0sT0FBTyxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBR2pHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBcUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNuTCxPQUFPLEVBQUUsaUJBQWlCLEVB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