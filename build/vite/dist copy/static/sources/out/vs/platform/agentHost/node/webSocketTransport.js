/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// WebSocket transport for the sessions process protocol.
// Uses JSON serialization with URI revival for cross-process communication.
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import { JSON_RPC_PARSE_ERROR } from '../common/state/sessionProtocol.js';
// ---- Per-connection transport -----------------------------------------------
/**
 * Wraps a single WebSocket connection as an {@link IProtocolTransport}.
 * Messages are serialized as JSON with URI revival.
 */
export class WebSocketProtocolTransport extends Disposable {
    constructor(_ws, _WebSocket) {
        super();
        this._ws = _ws;
        this._WebSocket = _WebSocket;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onClose = this._register(new Emitter());
        this.onClose = this._onClose.event;
        this._ws.on('message', (data) => {
            try {
                const text = typeof data === 'string' ? data : data.toString('utf-8');
                const message = JSON.parse(text);
                this._onMessage.fire(message);
            }
            catch {
                this.send({ jsonrpc: '2.0', id: null, error: { code: JSON_RPC_PARSE_ERROR, message: 'Parse error' } });
            }
        });
        this._ws.on('close', () => {
            this._onClose.fire();
        });
        this._ws.on('error', () => {
            // Error always precedes close — closing is handled in the close handler.
            this._onClose.fire();
        });
    }
    send(message) {
        if (this._ws.readyState === this._WebSocket.OPEN) {
            this._ws.send(JSON.stringify(message));
        }
    }
    dispose() {
        this._ws.close();
        super.dispose();
    }
}
// ---- Server -----------------------------------------------------------------
/**
 * WebSocket server that accepts client connections and wraps each one
 * as an {@link IProtocolTransport}.
 *
 * Use the static {@link create} method to construct — it dynamically imports
 * `ws` and `http`/`url` so the modules are only loaded when needed.
 */
export class WebSocketProtocolServer extends Disposable {
    get address() {
        const addr = this._wss.address();
        if (!addr || typeof addr === 'string') {
            return addr ?? undefined;
        }
        return `${addr.address}:${addr.port}`;
    }
    /**
     * Creates a new WebSocket protocol server. Dynamically imports `ws`,
     * `http`, and `url` so callers don't pay the cost when unused.
     */
    static async create(options, logService) {
        const [ws, http, url] = await Promise.all([
            import('ws'),
            import('http'),
            import('url'),
        ]);
        return new WebSocketProtocolServer(options, logService, ws, http, url);
    }
    constructor(options, _logService, ws, http, url) {
        super();
        this._logService = _logService;
        this._onConnection = this._register(new Emitter());
        this.onConnection = this._onConnection.event;
        this._WebSocket = ws.WebSocket;
        // Backwards compat: accept a plain port number
        const opts = typeof options === 'number' ? { port: options } : options;
        const host = opts.host ?? '127.0.0.1';
        const verifyClient = opts.connectionTokenValidate
            ? (info, cb) => {
                const parsedUrl = url.parse(info.req.url ?? '', true);
                const token = parsedUrl.query[connectionTokenQueryName];
                if (!opts.connectionTokenValidate(token)) {
                    this._logService.warn('[WebSocketProtocol] Connection rejected: invalid connection token');
                    cb(false, 403, 'Forbidden');
                    return;
                }
                cb(true);
            }
            : undefined;
        if (opts.socketPath) {
            // For socket paths, create an HTTP server listening on the path
            // and attach the WebSocket server to it.
            this._httpServer = http.createServer();
            this._wss = new ws.WebSocketServer({ server: this._httpServer, verifyClient });
            this._httpServer.listen(opts.socketPath, () => {
                this._logService.info(`[WebSocketProtocol] Server listening on socket ${opts.socketPath}`);
            });
        }
        else {
            this._wss = new ws.WebSocketServer({ port: opts.port, host, verifyClient });
            this._logService.info(`[WebSocketProtocol] Server listening on ${host}:${opts.port}`);
        }
        this._wss.on('connection', (wsConn) => {
            this._logService.trace('[WebSocketProtocol] New client connection');
            const transport = new WebSocketProtocolTransport(wsConn, this._WebSocket);
            this._onConnection.fire(transport);
        });
        this._wss.on('error', (err) => {
            this._logService.error('[WebSocketProtocol] Server error', err);
        });
    }
    dispose() {
        this._wss.close();
        this._httpServer?.close();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViU29ja2V0VHJhbnNwb3J0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvd2ViU29ja2V0VHJhbnNwb3J0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLHlEQUF5RDtBQUN6RCw0RUFBNEU7QUFFNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsb0JBQW9CLEVBQTZFLE1BQU0sb0NBQW9DLENBQUM7QUF3QnJKLGdGQUFnRjtBQUVoRjs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sMEJBQTJCLFNBQVEsVUFBVTtJQVF6RCxZQUNrQixHQUFzQixFQUN0QixVQUFvQztRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQUhTLFFBQUcsR0FBSCxHQUFHLENBQW1CO1FBQ3RCLGVBQVUsR0FBVixVQUFVLENBQTBCO1FBUnJDLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFvQixDQUFDLENBQUM7UUFDckUsY0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRTFCLGFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN2RCxZQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFRdEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsSUFBcUIsRUFBRSxFQUFFO1lBQ2hELElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksR0FBRyxPQUFPLElBQUksS0FBSyxR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