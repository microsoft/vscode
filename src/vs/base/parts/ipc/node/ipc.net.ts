/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { Server as IPCServer, Client as IPCClient, IMessagePassingProtocol, IServer, IClient, IChannel } from 'vs/base/parts/ipc/common/ipc';

function bufferIndexOf(buffer: Buffer, value: number, start = 0) {
	while (start < buffer.length && buffer[start] !== value) {
		start++;
	}

	return start;
}

class Protocol implements IMessagePassingProtocol {

	private static Boundary = new Buffer([0]);
	private buffer: Buffer;

	constructor(private socket: Socket) {
		this.buffer = null;
	}

	public send(message: any): void {
		try {
			this.socket.write(JSON.stringify(message));
			this.socket.write(Protocol.Boundary);
		} catch (e) {
			// noop
		}
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

export class Server implements IServer, IDisposable {

	private channels: { [name: string]: IChannel };

	constructor(private server: NetServer) {
		this.channels = Object.create(null);

		this.server.on('connection', (socket: Socket) => {
			const ipcServer = new IPCServer(new Protocol(socket));

			Object.keys(this.channels)
				.forEach(name => ipcServer.registerChannel(name, this.channels[name]));

			socket.once('close', () => ipcServer.dispose());
		});
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.channels[channelName] = channel;
	}

	dispose(): void {
		this.channels = null;
		this.server.close();
		this.server = null;
	}
}

export class Client implements IClient, IDisposable {

	private ipcClient: IPCClient;
	private _onClose = new Emitter<void>();
	get onClose(): Event<void> { return this._onClose.event; }

	constructor(private socket: Socket) {
		this.ipcClient = new IPCClient(new Protocol(socket));
		socket.once('close', () => this._onClose.fire());
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.ipcClient.getChannel(channelName) as T;
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
		const server = createServer();

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
		const socket = createConnection(hook, () => {
			socket.removeListener('error', e);
			c(new Client(socket));
		});

		socket.once('error', e);
	});
}