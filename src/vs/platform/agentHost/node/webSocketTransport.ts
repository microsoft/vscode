/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// WebSocket transport for the sessions process protocol.
// Uses JSON serialization with URI revival for cross-process communication.

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import { ILogService } from '../../log/common/log.js';
import { JSON_RPC_PARSE_ERROR, type AhpServerNotification, type JsonRpcResponse, type ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import type * as wsTypes from 'ws';
import type * as httpTypes from 'http';
import type * as urlTypes from 'url';

/**
 * Options for creating a {@link WebSocketProtocolServer}.
 * Provide either `port`+`host` or `socketPath`, not both.
 */
export interface IWebSocketServerOptions {
	/** TCP port to listen on. Ignored when {@link socketPath} is set. */
	readonly port?: number;
	/** Host/IP to bind to. Defaults to `'127.0.0.1'`. */
	readonly host?: string;
	/** Unix domain socket / Windows named pipe path. Takes precedence over port. */
	readonly socketPath?: string;
	/**
	 * Optional token validator. When provided, WebSocket upgrade requests
	 * must include a valid token in the `tkn` query parameter.
	 */
	readonly connectionTokenValidate?: (token: unknown) => boolean;
}

// ---- Per-connection transport -----------------------------------------------

/**
 * Wraps a single WebSocket connection as an {@link IProtocolTransport}.
 * Messages are serialized as JSON with URI revival.
 */
export class WebSocketProtocolTransport extends Disposable implements IProtocolTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	constructor(
		private readonly _ws: wsTypes.WebSocket,
		private readonly _WebSocket: typeof wsTypes.WebSocket,
	) {
		super();

		this._ws.on('message', (data: Buffer | string) => {
			try {
				const text = typeof data === 'string' ? data : data.toString('utf-8');
				const message = JSON.parse(text) as ProtocolMessage;
				this._onMessage.fire(message);
			} catch {
				this.send({ jsonrpc: '2.0', id: null!, error: { code: JSON_RPC_PARSE_ERROR, message: 'Parse error' } });
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

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcResponse): void {
		if (this._ws.readyState === this._WebSocket.OPEN) {
			this._ws.send(JSON.stringify(message));
		}
	}

	override dispose(): void {
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
export class WebSocketProtocolServer extends Disposable implements IProtocolServer {

	private readonly _wss: wsTypes.WebSocketServer;
	private readonly _httpServer: httpTypes.Server | undefined;
	private readonly _WebSocket: typeof wsTypes.WebSocket;

	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;

	get address(): string | undefined {
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
	static async create(
		options: IWebSocketServerOptions | number,
		logService: ILogService,
	): Promise<WebSocketProtocolServer> {
		const [ws, http, url] = await Promise.all([
			import('ws'),
			import('http'),
			import('url'),
		]);
		return new WebSocketProtocolServer(options, logService, ws, http, url);
	}

	private constructor(
		options: IWebSocketServerOptions | number,
		private readonly _logService: ILogService,
		ws: typeof wsTypes,
		http: typeof httpTypes,
		url: typeof urlTypes,
	) {
		super();

		this._WebSocket = ws.WebSocket;

		// Backwards compat: accept a plain port number
		const opts: IWebSocketServerOptions = typeof options === 'number' ? { port: options } : options;
		const host = opts.host ?? '127.0.0.1';

		const verifyClient = opts.connectionTokenValidate
			? (info: { req: httpTypes.IncomingMessage }, cb: (res: boolean, code?: number, message?: string) => void) => {
				const parsedUrl = url.parse(info.req.url ?? '', true);
				const token = parsedUrl.query[connectionTokenQueryName];
				if (!opts.connectionTokenValidate!(token)) {
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
		} else {
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

	override dispose(): void {
		this._wss.close();
		this._httpServer?.close();
		super.dispose();
	}
}
