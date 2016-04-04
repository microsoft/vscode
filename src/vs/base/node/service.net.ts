/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import net = require('net');
import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { Server as IPCServer, Client as IPCClient, IServiceCtor, IServiceMap, IMessagePassingProtocol, IClient } from 'vs/base/common/service';
import { TPromise } from 'vs/base/common/winjs.base';

function bufferIndexOf(buffer: Buffer, value: number, start = 0) {
	while (start < buffer.length && buffer[start] !== value) {
		start++;
	}

	return start;
}

class Protocol implements IMessagePassingProtocol {

	private static Boundary = new Buffer([0]);
	private buffer: Buffer;

	constructor(private socket: net.Socket) {
		this.buffer = null;
	}

	public send(message: any): void {
		this.socket.write(JSON.stringify(message));
		this.socket.write(Protocol.Boundary);
	}

	public onMessage(callback: (message: any) => void): void {
		this.socket.on('data', (data: Buffer) => {
			let lastIndex = 0;
			let index = 0;

			while ((index = bufferIndexOf(data, 0, lastIndex)) < data.length) {
				const dataToParse = data.slice(lastIndex, index);

				if (this.buffer) {
					callback(JSON.parse(Buffer.concat([this.buffer, dataToParse]).toString('utf8')));
					this.buffer = null;
				} else {
					callback(JSON.parse(dataToParse.toString('utf8')));
				}

				lastIndex = index + 1;
			}

			if (index - lastIndex > 0) {
				const dataToBuffer = data.slice(lastIndex, index);

				if (this.buffer) {
					this.buffer = Buffer.concat([this.buffer, dataToBuffer]);
				} else {
					this.buffer = dataToBuffer;
				}
			}
		});
	}
}

export class Server implements IDisposable {

	private services: IServiceMap;

	constructor(private server: net.Server) {
		this.services = Object.create(null);

		this.server.on('connection', (socket: net.Socket) => {
			const ipcServer = new IPCServer(new Protocol(socket));

			Object.keys(this.services)
				.forEach(name => ipcServer.registerService(name, this.services[name]));

			socket.once('close', () => ipcServer.dispose());
		});
	}

	registerService<TService>(serviceName: string, service: TService) {
		this.services[serviceName] = service;
	}

	dispose(): void {
		this.services = null;
		this.server.close();
		this.server = null;
	}
}

export class Client implements IDisposable, IClient {

	private ipcClient: IPCClient;
	private _onClose = new Emitter<void>();
	get onClose(): Event<void> { return this._onClose.event; }

	constructor(private socket: net.Socket) {
		this.ipcClient = new IPCClient(new Protocol(socket));
		socket.once('close', () => this._onClose.fire());
	}

	getService<TService>(serviceName: string, serviceCtor: IServiceCtor<TService>): TService {
		return this.ipcClient.getService(serviceName, serviceCtor);
	}

	dispose(): void {
		this.socket.end();
		this.socket = null;
		this.ipcClient = null;
	}
}

export function serve(port: number): TPromise<Server>;
export function serve(namedPipe: string): TPromise<Server>;
export function serve(hook: any): TPromise<Server> {
	return new TPromise<Server>((c, e) => {
		const server = net.createServer();

		server.on('error', e);
		server.listen(hook, () => {
			server.removeListener('error', e);
			c(new Server(server));
		});
	});
}

export function connect(port: number): TPromise<Client>;
export function connect(namedPipe: string): TPromise<Client>;
export function connect(hook: any): TPromise<Client> {
	return new TPromise<Client>((c, e) => {
		const socket = net.createConnection(hook, () => {
			socket.removeListener('error', e);
			c(new Client(socket));
		});

		socket.once('error', e);
	});
}