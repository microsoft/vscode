/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { JSON_RPC_PARSE_ERROR, type AhpServerNotification, type JsonRpcNotification, type JsonRpcParseErrorResponse, type JsonRpcRequest, type JsonRpcResponse, type ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';

/**
 * Adapts MessagePort IPC clients to Agent Host Protocol transports.
 *
 * Consumers must call {@link closeClient} when a UtilityProcessServer client
 * connection disappears.
 */
export class MessagePortProtocolServer<TContext> extends Disposable implements IProtocolServer, IServerChannel<TContext> {

	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;

	readonly address = undefined;

	private readonly _transports = new Map<TContext, MessagePortProtocolTransport>();

	listen<T>(ctx: TContext, event: string): Event<T> {
		switch (event) {
			case 'frame':
				return this._getOrCreateTransport(ctx).onFrame as Event<T>;
			case 'close':
				return this._getOrCreateTransport(ctx).onClose as Event<T>;
		}

		throw new Error(`Invalid listen: ${event}`);
	}

	async call<T>(ctx: TContext, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'connect': {
				const transport = this._getOrCreateTransport(ctx);
				if (transport.connect()) {
					this._onConnection.fire(transport);
				}
				return undefined as T;
			}
			case 'send': {
				if (typeof arg !== 'string') {
					throw new Error('send: arg must be a string frame');
				}

				const transport = this._transports.get(ctx);
				if (!transport?.isConnected) {
					throw new Error('send: client is not connected');
				}

				transport.acceptFrame(arg);
				return undefined as T;
			}
			case 'close':
				this.closeClient(ctx);
				return undefined as T;
		}

		throw new Error(`Invalid call: ${command}`);
	}

	/**
	 * Closes a client's transport after its owning IPC connection disappears.
	 */
	closeClient(ctx: TContext): void {
		const transport = this._transports.get(ctx);
		if (!transport) {
			return;
		}

		this._transports.delete(ctx);
		transport.dispose();
	}

	override dispose(): void {
		const transports = [...this._transports.values()];
		this._transports.clear();
		for (const transport of transports) {
			transport.dispose();
		}
		super.dispose();
	}

	private _getOrCreateTransport(ctx: TContext): MessagePortProtocolTransport {
		if (this._store.isDisposed) {
			throw new Error('MessagePortProtocolServer is disposed');
		}

		let transport = this._transports.get(ctx);
		if (!transport) {
			transport = new MessagePortProtocolTransport();
			this._transports.set(ctx, transport);

			const onClose = transport.onClose(() => {
				onClose.dispose();
				if (this._transports.get(ctx) === transport) {
					this._transports.delete(ctx);
				}
			});
		}

		return transport;
	}
}

class MessagePortProtocolTransport extends Disposable implements IProtocolTransport {

	private readonly _onFrame = this._register(new Emitter<string>());
	readonly onFrame = this._onFrame.event;

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private _isConnected = false;
	private _isClosed = false;

	get isConnected(): boolean {
		return this._isConnected && !this._isClosed;
	}

	connect(): boolean {
		if (this._isClosed || this._isConnected) {
			return false;
		}

		this._isConnected = true;
		return true;
	}

	acceptFrame(frame: string): void {
		try {
			this._onMessage.fire(JSON.parse(frame) as ProtocolMessage);
		} catch {
			this.send({ jsonrpc: '2.0', id: null, error: { code: JSON_RPC_PARSE_ERROR, message: 'Parse error' } });
		}
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest): void {
		if (!this.isConnected) {
			return;
		}

		this._onFrame.fire(JSON.stringify(message));
	}

	override dispose(): void {
		if (this._isClosed) {
			return;
		}

		this._isClosed = true;
		this._isConnected = false;
		this._onClose.fire();
		super.dispose();
	}
}
