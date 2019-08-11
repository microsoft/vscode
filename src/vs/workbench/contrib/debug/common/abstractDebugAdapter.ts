/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDebugAdapter } from 'vs/workbench/contrib/debug/common/debug';

/**
 * Abstract implementation of the low level API for a debug adapter.
 * Missing is how this API communicates with the debug adapter.
 */
export abstract class AbstractDebugAdapter implements IDebugAdapter {

	private sequence: number;
	private pendingRequests = new Map<number, (e: DebugProtocol.Response) => void>();
	private requestCallback: ((request: DebugProtocol.Request) => void) | undefined;
	private eventCallback: ((request: DebugProtocol.Event) => void) | undefined;
	private messageCallback: ((message: DebugProtocol.ProtocolMessage) => void) | undefined;
	protected readonly _onError: Emitter<Error>;
	protected readonly _onExit: Emitter<number | null>;

	constructor() {
		this.sequence = 1;
		this._onError = new Emitter<Error>();
		this._onExit = new Emitter<number>();
	}

	abstract startSession(): Promise<void>;

	abstract stopSession(): Promise<void>;

	abstract sendMessage(message: DebugProtocol.ProtocolMessage): void;

	get onError(): Event<Error> {
		return this._onError.event;
	}

	get onExit(): Event<number | null> {
		return this._onExit.event;
	}

	onMessage(callback: (message: DebugProtocol.ProtocolMessage) => void): void {
		if (this.eventCallback) {
			this._onError.fire(new Error(`attempt to set more than one 'Message' callback`));
		}
		this.messageCallback = callback;
	}

	onEvent(callback: (event: DebugProtocol.Event) => void): void {
		if (this.eventCallback) {
			this._onError.fire(new Error(`attempt to set more than one 'Event' callback`));
		}
		this.eventCallback = callback;
	}

	onRequest(callback: (request: DebugProtocol.Request) => void): void {
		if (this.requestCallback) {
			this._onError.fire(new Error(`attempt to set more than one 'Request' callback`));
		}
		this.requestCallback = callback;
	}

	sendResponse(response: DebugProtocol.Response): void {
		if (response.seq > 0) {
			this._onError.fire(new Error(`attempt to send more than one response for command ${response.command}`));
		}
		else {
			this.internalSend('response', response);
		}
	}

	sendRequest(command: string, args: any, clb: (result: DebugProtocol.Response) => void, timeout?: number): void {
		const request: any = {
			command: command
		};
		if (args && Object.keys(args).length > 0) {
			request.arguments = args;
		}
		this.internalSend('request', request);
		if (typeof timeout === 'number') {
			const timer = setTimeout(() => {
				clearTimeout(timer);
				const clb = this.pendingRequests.get(request.seq);
				if (clb) {
					this.pendingRequests.delete(request.seq);
					const err: DebugProtocol.Response = {
						type: 'response',
						seq: 0,
						request_seq: request.seq,
						success: false,
						command,
						message: `timeout after ${timeout} ms`
					};
					clb(err);
				}
			}, timeout);
		}
		if (clb) {
			// store callback for this request
			this.pendingRequests.set(request.seq, clb);
		}
	}

	acceptMessage(message: DebugProtocol.ProtocolMessage): void {
		if (this.messageCallback) {
			this.messageCallback(message);
		}
		else {
			switch (message.type) {
				case 'event':
					if (this.eventCallback) {
						this.eventCallback(<DebugProtocol.Event>message);
					}
					break;
				case 'request':
					if (this.requestCallback) {
						this.requestCallback(<DebugProtocol.Request>message);
					}
					break;
				case 'response':
					const response = <DebugProtocol.Response>message;
					const clb = this.pendingRequests.get(response.request_seq);
					if (clb) {
						this.pendingRequests.delete(response.request_seq);
						clb(response);
					}
					break;
			}
		}
	}

	private internalSend(typ: 'request' | 'response' | 'event', message: DebugProtocol.ProtocolMessage): void {
		message.type = typ;
		message.seq = this.sequence++;
		this.sendMessage(message);
	}

	protected cancelPending() {
		const pending = this.pendingRequests;
		this.pendingRequests.clear();
		setTimeout(_ => {
			pending.forEach((callback, request_seq) => {
				const err: DebugProtocol.Response = {
					type: 'response',
					seq: 0,
					request_seq,
					success: false,
					command: 'canceled',
					message: 'canceled'
				};
				callback(err);
			});
		}, 1000);
	}

	dispose(): void {
		this.cancelPending();
	}
}
