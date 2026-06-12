/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IMessagePassingProtocol } from '../../../../../base/parts/ipc/common/ipc.js';

/**
 * Minimal interface for the message-port side of the bridge.
 * Satisfied by both `worker_threads.Worker` (supervisor side) and
 * `worker_threads.parentPort` (worker side), as well as test fakes.
 */
export interface IMessagePortLike {
	postMessage(value: unknown, transfer?: ArrayBuffer[]): void;
	on(event: 'message', listener: (value: unknown) => void): void;
}

/**
 * Bridges an {@link IMessagePortLike} (structured-clone / ArrayBuffer transfer)
 * to {@link IMessagePassingProtocol} (VSBuffer messages) so that
 * {@link RPCProtocol} can run over a `worker_threads.MessagePort`.
 *
 * On the wire, messages are `ArrayBuffer` instances transferred zero-copy.
 */
export class MessagePortProtocol extends Disposable implements IMessagePassingProtocol {

	private readonly _onMessage = this._register(new Emitter<VSBuffer>());
	readonly onMessage: Event<VSBuffer> = this._onMessage.event;

	constructor(private readonly _port: IMessagePortLike) {
		super();
		_port.on('message', (value: unknown) => {
			if (value instanceof ArrayBuffer) {
				this._onMessage.fire(VSBuffer.wrap(new Uint8Array(value)));
			}
			// Non-ArrayBuffer messages are ignored — they belong to other
			// protocols (e.g. WorkerConnection lifecycle messages).
		});
	}

	send(buffer: VSBuffer): void {
		const data = buffer.buffer;
		const ab = data.buffer;
		if (typeof SharedArrayBuffer !== 'undefined' && ab instanceof SharedArrayBuffer) {
			// SharedArrayBuffer cannot be transferred; must copy
			const copy = new ArrayBuffer(data.byteLength);
			new Uint8Array(copy).set(data);
			this._port.postMessage(copy, [copy]);
		} else if (data.byteOffset === 0 && data.byteLength === ab.byteLength) {
			// Uint8Array covers the entire ArrayBuffer — transfer zero-copy.
			// The sender's ArrayBuffer is detached after this call.
			this._port.postMessage(ab, [ab as ArrayBuffer]);
		} else {
			// Uint8Array is a sub-view — must slice to get a transferable ArrayBuffer
			const copy = (ab as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
			this._port.postMessage(copy, [copy]);
		}
	}
}
