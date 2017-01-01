/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, once, mapEvent } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { IMessagePassingProtocol, ClientConnectionEvent, IPCServer, IPCClient } from 'vs/base/parts/ipc/common/ipc';

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

export class Server extends IPCServer {

	private static toClientConnectionEvent(server: NetServer): Event<ClientConnectionEvent> {
		const onConnection = fromEventEmitter<Socket>(server, 'connection');

		return mapEvent(onConnection, socket => ({
			protocol: new Protocol(socket),
			onDidClientDisconnect: once(fromEventEmitter<void>(socket, 'close'))
		}));
	}

	constructor(private server: NetServer) {
		super(Server.toClientConnectionEvent(server));
	}

	dispose(): void {
		super.dispose();
		this.server.close();
		this.server = null;
	}
}

export class Client extends IPCClient {

	private _onClose = new Emitter<void>();
	get onClose(): Event<void> { return this._onClose.event; }

	constructor(private socket: Socket, id: string) {
		super(new Protocol(socket), id);
		socket.once('close', () => this._onClose.fire());
	}

	dispose(): void {
		super.dispose();
		this.socket.end();
		this.socket = null;
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