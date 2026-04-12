/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DeferredPromise } from './async.js';
import { CancellationToken, CancellationTokenSource } from './cancellation.js';
import { CancellationError } from './errors.js';
import { Disposable, toDisposable } from './lifecycle.js';
import { hasKey } from './types.js';
export class JsonRpcError extends Error {
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
    }
}
/**
 * Generic JSON-RPC 2.0 protocol helper.
 */
export class JsonRpcProtocol extends Disposable {
    static { this.ParseError = -32700; }
    static { this.MethodNotFound = -32601; }
    static { this.InternalError = -32603; }
    constructor(_send, _handlers) {
        super();
        this._send = _send;
        this._handlers = _handlers;
        this._nextRequestId = 1;
        this._pendingRequests = new Map();
    }
    sendNotification(notification) {
        this._send({
            jsonrpc: '2.0',
            ...notification,
        });
    }
    sendRequest(request, token = CancellationToken.None, onCancel) {
        if (this._store.isDisposed) {
            return Promise.reject(new CancellationError());
        }
        const id = this._nextRequestId++;
        const promise = new DeferredPromise();
        const cts = new CancellationTokenSource();
        this._pendingRequests.set(id, { promise, cts });
        const cancelListener = token.onCancellationRequested(() => {
            if (!promise.isSettled) {
                this._pendingRequests.delete(id);
                cts.cancel();
                onCancel?.(id);
                promise.cancel();
            }
            cancelListener.dispose();
        });
        this._send({
            jsonrpc: '2.0',
            id,
            ...request,
        });
        return promise.p.finally(() => {
            cancelListener.dispose();
            this._pendingRequests.delete(id);
            cts.dispose(true);
        });
    }
    /**
     * Handles one or more incoming JSON-RPC messages.
     *
     * Returns an array of JSON-RPC response objects generated for any incoming
     * requests in the message(s). Notifications and responses to our own
     * outgoing requests do not produce return values. For batch inputs, the
     * returned responses are in the same order as the corresponding requests.
     *
     * Note: responses are also emitted via the `_send` callback, so callers
     * that rely on the return value should not re-send them.
     */
    async handleMessage(message) {
        if (Array.isArray(message)) {
            const replies = [];
            for (const single of message) {
                const reply = await this._handleMessage(single);
                if (reply) {
                    replies.push(reply);
                }
            }
            return replies;
        }
        const reply = await this._handleMessage(message);
        return reply ? [reply] : [];
    }
    cancelPendingRequest(id) {
        const request = this._pendingRequests.get(id);
        if (request) {
            this._pendingRequests.delete(id);
            request.cts.cancel();
            request.promise.cancel();
            request.cts.dispose(true);
        }
    }
    cancelAllRequests() {
        for (const [id, pending] of this._pendingRequests) {
            this._pendingRequests.delete(id);
            pending.cts.cancel();
            pending.promise.cancel();
            pending.cts.dispose(true);
        }
    }
    async _handleMessage(message) {
        if (isJsonRpcResponse(message)) {
            if (hasKey(message, { result: true })) {
                this._handleResult(message);
            }
            else {
                this._handleError(message);
            }
            return undefined;
        }
        if (isJsonRpcRequest(message)) {
            return this._handleRequest(message);
        }
        if (isJsonRpcNotification(message)) {
            this._handlers.handleNotification?.(message);
        }
        return undefined;
    }
    _handleResult(response) {
        const request = this._pendingRequests.get(response.id);
        if (request) {
            this._pendingRequests.delete(response.id);
            request.promise.complete(response.result);
            request.cts.dispose(true);
        }
    }
    _handleError(response) {
        if (response.id === undefined) {
            return;
        }
        const request = this._pendingRequests.get(response.id);
        if (request) {
            this._pendingRequests.delete(response.id);
            request.promise.error(new JsonRpcError(response.error.code, response.error.message, response.error.data));
            request.cts.dispose(true);
        }
    }
    async _handleRequest(request) {
        if (!this._handlers.handleRequest) {
            const response = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: JsonRpcProtocol.MethodNotFound,
                    message: `Method not found: ${request.method}`,
                }
            };
            this._send(response);
            return response;
        }
        const cts = new CancellationTokenSource();
        this._register(toDisposable(() => cts.dispose(true)));
        try {
            const resultOrThenable = this._handlers.handleRequest(request, cts.token);
            const result = isThenable(resultOrThenable) ? await resultOrThenable : resultOrThenable;
            const response = {
                jsonrpc: '2.0',
                id: request.id,
                result,
            };
            this._send(response);
            return response;
        }
        catch (error) {
            let response;
            if (error instanceof JsonRpcError) {
                response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: error.code,
                        message: error.message,
                        data: error.data,
                    }
                };
            }
            else {
                response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: JsonRpcProtocol.InternalError,
                        message: error instanceof Error ? error.message : 'Internal error',
                    }
                };
            }
            this._send(response);
            return response;
        }
        finally {
            cts.dispose(true);
        }
    }
    dispose() {
        this.cancelAllRequests();
        super.dispose();
    }
    static createParseError(message, data) {
        return {
            jsonrpc: '2.0',
            error: {
                code: JsonRpcProtocol.ParseError,
                message,
                data,
            }
        };
    }
}
export function isJsonRpcRequest(message) {
    return 'method' in message && 'id' in message && (typeof message.id === 'string' || typeof message.id === 'number');
}
export function isJsonRpcResponse(message) {
    return hasKey(message, { id: true, result: true }) || hasKey(message, { id: true, error: true });
}
export function isJsonRpcNotification(message) {
    return hasKey(message, { method: true }) && !hasKey(message, { id: true });
}
function isThenable(value) {
    return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblJwY1Byb3RvY29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vanNvblJwY1Byb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDN0MsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ2hELE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFlBQVksQ0FBQztBQWdEcEMsTUFBTSxPQUFPLFlBQWEsU0FBUSxLQUFLO0lBQ3RDLFlBQ2lCLElBQVksRUFDNUIsT0FBZSxFQUNDLElBQWM7UUFFOUIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBSkMsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUVaLFNBQUksR0FBSixJQUFJLENBQVU7SUFHL0IsQ0FBQztDQUNEO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sZUFBZ0IsU0FBUSxVQUFVO2FBQ3RCLGVBQVUsR0FBRyxDQUFDLEtBQUssQUFBVCxDQUFVO2FBQ3BCLG1CQUFjLEdBQUcsQ0FBQyxLQUFLLEFBQVQsQ0FBVTthQUN4QixrQkFBYSxHQUFHLENBQUMsS0FBSyxBQUFULENBQVU7SUFLL0MsWUFDa0IsS0FBd0MsRUFDeEMsU0FBbUM7UUFFcEQsS0FBSyxFQUFFLENBQUM7UUFIUyxVQUFLLEdBQUwsS0FBSyxDQUFtQztRQUN4QyxjQUFTLEdBQVQsU0FBUyxDQUEwQjtRQUw3QyxtQkFBYyxHQUFHLENBQUMsQ0FBQztRQUNWLHFCQUFnQixHQUFHLElBQUksR0FBRyxFQUE4QixD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