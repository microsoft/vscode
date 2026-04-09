/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Worker, WorkerOptions } from 'worker_threads';

export type RpcRequest = { id: number; fn: string; args: any[] };

export type RpcResponse = { id: number; res?: any; err?: Error };

/**
 * Holds promises for RPC requests and resolves them when the call completes.
 */
export class RcpResponseHandler {
	private nextId = 1;

	private readonly handlers = new Map<number, { resolve: (res: any) => void; reject: (err: Error) => void }>();

	public createHandler<T>(): { id: number; result: Promise<T> } {
		const id = this.nextId++;
		let resolve: (res: any) => void;
		let reject: (err: Error) => void;
		const result = new Promise<any>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		this.handlers.set(id, { resolve: resolve!, reject: reject! });
		return { id, result };
	}

	public handleResponse(response: RpcResponse) {
		const handler = this.handlers.get(response.id);
		if (!handler) {
			return;
		}

		this.handlers.delete(response.id);
		if (response.err) {
			handler.reject(response.err);
		} else {
			handler.resolve(response.res);
		}
	}

	/**
	 * Handle an unexpected error by logging it and rejecting all handlers.
	 */
	public handleError(err: Error) {
		for (const handler of this.handlers.values()) {
			handler.reject(err);
		}
		this.handlers.clear();
	}

	public clear() {
		this.handlers.clear();
	}
}

export type RpcProxy<ProxyType> = {
	[K in keyof ProxyType]: ProxyType[K] extends ((...args: infer Args) => infer R) ? (...args: Args) => Promise<Awaited<R>> : never;
}

export function createRpcProxy<ProxyType>(remoteCall: (name: string, args: any[]) => Promise<any>): RpcProxy<ProxyType> {
	const handler = {
		get: (target: any, name: PropertyKey) => {
			if (typeof name === 'string' && !target[name]) {
				target[name] = (...myArgs: any[]) => {
					return remoteCall(name, myArgs);
				};
			}
			return target[name];
		}
	};
	return new Proxy(Object.create(null), handler);
}

export class WorkerWithRpcProxy<WorkerProxyType, HostProxyType = {}> {
	private readonly worker: Worker;
	private readonly responseHandler = new RcpResponseHandler();

	public readonly proxy: RpcProxy<WorkerProxyType>;

	constructor(workerPath: string, workerOptions?: WorkerOptions, host?: HostProxyType) {
		this.worker = new Worker(workerPath, workerOptions);
		this.worker.on('message', async (msg: RpcRequest | RpcResponse) => {
			if ('fn' in msg) {
				try {
					const response = await (host as any)?.[msg.fn].apply(host, msg.args);
					this.worker.postMessage({ id: msg.id, res: response } satisfies RpcResponse);
				} catch (err) {
					this.worker.postMessage({ id: msg.id, err } satisfies RpcResponse);
				}
			} else {
				this.responseHandler.handleResponse(msg);
			}
		});
		this.worker.on('error', (err) => this.handleError(err));

		this.worker.on('exit', code => {
			if (code !== 0) {
				this.handleError(new Error(`Worker thread exited with code ${code}.`));
			}
		});

		this.proxy = createRpcProxy((fn: string, args: any[]): Promise<any> => {
			if (!this.worker) {
				throw new Error(`Worker was terminated!`);
			}

			const { id, result } = this.responseHandler.createHandler<any>();
			this.worker.postMessage({ id, fn, args } satisfies RpcRequest);
			return result;
		});
	}

	terminate() {
		this.worker.removeAllListeners();
		this.worker.terminate();
		this.responseHandler.clear();
	}

	/**
	 * Handle an unexpected error by logging it and rejecting all handlers.
	 */
	private handleError(err: Error) {
		this.responseHandler.handleError(err);
	}
}
