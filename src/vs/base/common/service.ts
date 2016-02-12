/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import { IDisposable, fnToDisposable }  from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';

enum RequestType {
	Common,
	Cancel
}

interface IRawRequest {
	id: number;
	type: RequestType;
	serviceName?: string;
	name?: string;
	args?: any[];
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

export interface IServiceCtor<T> {
	new? (): T;
	new? (arg0: any): T;
	new? (a0: any, a1: any): T;
	new? (a0: any, a1: any, a2: any): T;
	new? (a0: any, a1: any, a2: any, a3: any): T;
	new? (a0: any, a1: any, a2: any, a3: any, a4: any): T;
	prototype: any;
}

enum ServiceState {
	Uninitialized,
	Idle
}

export interface IServiceMap {
	[name: string]: any;
}

export interface IClient {
	getService<TService>(serviceName: string, serviceCtor: IServiceCtor<TService>): TService;
}

const ServiceEventProperty = '$__SERVICE_EVENT';

/**
 * Use this as a property decorator.
 */
export function ServiceEvent<T>(target: T, key: string): void {
	target[key] = { [ServiceEventProperty]: true };
}

export function isServiceEvent(target: any): boolean {
	return target[ServiceEventProperty];
}

export class Server {

	private services: IServiceMap;
	private activeRequests: { [id: number]: IDisposable; };

	constructor(private protocol: IMessagePassingProtocol) {
		this.services = Object.create(null);
		this.activeRequests = Object.create(null);
		this.protocol.onMessage(r => this.onMessage(r));
		this.protocol.send(<IRawResponse> { type: ResponseType.Initialize });
	}

	registerService<TService>(serviceName: string, service: TService): void {
		this.services[serviceName] = service;
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
		const service = this.services[request.serviceName];
		const servicePrototype = service.constructor.prototype;
		const prototypeMethod = servicePrototype && servicePrototype[request.name];
		const isEvent = prototypeMethod && prototypeMethod[ServiceEventProperty];
		const method = service[request.name];
		let promise: Promise;

		if (isEvent) {
			let disposable: IDisposable;

			promise = new Promise(
				(c, e, p) => disposable = method.call(service, p),
				() => disposable.dispose()
			);
		} else {
			if (!method) {
				promise = Promise.wrapError(new Error(`${ request.name } is not a valid method on ${ request.serviceName }`));
			} else {
				try {
					promise = method.call(service, ...request.args);
				} catch (err) {
					promise = Promise.wrapError(err);
				}
			}

			if (!Promise.is(promise)) {
				const message = `'${ request.name }' did not return a promise`;
				console.warn(message);
				promise = Promise.wrapError(new Error(message));
			}
		}

		this.onPromiseRequest(promise, request);
	}

	private onPromiseRequest(promise: Promise, request: IRawRequest): void {
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

		this.activeRequests[request.id] = fnToDisposable(() => requestPromise.cancel());
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

	private state: ServiceState;
	private bufferedRequests: IRequest[];
	private handlers: { [id: number]: IHandler; };
	private lastRequestId: number;

	constructor(private protocol: IMessagePassingProtocol) {
		this.state = ServiceState.Uninitialized;
		this.bufferedRequests = [];
		this.handlers = Object.create(null);
		this.lastRequestId = 0;
		this.protocol.onMessage(r => this.onMessage(r));
	}

	getService<TService>(serviceName: string, serviceCtor: IServiceCtor<TService>): TService {
		const props = Object.keys(serviceCtor.prototype)
			.filter(key => key !== 'constructor');

		return <TService> props.reduce((service, key) => {
			if (serviceCtor.prototype[key][ServiceEventProperty]) {
				let promise: Promise;

				const emitter = new Emitter<any>({
					onFirstListenerAdd: () => {
						promise = this.request(serviceName, key)
							.then(null, null, event => emitter.fire(event));
					},
					onLastListenerRemove: () => {
						promise.cancel();
						promise = null;
					}
				});

				return assign(service, { [key]: emitter.event });
			}

			return assign(service, { [key]: (...args) => this.request(serviceName, key, ...args) });
		}, {});
	}

	private request(serviceName: string, name: string, ...args: any[]): Promise {
		const request = {
			raw: {
				id: this.lastRequestId++,
				type: RequestType.Common,
				serviceName,
				name,
				args
			}
		};

		if (this.state === ServiceState.Uninitialized) {
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

			if (this.state !== ServiceState.Uninitialized) {
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
		if (this.state === ServiceState.Uninitialized && response.type === ResponseType.Initialize) {
			this.state = ServiceState.Idle;
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

/**
 * Useful when the service itself is needed right away but the client
 * is wrapped within a promise.
 */
export function getService<TService>(clientPromise: TPromise<IClient>, serviceName: string, serviceCtor: IServiceCtor<TService>): TService {
	let _servicePromise: TPromise<TService>;
	let servicePromise = () => {
		if (!_servicePromise) {
			_servicePromise = clientPromise.then(client => client.getService(serviceName, serviceCtor));
		}
		return _servicePromise;
	};

	return Object.keys(serviceCtor.prototype)
		.filter(key => key !== 'constructor')
		.reduce((result, key) => {
			if (isServiceEvent(serviceCtor.prototype[key])) {
				let promise: TPromise<void>;
				let disposable: IDisposable;

				const emitter = new Emitter<any>({
					onFirstListenerAdd: () => {
						promise = servicePromise().then(service => {
							disposable = service[key](e => emitter.fire(e));
						});
					},
					onLastListenerRemove: () => {
						if (disposable) {
							disposable.dispose();
							disposable = null;
						}
						promise.cancel();
						promise = null;
					}
				});

				return assign(result, { [key]: emitter.event });
			}

			return assign(result, {
				[key]: (...args) => {
					return servicePromise().then(service => service[key](...args));
				}
			});
		}, {} as TService);
}