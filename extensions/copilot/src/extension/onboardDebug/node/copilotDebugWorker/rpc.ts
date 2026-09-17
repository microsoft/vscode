/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Duplex } from 'stream';
import type { IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { StreamSplitter } from './streamSplitter';

// JSON-RPC request object
interface Request {
	id: number;
	method: string;
	params?: any;
}

// JSON-RPC response object
interface Response {
	id: number;
	result?: any;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

export interface ISimpleRPC extends IDisposable {
	registerMethod(method: string, handler: (params: any) => Promise<any>): void;
	callMethod(method: string, params?: any): Promise<any>;
}

const terminator = process.platform === 'win32' ? '\r\n' : '\n';

export class SimpleRPC implements ISimpleRPC {
	private idCounter: number;
	private methods = new Map<string, (...params: any[]) => Promise<any>>();
	private pendingRequests = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>();
	private didEnd?: boolean;

	public readonly ended: Promise<void>;

	constructor(private readonly stream: Duplex) {
		this.idCounter = 0;
		this.stream.pipe(new StreamSplitter('\n')).on('data', d => this.handleData(d));
		this.ended = new Promise<void>((resolve) => this.stream.on('end', () => {
			this.didEnd = true;
			resolve();
		}));
	}

	public registerMethod(method: string, handler: (params: any) => Promise<any> | any) {
		this.methods.set(method, handler);
	}

	public async callMethod(method: string, params?: any): Promise<any> {
		const id = this.idCounter++;
		const request: Request = { id, method, params, };
		const promise = new Promise<any>((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
		});
		this.stream.write(JSON.stringify(request) + terminator);
		return Promise.race([promise, this.ended]);
	}

	public dispose() {
		this.didEnd = true;
		this.stream.end();
		for (const { reject } of this.pendingRequests.values()) {
			reject(new Error('RPC connection closed'));
		}
		this.pendingRequests.clear();
	}

	private async handleData(data: Buffer) {
		// -1 to remove trailing split match
		const incoming: Response | Request = JSON.parse(data.toString());

		if (!('method' in incoming)) {
			const { id, result, error } = incoming;
			const handler = this.pendingRequests.get(id);
			this.pendingRequests.delete(id);
			if (error !== undefined) {
				handler?.reject(new Error(error.message));
			} else {
				handler?.resolve(result);
			}
		} else {
			const { id, method, params } = incoming;
			const response: Response = { id };

			try {
				if (this.methods.has(method)) {
					const result = await this.methods.get(method)!(params);
					response.result = result;
				} else {
					throw new Error(`Method not found: ${method}`);
				}
			} catch (error) {
				response.error = {
					code: -1,
					message: String(error.stack || error),
				};
			}

			if (!this.didEnd) {
				this.stream.write(JSON.stringify(response) + terminator);
			}
		}
	}
}
