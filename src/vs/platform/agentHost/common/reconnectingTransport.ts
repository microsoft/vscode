/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type { AgentHostClientConnectionKind } from './agentHostTelemetry.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from './state/sessionProtocol.js';
import type { IClientTransport, IProtocolTransport } from './state/sessionTransport.js';

/**
 * A connected transport and the optional owner-specific resource teardown for its establishment attempt.
 */
export interface IEstablishedTransport {
	/** The live inner transport to route traffic through. */
	readonly transport: IProtocolTransport;
	/** Tear down whatever this attempt established. Omitted when the caller owns teardown. */
	close?(): Promise<void>;
}

/** Owns one adopted transport and the listeners and resources associated with it. */
class EstablishedTransportStore extends DisposableStore {
	constructor(readonly transport: IProtocolTransport) {
		super();
	}
}

/**
 * Establishes an inner transport on demand and forwards its protocol traffic.
 */
export class ReconnectingTransport extends Disposable implements IClientTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private readonly _establishedTransport = this._register(new MutableDisposable<EstablishedTransportStore>());
	private _connectPromise: Promise<void> | undefined;

	constructor(
		private readonly _establish: () => Promise<IEstablishedTransport>,
		private readonly _logService: ILogService,
		private readonly _logPrefix: string,
		readonly clientConnectionKind: AgentHostClientConnectionKind | undefined = undefined,
		private readonly _sendBeforeConnectWarning = 'send before the transport was established; dropping message',
	) {
		super();
	}

	/** Establishes and adopts the inner transport. */
	connect(): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.reject(new Error('Transport is disposed'));
		}

		this._connectPromise ??= this._establishTransport();
		return this._connectPromise;
	}

	/** Routes a protocol message through the established inner transport. */
	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest): void {
		const establishedTransport = this._establishedTransport.value;
		if (!establishedTransport) {
			this._logService.warn(`${this._logPrefix} ${this._sendBeforeConnectWarning}`);
			return;
		}

		establishedTransport.transport.send(message);
	}

	private async _establishTransport(): Promise<void> {
		// Do not catch: NonReconnectableTransportError must reach the protocol client unchanged.
		const establishedTransport = await this._establish();
		if (this._store.isDisposed) {
			// A late establishment needs releasing, while its caller must not proceed without a live channel.
			await this._disposeEstablishedTransport(establishedTransport);
			throw new Error(`${this._logPrefix} transport was disposed while establishing`);
		}

		const transportStore = new EstablishedTransportStore(establishedTransport.transport);
		transportStore.add(toDisposable(() => void this._disposeEstablishedTransport(establishedTransport)));
		try {
			transportStore.add(establishedTransport.transport.onMessage(message => this._onMessage.fire(message)));
			transportStore.add(establishedTransport.transport.onClose(() => this._onClose.fire()));
			this._establishedTransport.value = transportStore;
		} catch (err) {
			transportStore.dispose();
			throw err;
		}
	}

	private async _disposeEstablishedTransport(establishedTransport: IEstablishedTransport): Promise<void> {
		try {
			establishedTransport.transport.dispose();
		} catch (err) {
			this._logService.error(`${this._logPrefix} inner transport dispose failed`, err);
		}

		try {
			await establishedTransport.close?.();
		} catch (err) {
			this._logService.error(`${this._logPrefix} transport close failed`, err);
		}
	}
}
