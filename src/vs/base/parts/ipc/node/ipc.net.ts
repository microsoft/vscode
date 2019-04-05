/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Socket, Server as NetServer, createConnection, createServer } from 'net';
import { Event } from 'vs/base/common/event';
import { ClientConnectionEvent, IPCServer } from 'vs/base/parts/ipc/common/ipc';
import { join } from 'vs/base/common/path';
import { tmpdir } from 'os';
import { generateUuid } from 'vs/base/common/uuid';
import { IDisposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';
import { ISocket, Protocol, Client } from 'vs/base/parts/ipc/common/ipc.net';

export class NodeSocket implements ISocket {
	public readonly socket: Socket;

	constructor(socket: Socket) {
		this.socket = socket;
	}

	public dispose(): void {
		this.socket.destroy();
	}

	public onData(_listener: (e: VSBuffer) => void): IDisposable {
		const listener = (buff: Buffer) => _listener(VSBuffer.wrap(buff));
		this.socket.on('data', listener);
		return {
			dispose: () => this.socket.off('data', listener)
		};
	}

	public onClose(listener: () => void): IDisposable {
		this.socket.on('close', listener);
		return {
			dispose: () => this.socket.off('close', listener)
		};
	}

	public onEnd(listener: () => void): IDisposable {
		this.socket.on('end', listener);
		return {
			dispose: () => this.socket.off('end', listener)
		};
	}

	public write(buffer: VSBuffer): void {
		// return early if socket has been destroyed in the meantime
		if (this.socket.destroyed) {
			return;
		}

		// we ignore the returned value from `write` because we would have to cached the data
		// anyways and nodejs is already doing that for us:
		// > https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
		// > However, the false return value is only advisory and the writable stream will unconditionally
		// > accept and buffer chunk even if it has not not been allowed to drain.
		this.socket.write(<Buffer>buffer.buffer);
	}

	public end(): void {
		this.socket.end();
	}
}

export function generateRandomPipeName(): string {
	const randomSuffix = generateUuid();
	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
	} else {
		// Mac/Unix: use socket file
		return join(tmpdir(), `vscode-ipc-${randomSuffix}.sock`);
	}
}

export class Server extends IPCServer {

	private static toClientConnectionEvent(server: NetServer): Event<ClientConnectionEvent> {
		const onConnection = Event.fromNodeEventEmitter<Socket>(server, 'connection');

		return Event.map(onConnection, socket => ({
			protocol: new Protocol(new NodeSocket(socket)),
			onDidClientDisconnect: Event.once(Event.fromNodeEventEmitter<void>(socket, 'close'))
		}));
	}

	private server: NetServer | null;

	constructor(server: NetServer) {
		super(Server.toClientConnectionEvent(server));
		this.server = server;
	}

	dispose(): void {
		super.dispose();
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}
}

export function serve(port: number): Promise<Server>;
export function serve(namedPipe: string): Promise<Server>;
export function serve(hook: any): Promise<Server> {
	return new Promise<Server>((c, e) => {
		const server = createServer();

		server.on('error', e);
		server.listen(hook, () => {
			server.removeListener('error', e);
			c(new Server(server));
		});
	});
}

export function connect(options: { host: string, port: number }, clientId: string): Promise<Client>;
export function connect(port: number, clientId: string): Promise<Client>;
export function connect(namedPipe: string, clientId: string): Promise<Client>;
export function connect(hook: any, clientId: string): Promise<Client> {
	return new Promise<Client>((c, e) => {
		const socket = createConnection(hook, () => {
			socket.removeListener('error', e);
			c(Client.fromSocket(new NodeSocket(socket), clientId));
		});

		socket.once('error', e);
	});
}
