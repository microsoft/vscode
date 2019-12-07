/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { toDisposable } from '../util';
import * as path from 'path';
import * as http from 'http';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';

function getIPCHandlePath(nonce: string): string {
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-git-ipc-${nonce}-sock`;
	}

	if (process.env['XDG_RUNTIME_DIR']) {
		return path.join(process.env['XDG_RUNTIME_DIR'] as string, `vscode-git-ipc-${nonce}.sock`);
	}

	return path.join(os.tmpdir(), `vscode-git-ipc-${nonce}.sock`);
}

export interface IIPCHandler {
	handle(request: any): Promise<any>;
}

export async function createIPCServer(): Promise<IIPCServer> {
	const server = http.createServer();
	const buffer = await new Promise<Buffer>((c, e) => crypto.randomBytes(20, (err, buf) => err ? e(err) : c(buf)));
	const nonce = buffer.toString('hex');
	const ipcHandlePath = getIPCHandlePath(nonce);

	return new Promise((c, e) => {
		try {
			server.on('error', err => e(err));
			server.listen(ipcHandlePath);
			c(new IPCServer(server, ipcHandlePath));
		} catch (err) {
			e(err);
		}
	});
}

export interface IIPCServer extends Disposable {
	readonly ipcHandlePath: string | undefined;
	getEnv(): any;
	registerHandler(name: string, handler: IIPCHandler): Disposable;
}

class IPCServer implements IIPCServer, Disposable {

	private handlers = new Map<string, IIPCHandler>();
	get ipcHandlePath(): string { return this._ipcHandlePath; }

	constructor(private server: http.Server, private _ipcHandlePath: string) {
		this.server.on('request', this.onRequest.bind(this));
	}

	registerHandler(name: string, handler: IIPCHandler): Disposable {
		this.handlers.set(`/${name}`, handler);
		return toDisposable(() => this.handlers.delete(name));
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (!req.url) {
			console.warn(`Request lacks url`);
			return;
		}

		const handler = this.handlers.get(req.url);

		if (!handler) {
			console.warn(`IPC handler for ${req.url} not found`);
			return;
		}

		const chunks: Buffer[] = [];
		req.on('data', d => chunks.push(d));
		req.on('end', () => {
			const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
			handler.handle(request).then(result => {
				res.writeHead(200);
				res.end(JSON.stringify(result));
			}, () => {
				res.writeHead(500);
				res.end();
			});
		});
	}

	getEnv(): any {
		return { VSCODE_GIT_IPC_HANDLE: this.ipcHandlePath };
	}

	dispose(): void {
		this.handlers.clear();
		this.server.close();

		if (this._ipcHandlePath && process.platform !== 'win32') {
			fs.unlinkSync(this._ipcHandlePath);
		}
	}
}
