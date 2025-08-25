/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as erdos from 'erdos';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { RuntimeClientState } from '../../../services/languageRuntime/common/languageRuntimeClientInstance.js';
import { ILanguageRuntimeMessageCommData, ILanguageRuntimeMessageCommOpen } from '../../../services/languageRuntime/common/languageRuntimeService.js';

export type ExtHostClientMessageSender = (id: string, data: Record<string, unknown>) => void;

export class ExtHostRuntimeClientInstance implements erdos.RuntimeClientInstance {
	private readonly _onDidChangeClientState = new Emitter<erdos.RuntimeClientState>();
	private readonly _onDidSendData = new Emitter<erdos.RuntimeClientOutput<Record<string, unknown>>>();
	private _state: erdos.RuntimeClientState;
	private _pendingRpcs = new Map<string, DeferredPromise<erdos.RuntimeClientOutput<any>>>();
	private _messageCounter = 0;

    constructor(readonly message: ILanguageRuntimeMessageCommOpen,
		readonly sender: ExtHostClientMessageSender,
		readonly closer: () => void) {

		this.onDidChangeClientState = this._onDidChangeClientState.event;
		this.onDidSendEvent = this._onDidSendData.event;

		this._state = RuntimeClientState.Connected;
		this.onDidChangeClientState((e) => {
			this._state = e;
		});
	}

    emitMessage(message: ILanguageRuntimeMessageCommData): void {
		const rpc = this._pendingRpcs.get(message.parent_id);
		if (rpc) {
			this._pendingRpcs.delete(message.parent_id);
			rpc.complete(
				{ data: message.data, buffers: message.buffers?.map(vsBuffer => vsBuffer.buffer) }
			);
		} else {
			this._onDidSendData.fire(
				{ data: message.data, buffers: message.buffers?.map(vsBuffer => vsBuffer.buffer) }
			);
		}
	}

	sendMessage(data: Record<string, unknown>): void {
		const id = `${this.getClientId()}-${this._messageCounter++}`;
		this.sender(id, data);
	}

	performRpcWithBuffers<T>(data: Record<string, unknown>): Promise<erdos.RuntimeClientOutput<T>> {
		const id = `${this.getClientId()}-${this._messageCounter++}`;
		const rpc = new DeferredPromise<erdos.RuntimeClientOutput<T>>();

		this._pendingRpcs.set(id, rpc);

		setTimeout(() => {
			if (this._pendingRpcs.has(id)) {
				this._pendingRpcs.delete(id);
				rpc.error(new Error('RPC timed out'));
			}
		}, 10000);

		this.sender(id, data);
		return rpc.p;
	}

	async performRpc<T>(data: Record<string, unknown>): Promise<T> {
		return (await this.performRpcWithBuffers<T>(data)).data;
	}

	onDidChangeClientState: Event<erdos.RuntimeClientState>;

	onDidSendEvent: Event<erdos.RuntimeClientOutput<Record<string, unknown>>>;

	getClientState(): erdos.RuntimeClientState {
		return this._state;
	}

	setClientState(state: erdos.RuntimeClientState): void {
		this._onDidChangeClientState.fire(state);
	}

	getClientId(): string {
		return this.message.comm_id;
	}

	getClientType(): erdos.RuntimeClientType {
		return this.message.target_name as erdos.RuntimeClientType;
	}

	dispose() {
		if (this._state === RuntimeClientState.Connected) {
			this._onDidChangeClientState.fire(RuntimeClientState.Closing);
			this._onDidChangeClientState.fire(RuntimeClientState.Closed);
			this.closer();
		}
	}
}
