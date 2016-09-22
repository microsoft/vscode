/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter, once } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { ChannelServer, ChannelClient, IMessagePassingProtocol, IChannelServer, IChannelClient, IRoutingChannelClient, IClientRouter, IChannel } from 'vs/base/parts/ipc/common/ipc';

function bufferIndexOf(buffer: Buffer, value: number, start = 0) {
	while (start < buffer.length && buffer[start] !== value) {
		start++;
	}

	return start;
}

class Protocol implements IMessagePassingProtocol {

	private static Boundary = new Buffer([0]);

	private _onMessage: Event<any>;
	get onMessage(): Event<any> { return this._onMessage; }

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

		this._onMessage = emitter.event;
	}

	public send(message: any): void {
		try {
			this.socket.write(JSON.stringify(message));
			this.socket.write(Protocol.Boundary);
		} catch (e) {
			// noop
		}
	}
}

class RoutingChannelClient implements IRoutingChannelClient, IDisposable {

	private ipcClients: { [id: string]: ChannelClient; };
	private onClientAdded = new Emitter();

	constructor() {
		this.ipcClients = Object.create(null);
	}

	add(id: string, client: ChannelClient): void {
		this.ipcClients[id] = client;
		this.onClientAdded.fire();
	}

	remove(id: string): void {
		delete this.ipcClients[id];
	}

	private getClient(clientId: string): TPromise<IChannelClient> {
		const getClientFn = (clientId: string, c: (client: IChannelClient) => void): boolean => {
			let client = this.ipcClients[clientId];
			if (client) {
				c(client);
				return true;
			}
			return false;
		};
		return new TPromise<IChannelClient>((c, e) => {
			if (!getClientFn(clientId, c)) {
				let disposable = this.onClientAdded.event(() => {
					if (getClientFn(clientId, c)) {
						disposable.dispose();
					}
				});
			}
		});
	}

	getChannel<T extends IChannel>(channelName: string, router: IClientRouter): T {
		const call = (command: string, arg: any) => {
			const id = router.routeCall(command, arg);
			if (!id) {
				return TPromise.wrapError('Client id should be provided');
			}
			return this.getClient(id).then(client => client.getChannel(channelName).call(command, arg));
		};
		return { call } as T;
	}

	dispose() {
		this.ipcClients = null;
		this.onClientAdded.dispose();
	}
}

// TODO@joao: move multi channel implementation down to ipc
export class Server implements IChannelServer, IRoutingChannelClient, IDisposable {

	private channels: { [name: string]: IChannel };
	private router: RoutingChannelClient;

	constructor(private server: NetServer) {
		this.channels = Object.create(null);
		this.router = new RoutingChannelClient();

		this.server.on('connection', (socket: Socket) => {
			const protocol = new Protocol(socket);
			const onFirstMessage = once(protocol.onMessage);

			onFirstMessage(id => {
				const channelServer = new ChannelServer(protocol);

				Object.keys(this.channels)
					.forEach(name => channelServer.registerChannel(name, this.channels[name]));

				const channelClient = new ChannelClient(protocol);
				this.router.add(id, channelClient);

				socket.once('close', () => {
					channelClient.dispose();
					this.router.remove(id);
					channelServer.dispose();
				});
			});
		});
	}

	getChannel<T extends IChannel>(channelName: string, router: IClientRouter): T {
		return this.router.getChannel<T>(channelName, router);
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.channels[channelName] = channel;
	}

	dispose(): void {
		this.router.dispose();
		this.router = null;
		this.channels = null;
		this.server.close();
		this.server = null;
	}
}

export class Client implements IChannelClient, IChannelServer, IDisposable {

	private channelClient: ChannelClient;
	private channelServer: ChannelServer;

	private _onClose = new Emitter<void>();
	get onClose(): Event<void> { return this._onClose.event; }

	constructor(private socket: Socket, id: string) {
		const protocol = new Protocol(socket);
		protocol.send(id);

		this.channelClient = new ChannelClient(protocol);
		this.channelServer = new ChannelServer(protocol);
		socket.once('close', () => this._onClose.fire());
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.channelClient.getChannel(channelName) as T;
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.channelServer.registerChannel(channelName, channel);
	}

	dispose(): void {
		this.socket.end();
		this.socket = null;
		this.channelClient = null;
		this.channelServer.dispose();
		this.channelServer = null;
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

export function connect(port: number, clientId: string): TPromise<Client>;
export function connect(namedPipe: string, clientId: string): TPromise<Client>;
export function connect(hook: any, clientId: string): TPromise<Client> {
	return new TPromise<Client>((c, e) => {
		const socket = createConnection(hook, () => {
			socket.removeListener('error', e);
			c(new Client(socket, clientId));
		});

		socket.once('error', e);
	});
}