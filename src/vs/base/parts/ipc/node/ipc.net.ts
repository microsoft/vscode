/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { Server as IPCServer, Client as IPCClient, IMessagePassingProtocol, IServer, IClient, IChannel } from 'vs/base/parts/ipc/common/ipc';

function bufferIndexOf(buffer: Buffer, value: number, start = 0) {
	while (start < buffer.length && buffer[start] !== value) {
		start++;
	}

	return start;
}

class Protocol implements IMessagePassingProtocol {

	private static Boundary = new Buffer([0]);
	private onMessageEvent: Event<any>;

	constructor(private socket: Socket) {
		let buffer = null;
		const emitter = new Emitter<any>();
		const onRawData = fromEventEmitter(socket, 'data', data => data);

		onRawData((data: Buffer) => {
			let lastIndex = 0;
			let index = 0;

			while ((index = bufferIndexOf(data, 0, lastIndex)) < data.length) {
				const dataToParse = data.slice(lastIndex, index);

				if (buffer) {
					emitter.fire(JSON.parse(Buffer.concat([buffer, dataToParse]).toString('utf8')));
					buffer = null;
				} else {
					emitter.fire(JSON.parse(dataToParse.toString('utf8')));
				}

				lastIndex = index + 1;
			}

			if (index - lastIndex > 0) {
				const dataToBuffer = data.slice(lastIndex, index);

				if (buffer) {
					buffer = Buffer.concat([buffer, dataToBuffer]);
				} else {
					buffer = dataToBuffer;
				}
			}
		});

		this.onMessageEvent = emitter.event;
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
		this.onMessageEvent(callback);
	}
}

// TODO: NAME IT BETTER
export interface IClientPicker {
	getClientId(): string;
}

// TODO: NAME IT BETTER
class ClientMultiplexer implements IClient {

	private ipcClients: { [id:string]: IPCClient; };

	constructor(private clientPicker: IClientPicker) {
		this.ipcClients = Object.create(null);
	}

	add(id: string, client: IPCClient): void {
		this.ipcClients[id] = client;
	}

	remove(id: string): void {
		delete this.ipcClients[id];
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return {
			call: (command: string, arg: any) => {
				const id = this.clientPicker.getClientId();
				const client = this.ipcClients[id];

				if (!client) {
					return TPromise.wrapError('Client unknown');
				}

				return client.getChannel(channelName).call(command, arg);
			}
		} as T;
	}
}

// TODO: name it better!
export class Server implements IServer, IClient, IDisposable {

	private channels: { [name: string]: IChannel };
	private clientMultiplexer: ClientMultiplexer;

	constructor(private server: NetServer, private clientPicker: IClientPicker) {
		this.channels = Object.create(null);
		this.clientMultiplexer = new ClientMultiplexer(clientPicker);

		this.server.on('connection', (socket: Socket) => {
			const protocol = new Protocol(socket);

			let didGetId = false;
			protocol.onMessage(id => {
				if (didGetId) {
					return;
				}

				didGetId = true;

				const ipcServer = new IPCServer(protocol);

				Object.keys(this.channels)
					.forEach(name => ipcServer.registerChannel(name, this.channels[name]));

				const ipcClient = new IPCClient(protocol);
				this.clientMultiplexer.add(id, ipcClient);

				socket.once('close', () => {
					ipcClient.dispose();
					this.clientMultiplexer.remove(id);
					ipcServer.dispose();
				});
			});
		});
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.clientMultiplexer.getChannel<T>(channelName);
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

// TODO: name it!
export class Client implements IClient, IServer, IDisposable {

	private ipcClient: IPCClient;
	private ipcServer: IPCServer;

	private _onClose = new Emitter<void>();
	get onClose(): Event<void> { return this._onClose.event; }

	constructor(private socket: Socket, id: string) {
		const protocol = new Protocol(socket);
		protocol.send(id);

		this.ipcClient = new IPCClient(protocol);
		this.ipcServer = new IPCServer(protocol);
		socket.once('close', () => this._onClose.fire());
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.ipcClient.getChannel(channelName) as T;
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.ipcServer.registerChannel(channelName, channel);
	}

	dispose(): void {
		this.socket.end();
		this.socket = null;
		this.ipcClient = null;
		this.ipcServer.dispose();
		this.ipcServer = null;
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
			c(new Server(server, {
				getClientId: () => ''
			}));
		});
	});
}

export function connect(port: number): TPromise<Client>;
export function connect(namedPipe: string): TPromise<Client>;
export function connect(hook: any): TPromise<Client> {
	return new TPromise<Client>((c, e) => {
		const socket = createConnection(hook, () => {
			socket.removeListener('error', e);
			c(new Client(socket, ''));
		});

		socket.once('error', e);
	});
}