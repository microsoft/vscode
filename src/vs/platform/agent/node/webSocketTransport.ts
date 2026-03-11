/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// WebSocket transport for the sessions process protocol.
// Uses JSON serialization with URI revival for cross-process communication.

import { WebSocketServer, WebSocket } from 'ws';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { IProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';

// ---- JSON serialization helpers ---------------------------------------------

function uriReplacer(_key: string, value: unknown): unknown {
	if (value instanceof URI) {
		return value.toJSON();
	}
	if (value instanceof Map) {
		return { $type: 'Map', entries: [...value.entries()] };
	}
	return value;
}

function uriReviver(_key: string, value: unknown): unknown {
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (obj.$mid === 1) {
			return URI.revive(value as URI);
		}
		if (obj.$type === 'Map' && Array.isArray(obj.entries)) {
			return new Map(obj.entries as [unknown, unknown][]);
		}
	}
	return value;
}

// ---- Per-connection transport -----------------------------------------------

/**
 * Wraps a single WebSocket connection as an {@link IProtocolTransport}.
 * Messages are serialized as JSON with URI revival.
 */
export class WebSocketProtocolTransport extends Disposable implements IProtocolTransport {

	private readonly _onMessage = this._register(new Emitter<IProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	constructor(private readonly _ws: WebSocket) {
		super();

		this._ws.on('message', (data: Buffer | string) => {
			try {
				const text = typeof data === 'string' ? data : data.toString('utf-8');
				const message = JSON.parse(text, uriReviver) as IProtocolMessage;
				this._onMessage.fire(message);
			} catch {
				// Malformed message — drop. No logger available at transport level.
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

	send(message: IProtocolMessage): void {
		if (this._ws.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify(message, uriReplacer));
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
 */
export class WebSocketProtocolServer extends Disposable implements IProtocolServer {

	private readonly _wss: WebSocketServer;

	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;

	get address(): string | undefined {
		const addr = this._wss.address();
		if (!addr || typeof addr === 'string') {
			return addr ?? undefined;
		}
		return `${addr.address}:${addr.port}`;
	}

	constructor(
		private readonly _port: number,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._wss = new WebSocketServer({ port: this._port, host: '127.0.0.1' });
		this._logService.info(`[WebSocketProtocol] Server listening on 127.0.0.1:${this._port}`);

		this._wss.on('connection', (ws) => {
			this._logService.trace('[WebSocketProtocol] New client connection');
			const transport = new WebSocketProtocolTransport(ws);
			this._onConnection.fire(transport);
		});

		this._wss.on('error', (err) => {
			this._logService.error('[WebSocketProtocol] Server error', err);
		});
	}

	override dispose(): void {
		this._wss.close();
		super.dispose();
	}
}
