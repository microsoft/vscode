/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, toDisposable }  from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';

enum RequestType {
	Common,
	Cancel
}

interface IRawRequest {
	id: number;
	type: RequestType;
	channelName?: string;
	name?: string;
	arg?: any;
}

interface IRequest {
	raw: IRawRequest;
	emitter?: Emitter<any>;
	flush?: ()=>void;
}

enum ResponseType {
	Initialize,
	Success,
	Progress,
	Error,
	ErrorObj
}

interface IRawResponse {
	id: number;
	type: ResponseType;
	data: any;
}

interface IHandler {
	(response: IRawResponse): void;
}

export interface IMessagePassingProtocol {
	send(request: any): void;
	onMessage(callback: (response: any) => void): void;
}

enum State {
	Uninitialized,
	Idle
}

export interface IChannel {
	call(command: string, arg: any): TPromise<any>;
}

export interface IServer {
	registerChannel(channelName: string, channel: IChannel): void;
}

export interface IClient {
	getChannel<T extends IChannel>(channelName: string): T;
}

export class Server {

	private channels: { [name: string]: IChannel };
	private activeRequests: { [id: number]: IDisposable; };

	constructor(private protocol: IMessagePassingProtocol) {
		this.channels = Object.create(null);
		this.activeRequests = Object.create(null);
		this.protocol.onMessage(r => this.onMessage(r));
		this.protocol.send(<IRawResponse> { type: ResponseType.Initialize });
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.channels[channelName] = channel;
	}

	private onMessage(request: IRawRequest): void {
		switch (request.type) {
			case RequestType.Common:
				this.onCommonRequest(request);
				break;

			case RequestType.Cancel:
				this.onCancelRequest(request);
				break;
		}
	}

	private onCommonRequest(request: IRawRequest): void {
		const channel = this.channels[request.channelName];
		let promise: Promise;

		try {
			promise = channel.call(request.name, request.arg);
		} catch (err) {
			promise = Promise.wrapError(err);
		}

		const id = request.id;

		const requestPromise = promise.then(data => {
			this.protocol.send(<IRawResponse> { id, data, type: ResponseType.Success });
			delete this.activeRequests[request.id];
		}, data => {
			if (data instanceof Error) {
				this.protocol.send(<IRawResponse> { id, data: {
					message: data.message,
					name: data.name,
					stack: data.stack ? data.stack.split('\n') : void 0
				}, type: ResponseType.Error });
			} else {
				this.protocol.send(<IRawResponse> { id, data, type: ResponseType.ErrorObj });
			}

			delete this.activeRequests[request.id];
		}, data => {
			this.protocol.send(<IRawResponse> { id, data, type: ResponseType.Progress });
		});

		this.activeRequests[request.id] = toDisposable(() => requestPromise.cancel());
	}

	private onCancelRequest(request: IRawRequest): void {
		const disposable = this.activeRequests[request.id];

		if (disposable) {
			disposable.dispose();
			delete this.activeRequests[request.id];
		}
	}

	public dispose(): void {
		Object.keys(this.activeRequests).forEach(id => {
			this.activeRequests[<any>id].dispose();
		});

		this.activeRequests = null;
	}
}

export class Client implements IClient {

	private state: State;
	private bufferedRequests: IRequest[];
	private handlers: { [id: number]: IHandler; };
	private lastRequestId: number;

	constructor(private protocol: IMessagePassingProtocol) {
		this.state = State.Uninitialized;
		this.bufferedRequests = [];
		this.handlers = Object.create(null);
		this.lastRequestId = 0;
		this.protocol.onMessage(r => this.onMessage(r));
	}

	getChannel<T extends IChannel>(channelName: string): T {
		const call = (command, arg) => this.request(channelName, command, arg);
		return { call } as T;
	}

	private request(channelName: string, name: string, arg: any): Promise {
		const request = {
			raw: {
				id: this.lastRequestId++,
				type: RequestType.Common,
				channelName,
				name,
				arg
			}
		};

		if (this.state === State.Uninitialized) {
			return this.bufferRequest(request);
		}

		return this.doRequest(request);
	}

	private doRequest(request: IRequest): Promise {
		const id = request.raw.id;

		return new Promise((c, e, p) => {
			this.handlers[id] = response => {
				switch (response.type) {
					case ResponseType.Success:
						delete this.handlers[id];
						c(response.data);
						break;

					case ResponseType.Error:
						delete this.handlers[id];
						const error = new Error(response.data.message);
						(<any> error).stack = response.data.stack;
						error.name = response.data.name;
						e(error);
						break;

					case ResponseType.ErrorObj:
						delete this.handlers[id];
						e(response.data);
						break;

					case ResponseType.Progress:
						p(response.data);
						break;
				}
			};

			this.send(request.raw);
		},
		() => this.send({ id, type: RequestType.Cancel }));
	}

	private bufferRequest(request: IRequest): Promise {
		let flushedRequest: Promise = null;

		return new Promise((c, e, p) => {
			this.bufferedRequests.push(request);

			request.flush = () => {
				request.flush = null;
				flushedRequest = this.doRequest(request).then(c, e, p);
			};
		}, () => {
			request.flush = null;

			if (this.state !== State.Uninitialized) {
				if (flushedRequest) {
					flushedRequest.cancel();
					flushedRequest = null;
				}

				return;
			}

			const idx = this.bufferedRequests.indexOf(request);

			if (idx === -1) {
				return;
			}

			this.bufferedRequests.splice(idx, 1);
		});
	}

	private onMessage(response: IRawResponse): void {
		if (this.state === State.Uninitialized && response.type === ResponseType.Initialize) {
			this.state = State.Idle;
			this.bufferedRequests.forEach(r => r.flush && r.flush());
			this.bufferedRequests = null;
			return;
		}

		const handler = this.handlers[response.id];
		if (handler) {
			handler(response);
		}
	}

	private send(raw: IRawRequest) {
		try {
			this.protocol.send(raw);
		} catch (err) {
			// noop
		}
	}
}

export function getDelayedChannel<T extends IChannel>(promise: TPromise<IChannel>): T {
	const call = (command, arg) => promise.then(c => c.call(command, arg));
	return { call } as T;
}

export function getNextTickChannel<T extends IChannel>(channel: T): T {
	let didTick = false;

	const call = (command, arg) => {
		if (didTick) {
			return channel.call(command, arg);
		}

		return TPromise.timeout(0)
			.then(() => didTick = true)
			.then(() => channel.call(command, arg));
	};

	return { call } as T;
}

export function eventToCall(event: Event<any>): TPromise<any> {
	let disposable: IDisposable;

	return new Promise(
		(c, e, p) => disposable = event(p),
		() => disposable.dispose()
	);
}

export function eventFromCall<T>(channel: IChannel, name: string): Event<T> {
	let promise: Promise;

	const emitter = new Emitter<any>({
		onFirstListenerAdd: () => {
			promise = channel.call(name, null).then(null, err => null, e => emitter.fire(e));
		},
		onLastListenerRemove: () => {
			promise.cancel();
			promise = null;
		}
	});

	return emitter.event;
}