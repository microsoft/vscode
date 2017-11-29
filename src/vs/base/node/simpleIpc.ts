/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';

export async function createServer(ipcHandlePrefix: string, onRequest: (req: http.ServerRequest, res: http.ServerResponse) => Promise<void> | void) {
	const buffer = await randomBytes(20);
	const nonce = buffer.toString('hex');
	const ipcHandlePath = getIPCHandlePath(`${ipcHandlePrefix}-${nonce}`);
	const server = new Server(ipcHandlePath, onRequest);
	server.listen();
	return server;
}

export class Server {

	public server: http.Server;

	constructor(public ipcHandlePath: string, onRequest: (req: http.ServerRequest, res: http.ServerResponse) => Promise<void> | void) {
		this.server = http.createServer((req, res) => {
			Promise.resolve(onRequest(req, res))
				.catch((err: any) => console.error(err && err.message || err));
		});
		this.server.on('error', err => console.error(err));
	}

	listen() {
		this.server.listen(this.ipcHandlePath);
	}

	dispose(): void {
		this.server.close();
	}
}

export async function readJSON<T>(req: http.ServerRequest) {
	return new Promise<T>((resolve, reject) => {
		const chunks: string[] = [];
		req.setEncoding('utf8');
		req.on('data', (d: string) => chunks.push(d));
		req.on('error', (err: Error) => reject(err));
		req.on('end', () => {
			const data = JSON.parse(chunks.join(''));
			resolve(data);
		});
	});
}

export async function sendData(socketPath: string, data: string) {
	return new Promise<http.IncomingMessage>((resolve, reject) => {
		const opts: http.RequestOptions = {
			socketPath,
			path: '/',
			method: 'POST'
		};

		const req = http.request(opts, res => resolve(res));
		req.on('error', (err: Error) => reject(err));
		req.write(data);
		req.end();
	});
}

async function randomBytes(size: number) {
	return new Promise<Buffer>((resolve, reject) => {
		crypto.randomBytes(size, (err, buf) => {
			if (err) {
				reject(err);
			} else {
				resolve(buf);
			}
		});
	});
}

function getIPCHandlePath(id: string): string {
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\${id}-sock`;
	}

	if (process.env['XDG_RUNTIME_DIR']) {
		return path.join(process.env['XDG_RUNTIME_DIR']!, `${id}.sock`);
	}

	return path.join(os.tmpdir(), `${id}.sock`);
}

export class Queue<T> {

	private messages: T[] = [];
	private dequeueRequest?: {
		resolve: (value: T[]) => void;
		reject: (err: any) => void;
	};

	public push(message: T) {
		this.messages.push(message);
		if (this.dequeueRequest) {
			this.dequeueRequest.resolve(this.messages);
			this.dequeueRequest = undefined;
			this.messages = [];
		}
	}

	public async dequeue() {
		if (this.messages.length) {
			const messages = this.messages;
			this.messages = [];
			return messages;
		}
		if (this.dequeueRequest) {
			this.dequeueRequest.resolve([]);
		}
		return new Promise<T[]>((resolve, reject) => {
			this.dequeueRequest = { resolve, reject };
		});
	}
}