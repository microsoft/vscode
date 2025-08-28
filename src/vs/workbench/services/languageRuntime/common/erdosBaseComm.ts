/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRuntimeClientInstance, RuntimeClientState, RuntimeClientStatus } from './languageRuntimeClientInstance.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISettableObservable } from '../../../../base/common/observableInternal/base.js';

export enum JsonRpcErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	ServerErrorStart = -32000,
	ServerErrorEnd = -32099
}

export interface ErdosCommError {
	code: JsonRpcErrorCode;
	message: string;
	name: string;
	data: any | undefined;
}

export type ErdosCommOptions<T extends string> = {
	[key in T]?: ErdosCommRpcOptions;
};

export interface ErdosCommRpcOptions {
	timeout: number | undefined;
}

class ErdosCommEmitter<T> extends Emitter<T> {
	constructor(readonly name: string, readonly properties: string[]) {
		super();
	}
}

export class ErdosBaseComm extends Disposable {
	private _emitters = new Map<string, ErdosCommEmitter<any>>();
	private _closeEmitter = new Emitter<void>();

	public readonly clientState: ISettableObservable<RuntimeClientState>;
	public readonly clientStatus: ISettableObservable<RuntimeClientStatus>;

	constructor(
		private readonly clientInstance: IRuntimeClientInstance<any, any>,
		private readonly options?: ErdosCommOptions<any>) {
		super();
		this._register(clientInstance);
		this._register(clientInstance.onDidReceiveData((event) => {
			const data = event.data;
			if (data.method === 'working_directory') {
				console.log('WD_TRACE_VSCODE: received working_directory event data:', data);
			}
			const emitter = this._emitters.get(data.method);
			if (emitter) {
				const payload = data.params;
				if (Array.isArray(payload)) {
					const obj: any = {};
					for (let i = 0; i < payload.length; i++) {
						obj[emitter.properties[i]] = payload[i];
					}
					emitter.fire(obj);
				} else if (typeof payload === 'object') {
					emitter.fire(payload);
				} else if (typeof payload === 'undefined') {
					emitter.fire({});
				} else {
					console.warn(`Invalid payload type ${typeof payload} ` +
						`for event '${data.method}' ` +
						`on comm ${this.clientInstance.getClientId()}: ` +
						`${JSON.stringify(payload)} ` +
						`(Expected an object or an array)`);
				}
			} else if (data.method) {
				console.warn(`Dropping event '${data.method}' ` +
					`on comm ${this.clientInstance.getClientId()}: ` +
					`${JSON.stringify(data.params)} ` +
					`(No listeners for event '${data.method}'`);
			}
		}));

		const stateChangeEvent = Event.fromObservable(clientInstance.clientState);
		this._register(stateChangeEvent(state => {
			if (state === RuntimeClientState.Closed) {
				this._closeEmitter.fire();
			}
		}));

		this.onDidClose = this._closeEmitter.event;
		this.clientState = clientInstance.clientState;
		this.clientStatus = clientInstance.clientStatus;
	}

	public onDidClose: Event<void>;

	get clientId(): string {
		return this.clientInstance.getClientId();
	}

	protected createEventEmitter<T>(name: string, properties: string[]): Event<T> {
		const emitter = new ErdosCommEmitter<T>(name, properties);
		this._emitters.set(name, emitter);
		this._register(emitter);
		if (name === 'working_directory') {
			console.log('WD_TRACE_VSCODE: creating working_directory event emitter');
		}
		return emitter.event;
	}

	protected async performRpc<T>(rpcName: string,
		paramNames: Array<string>,
		paramValues: Array<any>): Promise<T> {

		const rpcArgs: any = {};
		for (let i = 0; i < paramNames.length; i++) {
			rpcArgs[paramNames[i]] = paramValues[i];
		}

		const request: any = {
			jsonrpc: '2.0',
			method: rpcName,
		};

		if (paramNames.length > 0) {
			request.params = rpcArgs;
		}

		let response = {} as any;
		try {
			const defaultTimeout = 5000;
			const timeout = (this.options?.[rpcName] && 'timeout' in this.options[rpcName])
				? this.options[rpcName].timeout
				: defaultTimeout;
			response = await this.clientInstance.performRpc(request, timeout, ['result', 'error']);
		} catch (err) {
			const error: ErdosCommError = {
				code: JsonRpcErrorCode.InternalError,
				message: err.message,
				name: err.name,
				data: err,
			};
			throw error;
		}

		if (Object.keys(response).includes('error')) {
			const error = response.error;
			error.name = `RPC Error ${response.error.code}`;
			throw error;
		}

		if (!Object.keys(response).includes('result')) {
			const error: ErdosCommError = {
				code: JsonRpcErrorCode.InternalError,
				message: `Invalid response from ${this.clientInstance.getClientId()}: ` +
					`no 'result' field. ` +
					`(response = ${JSON.stringify(response)})`,
				name: `InvalidResponseError`,
				data: {},
			};

			throw error;
		}

		return response.result;
	}
}
